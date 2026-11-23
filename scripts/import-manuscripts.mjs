// Loads the Al-Qamar manuscripts catalogue into public.manuscripts (the manuscripts migration), for Moon's
// Manuscripts screen. Reads Al-Qamar's cleaned catalogue, one JSON record per line
// ({ id, viewUrl, source_fields, marc21_rda }), and keeps the id, the dromh.org link and the source fields; the MARC
// is left out because the app builds it from the fields. A manuscript already in the table is replaced by the file's
// version; manuscripts not in the file are left as they are.
//
//   node scripts/import-manuscripts.mjs --file <path to dromh_marc21_rda_catalog_v2.jsonl> --dry-run
//       reads the whole file and reports what would be loaded and how big it is; writes nothing
//   node scripts/import-manuscripts.mjs --file <path> --apply
//       loads it, in batches of about 1.5 MB (each batch in one statement, so a failed batch leaves nothing half-done).
//       First checks the database has room (about 175 MB for the whole catalogue); --force skips that check.
//       Running it again is safe: it replaces what is there.
//
// Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID (gfbagczwhvxxstbfrfhu), like the other database scripts.
// Run the migration first (it runs on deploy, or: node scripts/apply-migrations.mjs).

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { sql, quote, token, project } from './supabase-sql.mjs';

const ID_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;
const BATCH_BYTES = 1_500_000;

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const file = arg('--file');
const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--dry-run') ? 'dry-run' : null;
if (!file || !mode) {
  console.error('Usage: node scripts/import-manuscripts.mjs --file <catalog.jsonl> --dry-run | --apply');
  process.exit(2);
}
if (mode === 'apply' && (!token || !project)) {
  console.error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID are required.');
  process.exit(1);
}

// Postgres text and jsonb cannot hold the NUL character.
const clean = (s) => String(s).replace(/\u0000/g, '');

/** One catalogue line as a VALUES row, or why it is skipped. */
export function toRow(line) {
  let rec;
  try { rec = JSON.parse(line); } catch { return { skip: 'not valid JSON' }; }
  const id = String(rec?.id ?? '').trim();
  if (!ID_PATTERN.test(id)) return { skip: `bad id "${id.slice(0, 50)}"` };
  const fields = {};
  for (const [k, v] of Object.entries(rec.source_fields || {})) {
    if (v !== null && v !== undefined && String(v).trim() !== '') fields[clean(k)] = clean(v);
  }
  if (!Object.keys(fields).length) return { skip: `record ${id} has no fields` };
  const viewUrl = typeof rec.viewUrl === 'string' && /^https?:\/\//.test(rec.viewUrl) ? rec.viewUrl : null;
  return { id, sql: `(${quote(id)}, ${viewUrl ? quote(viewUrl) : 'null'}, ${quote(JSON.stringify(fields))}::jsonb)` };
}

const insert = (values) => `insert into public.manuscripts (id, view_url, fields) values\n${values.join(',\n')}
on conflict (id) do update set view_url = excluded.view_url, fields = excluded.fields, imported_at = now();`;

const seen = new Set();
const skipped = [];
let duplicates = 0, loaded = 0, bytes = 0, batches = 0;
let batch = [], batchBytes = 0;
const batchIds = new Set();

async function flush() {
  if (!batch.length) return;
  batches++;
  if (mode === 'apply') {
    await sql(insert(batch));
    console.log(`  batch ${batches}: ${batch.length} manuscripts (${loaded + batch.length} so far)`);
  }
  loaded += batch.length;
  batch = [];
  batchBytes = 0;
  batchIds.clear();
}

// The free plan's database holds 500 MB (MOON_DB_LIMIT_MB, as on the Super Admin's storage card). A test load of
// 20,000 manuscripts took 33 MB with its indexes, so the whole catalogue is about 175 MB: check there is room first.
const BYTES_PER_ROW_ON_DISK = 1700;
if (mode === 'apply' && !process.argv.includes('--force')) {
  let rowsToLoad = 0;
  for await (const line of createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })) if (line.trim()) rowsToLoad++;
  const limitMb = Math.max(Number(process.env.MOON_DB_LIMIT_MB) || 500, 1);
  const [{ used, have }] = await sql(`select pg_database_size(current_database())::bigint used,
    (select count(*) from public.manuscripts)::bigint have`);
  const after = Number(used) + Math.max(0, rowsToLoad - Number(have)) * BYTES_PER_ROW_ON_DISK;
  console.log(`Database: ${(Number(used) / 1e6).toFixed(0)} MB used now, about ${(after / 1e6).toFixed(0)} MB after the load, of ${limitMb} MB.`);
  if (after > limitMb * 1024 * 1024 * 0.9) {
    console.error('That would leave less than a tenth of the plan free, so nothing was loaded. Free some space or raise the plan, or pass --force.');
    process.exit(1);
  }
}

const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
for await (const line of lines) {
  if (!line.trim()) continue;
  const row = toRow(line);
  if (row.skip) { skipped.push(row.skip); continue; }
  // The same id twice in the file: the later line wins. One statement may not touch a row twice, so a repeat
  // starts a new batch.
  if (seen.has(row.id)) duplicates++;
  seen.add(row.id);
  const size = Buffer.byteLength(row.sql);
  if (batchBytes + size > BATCH_BYTES || batchIds.has(row.id)) await flush();
  batch.push(row.sql);
  batchIds.add(row.id);
  batchBytes += size;
  bytes += size;
}
await flush();

console.log(`\n${mode === 'apply' ? 'Loaded' : 'Would load'} ${loaded} manuscripts (${seen.size} distinct ids) in ${batches} batches, ${(bytes / 1e6).toFixed(1)} MB of SQL.`);
if (duplicates) console.log(`${duplicates} ids appear more than once in the file; the last one is kept.`);
if (skipped.length) {
  console.log(`${skipped.length} lines skipped, for example:`);
  for (const s of skipped.slice(0, 10)) console.log(`  - ${s}`);
}
if (mode === 'apply') {
  const [{ n, size }] = await sql(`select count(*)::int n, pg_size_pretty(pg_total_relation_size('public.manuscripts')) size from public.manuscripts`);
  console.log(`public.manuscripts now has ${n} rows, ${size} on disk.`);
}
