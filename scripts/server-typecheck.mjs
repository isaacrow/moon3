// Type-checks the server (Deno) and fails when there are MORE errors than the recorded baseline, so the
// old errors can be cleaned up over time but no new one can be added. When errors go down, lower the
// number in scripts/server-typecheck-baseline.txt in the same pull request ("ratchet").
//   node scripts/server-typecheck.mjs            check
//   node scripts/server-typecheck.mjs --update   write the current count as the new baseline
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const baselineFile = new URL('./server-typecheck-baseline.txt', import.meta.url);
const run = spawnSync('npx', ['-y', 'deno@2', 'check', '--node-modules-dir=none', 'supabase/functions/server/index.tsx'],
  { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
const out = `${run.stdout || ''}\n${run.stderr || ''}`.replace(/\x1b\[[0-9;]*m/g, '');
const m = out.match(/Found (\d+) errors?/);
const found = m ? Number(m[1]) : (run.status === 0 ? 0 : NaN);
if (Number.isNaN(found)) { console.error(out.slice(-3000)); console.error('Could not read the number of errors from deno check.'); process.exit(2); }

if (process.argv.includes('--update')) { writeFileSync(baselineFile, `${found}\n`); console.log(`Baseline set to ${found}`); process.exit(0); }
const baseline = Number(readFileSync(baselineFile, 'utf8').trim());
console.log(`Server type errors: ${found} (baseline ${baseline})`);
if (found > baseline) {
  console.error(out.split('\n').filter((l) => /error|TS\d+/.test(l)).slice(0, 40).join('\n'));
  console.error(`\n${found - baseline} new server type error(s). Fix them; the baseline only goes down.`);
  process.exit(1);
}
if (found < baseline) console.log(`Fewer errors than the baseline: run "node scripts/server-typecheck.mjs --update" and commit the lower number.`);
