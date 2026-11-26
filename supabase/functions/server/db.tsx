/**
 * 🗄️ MOON Database Layer - PostgreSQL Direct Access
 * 
 * Replaces all kv_store usage with proper relational queries.
 * Uses Supabase client to query the new schema:
 *   records, record_versions, triples, named_graphs,
 *   authorities, audit_log, institutions, moon_users,
 *   field_templates, ai_sessions, discovery_cache,
 *   ai_provider_health, moon_kv
 * 
 * The old kv_store_49c0e13c is kept for backward compatibility
 * but no new code should use it.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { AsyncLocalStorage } from "node:async_hooks";

// ─── Who is asking (plan step H5) ────────────────────────────
// Each request runs in its own store (index.tsx); getSession names the signed-in person there, and every database
// request then carries it as x-moon-actor, which the history trigger (change_history) records as who changed what.
const actorStore = new AsyncLocalStorage<{ actor?: string }>();
export function withActorStore<T>(fn: () => T): T {
  return actorStore.run({}, fn);
}
export function setActor(username: string): void {
  const store = actorStore.getStore();
  if (store) store.actor = /^[\x20-\x7E]{1,120}$/.test(username) ? username : encodeURIComponent(username).slice(0, 120);
}
const actorFetch: typeof fetch = (input, init) => {
  const actor = actorStore.getStore()?.actor;
  if (!actor) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set("x-moon-actor", actor);
  return fetch(input, { ...init, headers });
};

// ─── Singleton Client ────────────────────────────────────────
let _client: ReturnType<typeof createClient> | null = null;

export function getClient() {
  if (!_client) {
    _client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { fetch: actorFetch } },
    );
  }
  return _client;
}

// ─── Generic helpers ─────────────────────────────────────────

/** Insert a row, return the inserted data */
export async function insert<T extends Record<string, any>>(
  table: string,
  data: T,
): Promise<T> {
  const sb = getClient();
  const { data: result, error } = await sb.from(table).insert(data).select().single();
  if (error) throw new Error(`[DB] insert into ${table} failed: ${error.message}`);
  return result as T;
}

/** Upsert a row (insert or update on conflict) */
export async function upsert<T extends Record<string, any>>(
  table: string,
  data: T,
  onConflict?: string,
): Promise<T> {
  const sb = getClient();
  const q = onConflict
    ? sb.from(table).upsert(data, { onConflict }).select().single()
    : sb.from(table).upsert(data).select().single();
  const { data: result, error } = await q;
  if (error) throw new Error(`[DB] upsert into ${table} failed: ${error.message}`);
  return result as T;
}

/** Select a single row by primary key */
export async function getById<T>(
  table: string,
  id: string | number,
  idColumn = "id",
): Promise<T | null> {
  const sb = getClient();
  const { data, error } = await sb.from(table).select("*").eq(idColumn, id).maybeSingle();
  if (error) throw new Error(`[DB] getById from ${table} failed: ${error.message}`);
  return data as T | null;
}

/** Select rows with optional filters, ordering, and pagination */
export async function query<T>(
  table: string,
  opts?: {
    filters?: Record<string, any>;
    notFilters?: Record<string, any>;
    order?: { column: string; ascending?: boolean };
    limit?: number;
    offset?: number;
    select?: string;
    ilike?: { column: string; pattern: string };
  },
): Promise<T[]> {
  const sb = getClient();
  let q = sb.from(table).select(opts?.select || "*");

  if (opts?.filters) {
    for (const [col, val] of Object.entries(opts.filters)) {
      if (val !== undefined && val !== null) {
        q = q.eq(col, val);
      }
    }
  }
  if (opts?.notFilters) {
    for (const [col, val] of Object.entries(opts.notFilters)) {
      q = q.neq(col, val);
    }
  }
  if (opts?.ilike) {
    q = q.ilike(opts.ilike.column, opts.ilike.pattern);
  }
  if (opts?.order) {
    q = q.order(opts.order.column, { ascending: opts.order.ascending ?? false });
  }
  if (opts?.limit) {
    q = q.limit(opts.limit);
  }
  if (opts?.offset) {
    q = q.range(opts.offset, opts.offset + (opts.limit || 50) - 1);
  }

  const { data, error } = await q;
  if (error) throw new Error(`[DB] query on ${table} failed: ${error.message}`);
  return (data || []) as T[];
}

/** Update rows matching filters */
export async function update<T extends Record<string, any>>(
  table: string,
  id: string | number,
  data: Partial<T>,
  idColumn = "id",
): Promise<T> {
  const sb = getClient();
  const { data: result, error } = await sb
    .from(table)
    .update(data)
    .eq(idColumn, id)
    .select()
    .single();
  if (error) throw new Error(`[DB] update on ${table} failed: ${error.message}`);
  return result as T;
}

/** Delete rows by id */
export async function del(
  table: string,
  id: string | number,
  idColumn = "id",
): Promise<void> {
  const sb = getClient();
  const { error } = await sb.from(table).delete().eq(idColumn, id);
  if (error) throw new Error(`[DB] delete from ${table} failed: ${error.message}`);
}

/** Delete rows matching a filter */
export async function delWhere(
  table: string,
  filters: Record<string, any>,
): Promise<void> {
  const sb = getClient();
  let q = sb.from(table).delete();
  for (const [col, val] of Object.entries(filters)) {
    q = q.eq(col, val);
  }
  const { error } = await q;
  if (error) throw new Error(`[DB] delWhere on ${table} failed: ${error.message}`);
}

/** Count rows matching filters */
export async function count(
  table: string,
  filters?: Record<string, any>,
): Promise<number> {
  const sb = getClient();
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (filters) {
    for (const [col, val] of Object.entries(filters)) {
      q = q.eq(col, val);
    }
  }
  const { count: n, error } = await q;
  if (error) throw new Error(`[DB] count on ${table} failed: ${error.message}`);
  return n || 0;
}

/** Full-text search using trigram similarity (ilike) */
export async function search<T>(
  table: string,
  column: string,
  searchTerm: string,
  opts?: {
    filters?: Record<string, any>;
    limit?: number;
    order?: { column: string; ascending?: boolean };
  },
): Promise<T[]> {
  const sb = getClient();
  let q = sb.from(table).select("*").ilike(column, `%${searchTerm}%`);
  if (opts?.filters) {
    for (const [col, val] of Object.entries(opts.filters)) {
      q = q.eq(col, val);
    }
  }
  if (opts?.order) {
    q = q.order(opts.order.column, { ascending: opts.order.ascending ?? false });
  }
  if (opts?.limit) {
    q = q.limit(opts.limit);
  }
  const { data, error } = await q;
  if (error) throw new Error(`[DB] search on ${table}.${column} failed: ${error.message}`);
  return (data || []) as T[];
}

// ─── Triple Store helpers ────────────────────────────────────

export interface Triple {
  id?: number;
  subject: string;
  predicate: string;
  object_value: string;
  object_type: "uri" | "literal" | "blank";
  object_lang?: string;
  object_datatype?: string;
  graph_uri: string;
  record_id?: string;
  institution_id?: string;
  created_at?: string;
}

/** Insert multiple triples in a batch */
export async function insertTriples(triples: Omit<Triple, "id">[]): Promise<void> {
  if (triples.length === 0) return;
  const sb = getClient();
  // Insert in chunks of 500 to avoid payload limits
  const chunkSize = 500;
  for (let i = 0; i < triples.length; i += chunkSize) {
    const chunk = triples.slice(i, i + chunkSize);
    const { error } = await sb.from("triples").insert(chunk);
    if (error) throw new Error(`[DB] insertTriples failed: ${error.message}`);
  }
}

/** Delete all triples for a record */
export async function deleteTriplesByRecord(recordId: string): Promise<void> {
  const sb = getClient();
  const { error } = await sb.from("triples").delete().eq("record_id", recordId);
  if (error) throw new Error(`[DB] deleteTriplesByRecord failed: ${error.message}`);
}

/** Query triples by subject */
export async function triplesBySubject(subject: string, graphUri?: string): Promise<Triple[]> {
  const sb = getClient();
  let q = sb.from("triples").select("*").eq("subject", subject);
  if (graphUri) q = q.eq("graph_uri", graphUri);
  const { data, error } = await q;
  if (error) throw new Error(`[DB] triplesBySubject failed: ${error.message}`);
  return (data || []) as Triple[];
}

/** Query triples by predicate + object (reverse lookup) */
export async function triplesByPredicateObject(
  predicate: string,
  objectValue: string,
): Promise<Triple[]> {
  const sb = getClient();
  const { data, error } = await sb
    .from("triples")
    .select("*")
    .eq("predicate", predicate)
    .eq("object_value", objectValue);
  if (error) throw new Error(`[DB] triplesByPredicateObject failed: ${error.message}`);
  return (data || []) as Triple[];
}

/** Query triples by graph URI */
export async function triplesByGraph(graphUri: string): Promise<Triple[]> {
  const sb = getClient();
  const { data, error } = await sb.from("triples").select("*").eq("graph_uri", graphUri);
  if (error) throw new Error(`[DB] triplesByGraph failed: ${error.message}`);
  return (data || []) as Triple[];
}

/** Count triples for a record */
export async function countTriples(recordId: string): Promise<number> {
  return count("triples", { record_id: recordId });
}

// ─── Named Graph helpers ────────────────────────────────────

export async function upsertNamedGraph(
  uri: string,
  recordId: string,
  tripleCount: number,
  institutionId?: string,
  versionNumber?: number,
): Promise<void> {
  await upsert("named_graphs", {
    uri,
    record_id: recordId,
    triple_count: tripleCount,
    institution_id: institutionId || null,
    version_number: versionNumber || null,
    status: "active",
  }, "uri");
}

// ─── Backward-compat KV (moon_kv table) ─────────────────────

export async function kvSet(key: string, value: any): Promise<void> {
  await upsert("moon_kv", { key, value }, "key");
}

export async function kvGet(key: string): Promise<any> {
  const row = await getById<{ key: string; value: any }>("moon_kv", key, "key");
  return row?.value ?? null;
}

export async function kvDel(key: string): Promise<void> {
  await del("moon_kv", key, "key");
}

export async function kvGetByPrefix(prefix: string): Promise<any[]> {
  const sb = getClient();
  const { data, error } = await sb
    .from("moon_kv")
    .select("key, value")
    .like("key", `${prefix}%`);
  if (error) throw new Error(`[DB] kvGetByPrefix failed: ${error.message}`);
  return (data || []).map((d: any) => d.value);
}
