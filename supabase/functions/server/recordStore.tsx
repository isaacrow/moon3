/**
 * BIBFRAME record storage: the records and record_versions tables, with the old key-value rows kept
 * in step while the move finishes.
 *
 * - Reads come from the records table. A record not copied there yet is read from the key-value
 *   table, so nothing disappears during the switch.
 * - Every save, review decision and delete goes to the tables first (one database call, so the record
 *   and its new version row are written together), then to the key-value row as before, which other
 *   parts of the server (AI search, discovery) still read.
 *
 * Records keep the shape the app has always received from the key-value table, plus `version`.
 */

import * as kv from "./kv_store.tsx";
import { getClient } from "./db.tsx";

const kvKey = (id: string) => `bibframe:record:${id}`;
// The client has no generated database types, so its table and function calls are untyped.
const sb = (): any => getClient();

export interface StoredRecord {
  id: string;
  title: string;
  document: any;
  metadata: Record<string, any>;
  status: string;
  cataloger?: string;
  createdAt?: string;
  saved?: string;
  approvedBy?: string;
  approvedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  version?: number;
  /** The version the public catalogue shows; may be older than `version` while an edit waits for review. */
  publishedVersion?: number;
  /** The reviewer this record is assigned to, if any. */
  /** Public address of the record's cover picture, if it has one. */
  coverUrl?: string;
  assignedTo?: string;
}

function fromRow(row: any): StoredRecord {
  return {
    id: row.id,
    title: row.title,
    document: row.document,
    metadata: row.metadata || {},
    status: row.status,
    cataloger: row.cataloger ?? undefined,
    createdAt: row.created_at,
    saved: row.updated_at,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    version: row.current_version,
    publishedVersion: row.published_version ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    coverUrl: row.cover_url ?? undefined,
  };
}

/** A row of the published_records view: the record as the public catalogue shows it. */
function fromPublishedRow(row: any): StoredRecord {
  return {
    id: row.id,
    title: row.title,
    document: row.document,
    metadata: row.metadata || {},
    status: "complete",
    cataloger: row.cataloger ?? undefined,
    createdAt: row.created_at,
    saved: row.updated_at,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    version: row.published_version,
    publishedVersion: row.published_version,
    coverUrl: row.cover_url ?? undefined,
  };
}

function fromKv(raw: any): StoredRecord | null {
  if (!raw) return null;
  const rec = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!rec || typeof rec !== "object") return null;
  // Older rows keep the status in metadata, or have none: those count as published, as they always have.
  const status = rec.status || rec.metadata?.status;
  return {
    ...rec,
    title: rec.title || "Untitled",
    status: status === "pending-review" || status === "needs-review" ? status : "complete",
    cataloger: rec.cataloger || rec.metadata?.catalogerId,
    createdAt: rec.createdAt || rec.saved,
  };
}

/** One record, or null when it does not exist or was deleted. */
export async function getRecord(id: string): Promise<StoredRecord | null> {
  const { data, error } = await sb().from("records").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`[records] read ${id} failed: ${error.message}`);
  if (data) return data.deleted_at ? null : fromRow(data);
  return fromKv(await kv.get(kvKey(id)));
}

/** Every record that is not deleted, from the table plus any not copied there yet. */
export async function listRecords(): Promise<StoredRecord[]> {
  const { data, error } = await sb().from("records").select("*");
  if (error) throw new Error(`[records] list failed: ${error.message}`);
  const rows = data || [];
  const inTable = new Set(rows.map((r: any) => r.id));
  const fromTable = rows.filter((r: any) => !r.deleted_at).map(fromRow);
  const notCopied = (await kv.getByPrefix("bibframe:record:"))
    .map(fromKv)
    .filter((r): r is StoredRecord => !!r && !!r.id && !inTable.has(r.id));
  return [...fromTable, ...notCopied];
}

/**
 * One record as the public catalogue shows it: its published version, even while a newer edit waits
 * for review. Null when it was never published, was deleted or does not exist.
 */
export async function getPublishedRecord(id: string): Promise<StoredRecord | null> {
  const { data, error } = await sb().from("published_records").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`[records] published read ${id} failed: ${error.message}`);
  if (data) return fromPublishedRow(data);
  // A record not copied to the table yet is public if its key-value row is published.
  const { data: row } = await sb().from("records").select("id").eq("id", id).maybeSingle();
  if (row) return null;
  const rec = fromKv(await kv.get(kvKey(id)));
  return rec?.status === "complete" ? rec : null;
}

/** Every published record, each at its published version. */
export async function listPublishedRecords(): Promise<StoredRecord[]> {
  const [published, all] = await Promise.all([
    sb().from("published_records").select("*"),
    sb().from("records").select("id"),
  ]);
  if (published.error) throw new Error(`[records] published list failed: ${published.error.message}`);
  if (all.error) throw new Error(`[records] list failed: ${all.error.message}`);
  const inTable = new Set((all.data || []).map((r: any) => r.id));
  const notCopied = (await kv.getByPrefix("bibframe:record:"))
    .map(fromKv)
    .filter((r): r is StoredRecord => !!r && !!r.id && !inTable.has(r.id) && r.status === "complete");
  return [...(published.data || []).map(fromPublishedRow), ...notCopied];
}

/** Records that were published and are now deleted (for the change feed's Delete activities). */
export async function listWithdrawnRecords(): Promise<Array<{ id: string; title?: string; createdAt?: string; saved?: string; deletedAt: string }>> {
  const { data, error } = await sb().from("records").select("id, title, created_at, updated_at, deleted_at")
    .not("deleted_at", "is", null).not("published_version", "is", null);
  if (error) throw new Error(`[records] withdrawn list failed: ${error.message}`);
  return (data || []).map((r: any) => ({ id: r.id, title: r.title, createdAt: r.created_at, saved: r.updated_at, deletedAt: r.deleted_at }));
}

// ---- Label cache (Phase 13 S19): LC and Wikidata names, written only by the refresh job ----

export interface LabelRow { uri: string; source: "lc" | "wikidata"; labels: Array<{ value: string; lang?: string }>; sourceModified?: string; fetchedAt: string; missing?: boolean }
const fromLabelRow = (r: any): LabelRow => ({ uri: r.uri, source: r.source, labels: r.labels || [], ...(r.source_modified ? { sourceModified: r.source_modified } : {}), fetchedAt: r.fetched_at, ...(r.missing ? { missing: true } : {}) });

export async function allCachedLabels(): Promise<LabelRow[]> {
  const out: LabelRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb().from("label_cache").select("*").range(from, from + 999);
    if (error) throw new Error(`[labels] read failed: ${error.message}`);
    out.push(...(data || []).map(fromLabelRow));
    if (!data || data.length < 1000) return out;
  }
}
export async function cachedLabels(uris: string[]): Promise<LabelRow[]> {
  if (!uris.length) return [];
  const { data, error } = await sb().from("label_cache").select("*").in("uri", uris);
  if (error) throw new Error(`[labels] read failed: ${error.message}`);
  return (data || []).map(fromLabelRow);
}
export async function storeLabels(rows: LabelRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb().from("label_cache").upsert(rows.slice(i, i + 200).map((r) => ({
      uri: r.uri, source: r.source, labels: r.labels, source_modified: r.sourceModified ?? null, fetched_at: r.fetchedAt, missing: !!r.missing,
    })));
    if (error) throw new Error(`[labels] store failed: ${error.message}`);
  }
}
export async function labelState(key: string): Promise<string | null> {
  const { data } = await sb().from("label_cache_state").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
export async function setLabelState(key: string, value: string): Promise<void> {
  const { error } = await sb().from("label_cache_state").upsert({ key, value });
  if (error) throw new Error(`[labels] state failed: ${error.message}`);
}

/** Thrown when a save starts from an older version than the record's current one. */
export class VersionConflictError extends Error {
  constructor(readonly currentVersion: number) {
    super(`The record is now at version ${currentVersion}`);
  }
}

/**
 * Saves a record as its next version and returns the version number. With `baseVersion` (the version
 * the editor started from), a record that has moved on since is not saved: VersionConflictError.
 */
export async function saveRecord(
  record: StoredRecord & { saved: string },
  savedBy: string,
  note = "save",
  baseVersion?: number,
): Promise<number> {
  const { data, error } = await sb().rpc("moon_save_record", {
    p_id: record.id,
    p_title: record.title,
    p_status: record.status,
    p_cataloger: record.cataloger ?? null,
    p_document: record.document,
    p_metadata: record.metadata || {},
    p_saved_by: savedBy,
    p_saved_at: record.saved,
    p_note: note,
    p_approved_by: record.approvedBy ?? null,
    p_approved_at: record.approvedAt ?? null,
    p_base_version: baseVersion ?? null,
  });
  const conflict = error?.message?.match(/version_conflict:(\d+)/);
  if (conflict) throw new VersionConflictError(Number(conflict[1]));
  if (error) throw new Error(`[records] save ${record.id} failed: ${error.message}`);
  const { version: _version, publishedVersion: _published, assignedTo: _assigned, ...kvRecord } = record;
  await kv.set(kvKey(record.id), JSON.stringify(kvRecord));
  return data as number;
}

/** Publishes or returns a record. Returns the updated record, or null when it does not exist. */
export async function reviewRecord(
  id: string,
  status: "complete" | "needs-review",
  by: string,
): Promise<StoredRecord | null> {
  const existing = await getRecord(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  // A record still only in the key-value table is copied over by saving it first.
  if (existing.version === undefined) {
    await saveRecord({ ...existing, saved: existing.saved || now }, existing.cataloger || by);
  }
  const { data, error } = await sb().rpc("moon_review_record", {
    p_id: id,
    p_status: status,
    p_by: by,
    p_at: now,
  });
  if (error) throw new Error(`[records] review ${id} failed: ${error.message}`);
  if (data === null) return null;

  const updated: StoredRecord = {
    ...existing,
    status,
    metadata: { ...(existing.metadata || {}), status },
    reviewedBy: by,
    reviewedAt: now,
    ...(status === "complete" ? { approvedBy: by, approvedAt: now } : {}),
    version: data as number,
  };
  const { version: _version, publishedVersion: _published, assignedTo: _assigned, ...kvRecord } = updated;
  await kv.set(kvKey(id), JSON.stringify(kvRecord));
  return updated;
}

/** Deletes a record: kept in the table (restorable), removed from the key-value table. */
export async function deleteRecord(id: string): Promise<void> {
  const { error } = await sb().rpc("moon_delete_record", { p_id: id, p_at: new Date().toISOString() });
  if (error) throw new Error(`[records] delete ${id} failed: ${error.message}`);
  await kv.del(kvKey(id));
}

export interface VersionSummary {
  version: number;
  title: string;
  status: string;
  savedBy?: string;
  savedAt: string;
  note?: string;
}

/** A record's versions, newest first, without their documents. */
export async function listVersions(id: string): Promise<VersionSummary[]> {
  const { data, error } = await sb()
    .from("record_versions")
    .select("version, title, status, saved_by, saved_at, note")
    .eq("record_id", id)
    .order("version", { ascending: false });
  if (error) throw new Error(`[records] versions of ${id} failed: ${error.message}`);
  return (data || []).map((v: any) => ({
    version: v.version,
    title: v.title,
    status: v.status,
    savedBy: v.saved_by ?? undefined,
    savedAt: v.saved_at,
    note: v.note ?? undefined,
  }));
}

/** One version with its document, or null. */
export async function getVersion(id: string, version: number): Promise<(VersionSummary & { document: any }) | null> {
  const { data, error } = await sb()
    .from("record_versions")
    .select("*")
    .eq("record_id", id)
    .eq("version", version)
    .maybeSingle();
  if (error) throw new Error(`[records] version ${version} of ${id} failed: ${error.message}`);
  if (!data) return null;
  return {
    version: data.version,
    title: data.title,
    status: data.status,
    savedBy: data.saved_by ?? undefined,
    savedAt: data.saved_at,
    note: data.note ?? undefined,
    document: data.document,
  };
}

/**
 * Makes an earlier version current again, as a new version: nothing in the history is lost, and a
 * revert can itself be reverted. The status follows the same rule as a save. Returns the new version.
 */
export async function revertRecord(
  current: StoredRecord,
  to: { version: number; title: string; document: any },
  by: string,
  status: string,
): Promise<number> {
  const now = new Date().toISOString();
  return saveRecord({
    ...current,
    title: to.title,
    document: to.document,
    status,
    metadata: { ...(current.metadata || {}), status },
    ...(status === "complete" ? { approvedBy: by, approvedAt: now } : {}),
    saved: now,
  }, by, `revert to v${to.version}`);
}

export interface ActiveEditor {
  username: string;
  since: string;
  lastSeen: string;
}

/** Marks `username` as editing the record now; returns the others active on it in the last 90 seconds. */
export async function editingHeartbeat(id: string, username: string): Promise<ActiveEditor[]> {
  const { data, error } = await sb().rpc("moon_editing_heartbeat", { p_id: id, p_user: username });
  if (error) throw new Error(`[records] editing heartbeat ${id} failed: ${error.message}`);
  return (data as ActiveEditor[]) || [];
}

/** `username` closed the record. */
export async function editingLeave(id: string, username: string): Promise<void> {
  const { error } = await sb().rpc("moon_editing_leave", { p_id: id, p_user: username });
  if (error) throw new Error(`[records] editing leave ${id} failed: ${error.message}`);
}

export interface SearchOptions {
  query?: string;
  published?: boolean;
  status?: string;
  cataloger?: string;
  language?: string;
  template?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  total: number;
  records: Array<StoredRecord & { language?: string; template?: string }>;
  facets: Record<"status" | "cataloger" | "language" | "template", Record<string, number>>;
}

/**
 * One page of records matching every word of the query, however it is spelled (Arabic letter variants,
 * diacritics and romanization marks are folded), with filters and per-filter counts. With
 * `published`, searches what the public catalogue shows. Records still only in the key-value table
 * are not searched; after the move there are none.
 */
export async function searchRecords(o: SearchOptions): Promise<SearchResult> {
  const { data, error } = await sb().rpc("moon_search_records", {
    p_query: o.query ?? "",
    p_published: !!o.published,
    p_status: o.status || null,
    p_cataloger: o.cataloger || null,
    p_language: o.language || null,
    p_template: o.template || null,
    p_limit: o.limit ?? 50,
    p_offset: o.offset ?? 0,
  });
  if (error) throw new Error(`[records] search failed: ${error.message}`);
  return data as SearchResult;
}

/** The published record that describes `uri` (any node with that @id), or null. */
export async function findPublishedByUri(uri: string): Promise<{ id: string; title: string; document: any; version: number; saved: string } | null> {
  const { data, error } = await sb().rpc("moon_find_published_by_uri", { p_uri: uri });
  if (error) throw new Error(`[records] resolve ${uri} failed: ${error.message}`);
  return data ?? null;
}

export type NotificationKind = "welcome" | "signup" | "review" | "approved" | "returned" | "comment" | "assigned" | "suggestion" | "suggestion_accepted" | "suggestion_declined";

/** Assigns a record to a reviewer (or clears it with null); false when the record does not exist. */
export async function assignRecord(id: string, username: string | null): Promise<boolean> {
  const { data, error } = await sb().rpc("moon_assign_record", { p_id: id, p_user: username });
  if (error) throw new Error(`[records] assign ${id} failed: ${error.message}`);
  return data === true;
}

/**
 * Adds a notification. Never throws: a notification that fails to send must not undo the save or
 * review that caused it.
 */
export async function notify(
  username: string | undefined,
  kind: NotificationKind,
  record: { id?: string; title?: string },
  actor?: string,
  reason?: string,
): Promise<void> {
  if (!username) return;
  const { error } = await sb().rpc("moon_notify", {
    p_user: username, p_kind: kind, p_record_id: record.id ?? null, p_record_title: record.title ?? null,
    p_actor: actor ?? null, p_reason: reason ?? null,
  });
  if (error) console.error(`[notifications] ${kind} for ${username} failed: ${error.message}`);
}

export async function listNotifications(username: string): Promise<{ unread: number; items: any[] }> {
  const { data, error } = await sb().rpc("moon_notifications", { p_user: username, p_limit: 30 });
  if (error) throw new Error(`[notifications] list failed: ${error.message}`);
  return data;
}

export async function markNotificationsRead(username: string, ids?: number[]): Promise<number> {
  const { data, error } = await sb().rpc("moon_notifications_read", { p_user: username, p_ids: ids?.length ? ids : null });
  if (error) throw new Error(`[notifications] mark read failed: ${error.message}`);
  return data as number;
}

export interface FieldComment {
  id: number;
  field: string;
  body: string;
  author: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  /** A suggested new value for the field (a "suggest a change"), and what the record's cataloger decided. */
  suggested?: string | null;
  decision?: 'accepted' | 'declined' | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
}

/** Every comment on a record's fields, oldest first. */
export async function listComments(recordId: string): Promise<FieldComment[]> {
  const { data, error } = await sb().rpc("moon_record_comments", { p_record: recordId });
  if (error) throw new Error(`[comments] list ${recordId} failed: ${error.message}`);
  return data || [];
}

export async function addComment(recordId: string, field: string, body: string, author: string): Promise<FieldComment> {
  const { data, error } = await sb().rpc("moon_add_comment", { p_record: recordId, p_field: field, p_body: body, p_author: author });
  if (error) throw new Error(`[comments] add on ${recordId} failed: ${error.message}`);
  return data;
}

/** Resolves (or with resolved=false reopens) the thread the comment belongs to; returns how many changed. */
export async function resolveComment(recordId: string, id: number, by: string, resolved = true): Promise<number> {
  const { data, error } = await sb().rpc("moon_resolve_comment", { p_record: recordId, p_id: id, p_by: by, p_resolved: resolved });
  if (error) throw new Error(`[comments] resolve ${id} failed: ${error.message}`);
  return data as number;
}

/** A suggested new value for one field, with the reason (Phase 13 S4). */
export async function addSuggestion(recordId: string, field: string, body: string, value: string, author: string): Promise<FieldComment> {
  const { data, error } = await sb().rpc("moon_add_suggestion", { p_record: recordId, p_field: field, p_body: body, p_value: value, p_author: author });
  if (error) throw new Error(`[suggestions] add on ${recordId} failed: ${error.message}`);
  return data;
}

/** Accepts or declines an open suggestion; null when there is none to decide. */
export async function decideSuggestion(recordId: string, id: number, by: string, accept: boolean): Promise<FieldComment | null> {
  const { data, error } = await sb().rpc("moon_decide_suggestion", { p_record: recordId, p_id: id, p_by: by, p_accept: accept });
  if (error) throw new Error(`[suggestions] decide ${id} failed: ${error.message}`);
  return data ?? null;
}

/** Where an entity's outside link came from (Phase 13 S18): who, when, how, and a machine match's confidence. */
export interface LinkSource { uri: string; addedBy: string; addedAt: string; method: 'person' | 'reconcile' | 'record' | 'import'; confidence?: number | null; evidence?: string | null }

/** Records who added an outside link and how; the first statement of a link is kept. */
export async function addLinkSource(id: string, s: Omit<LinkSource, 'addedAt'>): Promise<void> {
  const { error } = await sb().rpc("moon_add_link_source", {
    p_id: id, p_uri: s.uri, p_by: s.addedBy, p_method: s.method, p_confidence: s.confidence ?? null, p_evidence: s.evidence ?? null,
  });
  if (error) console.error(`[link sources] ${id} failed: ${error.message}`);
}

export async function listLinkSources(id: string): Promise<LinkSource[]> {
  const { data, error } = await sb().rpc("moon_link_sources", { p_id: id });
  if (error) throw new Error(`[link sources] list ${id} failed: ${error.message}`);
  return data || [];
}

/** A request to merge two entities or split a merged one (Phase 13 S18), decided by the Super Admin. */
export interface EntityRequest {
  id: number; kind: 'merge' | 'split'; from: string; into: string; reason: string; askedBy: string; askedAt: string;
  status: 'open' | 'approved' | 'declined'; decidedBy?: string | null; decidedAt?: string | null; note?: string | null;
  fromLabel?: string; intoLabel?: string; entityKind?: string;
}

/** Asks for a merge or split; null when it does not fit (missing, other kind, not merged …). */
export async function requestEntityChange(kind: 'merge' | 'split', from: string, into: string, reason: string, by: string): Promise<EntityRequest | null> {
  const { data, error } = await sb().rpc("moon_request_entity_change", { p_kind: kind, p_from: from, p_into: into, p_reason: reason, p_by: by });
  if (error) throw new Error(`[entity requests] ask failed: ${error.message}`);
  return data ?? null;
}

export async function decideEntityRequest(id: number, by: string, approve: boolean): Promise<EntityRequest | null> {
  const { data, error } = await sb().rpc("moon_decide_entity_request", { p_id: id, p_by: by, p_approve: approve });
  if (error) throw new Error(`[entity requests] decide ${id} failed: ${error.message}`);
  return data ?? null;
}

export async function listEntityRequests(status: 'open' | 'approved' | 'declined' | null): Promise<EntityRequest[]> {
  const { data, error } = await sb().rpc("moon_list_entity_requests", { p_status: status });
  if (error) throw new Error(`[entity requests] list failed: ${error.message}`);
  return data || [];
}

/** The entities merged into this one (to offer splitting them off again). */
export async function mergedInto(id: string): Promise<Array<{ id: string; label: string }>> {
  const { data, error } = await sb().from("authorities").select("id, label").eq("merged_into", id).order("label");
  if (error) throw new Error(`[authorities] merged into ${id} failed: ${error.message}`);
  return data || [];
}

export interface PossibleDuplicate {
  id: string;
  title: string;
  status: string;
  cataloger?: string;
  reasons: Array<"isbn" | "lccn" | "title">;
}

/** Other records that look like the same book as `document` (same ISBN, LCCN or title). */
export async function findDuplicates(id: string | null, document: any): Promise<PossibleDuplicate[]> {
  const { data, error } = await sb().rpc("moon_find_duplicates", { p_id: id, p_doc: document });
  if (error) throw new Error(`[records] duplicate check failed: ${error.message}`);
  return data || [];
}

// ── Local authority file: Moon's own people, organizations, places and topics ─────────────────────

export type AuthorityKind = "agent" | "place" | "topic" | "hub" | "genre" | "period";

export interface Authority {
  id: string;
  kind: AuthorityKind;
  label: string;
  variants: string[];
  sameAs: string[];
  note?: string | null;
  data: Record<string, unknown>;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  mergedInto?: string | null;
  /** Goes up by one with every edit; an edit names the version it started from. */
  version?: number;
}

/** A readable, permanent id: the name's Latin letters (if any) plus a random tail, e.g. ali-al-wardi-3f9a1c2e. */
export function newAuthorityId(kind: AuthorityKind, label: string, variants: string[] = []): string {
  const latin = [label, ...variants].find((n) => /[a-z]/i.test(n)) || "";
  const slug = latin.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(4))).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${slug || kind}-${tail}`;
}

/** Adds an entry, or returns the existing one of the same kind with that name (any spelling). */
export async function addAuthority(input: {
  kind: AuthorityKind; label: string; variants?: string[]; sameAs?: string[]; note?: string; data?: Record<string, unknown>;
}, by: string): Promise<{ existing: boolean; authority: Authority }> {
  const { data, error } = await sb().rpc("moon_add_authority", {
    p_id: newAuthorityId(input.kind, input.label, input.variants), p_kind: input.kind, p_label: input.label,
    p_variants: input.variants || [], p_same_as: input.sameAs || [], p_note: input.note ?? null,
    p_data: input.data || {}, p_by: by,
  });
  if (error) throw new Error(`[authorities] add failed: ${error.message}`);
  return data;
}

export async function searchAuthorities(query: string, kind?: AuthorityKind | null, limit = 20): Promise<Authority[]> {
  const { data, error } = await sb().rpc("moon_search_authorities", { p_query: query, p_kind: kind ?? null, p_limit: limit });
  if (error) throw new Error(`[authorities] search failed: ${error.message}`);
  return data || [];
}

/** Every entity (not merged), for the data dump and SPARQL (Phase 12). */
export async function listAllAuthorities(): Promise<Authority[]> {
  const { data, error } = await sb().rpc("moon_list_authorities");
  if (error) throw new Error(`[authorities] list failed: ${error.message}`);
  return data || [];
}

/** The entity file in numbers (Phase 12 audit): total, how many link outward, by kind. */
export async function authorityStats(): Promise<{ total: number; withOutsideLinks: number; byKind: Record<string, number> }> {
  const { data, error } = await sb().rpc("moon_authority_stats");
  if (error) throw new Error(`[authorities] stats failed: ${error.message}`);
  return data || { total: 0, withOutsideLinks: 0, byKind: {} };
}

/** The entity (not merged) that already has one of these outside links, however the link is spelled. */
export async function findAuthorityByLinks(uris: string[], kind?: AuthorityKind | null): Promise<Authority | null> {
  const { data, error } = await sb().rpc("moon_find_authority_by_links", { p_links: uris, p_kind: kind ?? null });
  if (error) throw new Error(`[authorities] find by link failed: ${error.message}`);
  return data || null;
}

export async function getAuthority(id: string): Promise<Authority | null> {
  const { data, error } = await sb().rpc("moon_get_authority", { p_id: id });
  if (error) throw new Error(`[authorities] get ${id} failed: ${error.message}`);
  return data || null;
}

/** Adds owl:sameAs links (LC, VIAF, Wikidata …) to an entry; returns the entry, or null when it is missing or merged. */
export async function addAuthoritySameAs(id: string, uris: string[]): Promise<Authority | null> {
  const { data: row, error } = await sb().from("authorities").select("same_as, merged_into").eq("id", id).maybeSingle();
  if (error) throw new Error(`[authorities] read ${id} failed: ${error.message}`);
  if (!row || row.merged_into) return null;
  const same = [...new Set([...(row.same_as || []), ...uris])];
  const { error: upd } = await sb().from("authorities").update({ same_as: same, updated_at: new Date().toISOString() }).eq("id", id);
  if (upd) throw new Error(`[authorities] update ${id} failed: ${upd.message}`);
  return getAuthority(id);
}

/** Merges `from` into `into` (same kind); false when either is missing, already merged, or of another kind. */
export async function mergeAuthority(from: string, into: string): Promise<boolean> {
  const { data, error } = await sb().rpc("moon_merge_authority", { p_from: from, p_into: into });
  if (error) throw new Error(`[authorities] merge ${from} → ${into} failed: ${error.message}`);
  return data === true;
}

/** Changes an entry's name, other names, links, note and details. The old state is kept in its history.
 *  "conflict" when someone saved it since `expectedVersion`; "duplicate" when another entry of the same kind
 *  already has the new name; "missing" when it does not exist or was merged. */
export async function updateAuthority(id: string, input: {
  label: string; variants: string[]; sameAs: string[]; note?: string | null; data: Record<string, unknown>;
}, by: string, expectedVersion?: number): Promise<{ status: "ok" | "conflict" | "duplicate" | "missing"; authority?: Authority; other?: Authority }> {
  const { data, error } = await sb().rpc("moon_update_authority", {
    p_id: id, p_label: input.label, p_variants: input.variants, p_same_as: input.sameAs, p_note: input.note ?? null,
    p_data: input.data, p_by: by, p_expected_version: expectedVersion ?? null,
  });
  if (error) throw new Error(`[authorities] update ${id} failed: ${error.message}`);
  return data;
}

/** Earlier states of an entry, newest first: { version, label, …, changedBy, changedAt }. */
export async function authorityHistory(id: string): Promise<any[]> {
  const { data, error } = await sb().rpc("moon_authority_history", { p_id: id });
  if (error) throw new Error(`[authorities] history ${id} failed: ${error.message}`);
  return data || [];
}

/** How many records (not deleted) point to this address, and a few of them. */
export async function authorityUsage(uri: string, links: string[] = []): Promise<{ count: number; records: Array<{ id: string; title: string }> }> {
  const { data, error } = await sb().rpc("moon_authority_usage", { p_uri: uri, p_links: links });
  if (error) throw new Error(`[authorities] usage failed: ${error.message}`);
  return data || { count: 0, records: [] };
}

// ── Record covers: one picture per record in the public Storage bucket "covers" ───────────────────

export const COVER_MAX_BYTES = 512 * 1024;
const COVER_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** The image type of these bytes, from their first bytes (never trusted from a header or a name). */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/**
 * Stores the picture as the record's cover (replacing any earlier one) and returns its public address.
 * The address carries ?v=<time> so browsers fetch the new picture rather than a cached old one.
 */
export async function putCover(id: string, bytes: Uint8Array, source: "upload" | "openlibrary" | "googlebooks"): Promise<string> {
  const type = sniffImageType(bytes);
  if (!type) throw new Error("not a JPEG, PNG or WebP image");
  if (bytes.length > COVER_MAX_BYTES) throw new Error("the picture is larger than 512 KB");
  const bucket = sb().storage.from("covers");
  const name = `${id}.${COVER_TYPES[type]}`;
  const others = Object.values(COVER_TYPES).map((ext) => `${id}.${ext}`).filter((n) => n !== name);
  await bucket.remove(others).catch(() => {});
  const { error } = await bucket.upload(name, bytes, { contentType: type, upsert: true, cacheControl: "86400" });
  if (error) throw new Error(`[covers] upload ${name} failed: ${error.message}`);
  const url = `${bucket.getPublicUrl(name).data.publicUrl}?v=${Date.now()}`;
  const { data, error: setError } = await sb().rpc("moon_set_cover", { p_id: id, p_url: url, p_source: source });
  if (setError) throw new Error(`[covers] set ${id} failed: ${setError.message}`);
  if (data !== true) throw new Error("record not found");
  return url;
}

export async function removeCover(id: string): Promise<void> {
  await sb().storage.from("covers").remove(Object.values(COVER_TYPES).map((ext) => `${id}.${ext}`)).catch(() => {});
  const { error } = await sb().rpc("moon_set_cover", { p_id: id, p_url: null, p_source: null });
  if (error) throw new Error(`[covers] clear ${id} failed: ${error.message}`);
}

/** An ISBN-10 or ISBN-13 as digits (and a final X), or null. */
export function cleanIsbn(raw: unknown): string | null {
  const d = String(raw ?? "").toUpperCase().replace(/[^0-9X]/g, "");
  return /^(\d{9}[\dX]|97[89]\d{10})$/.test(d) ? d : null;
}

async function fetchImage(url: string): Promise<Uint8Array | null> {
  const allowed = /^https:\/\/(covers\.openlibrary\.org|([a-z0-9-]+\.)*archive\.org|books\.google\.com|([a-z0-9-]+\.)*googleusercontent\.com)\//;
  let current = url;
  // Follow redirects by hand so every hop stays on the publishers' image hosts.
  for (let hop = 0; hop < 4; hop++) {
    if (!allowed.test(current)) return null;
    const res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current).toString();
      continue;
    }
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Open Library answers a 1×1 pixel or tiny placeholder for some books; Google a "no image" picture.
    return bytes.length > 2_000 && bytes.length <= COVER_MAX_BYTES && sniffImageType(bytes) ? bytes : null;
  }
  return null;
}

/** A cover for this ISBN: Open Library first (large, then medium), then Google Books. */
export async function findCoverByIsbn(isbn: string): Promise<{ bytes: Uint8Array; source: "openlibrary" | "googlebooks" } | null> {
  for (const size of ["L", "M"]) {
    const bytes = await fetchImage(`https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg?default=false`).catch(() => null);
    if (bytes) return { bytes, source: "openlibrary" };
  }
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&fields=items(volumeInfo/imageLinks)`, { signal: AbortSignal.timeout(10_000) });
    const links = res.ok ? (await res.json())?.items?.[0]?.volumeInfo?.imageLinks : null;
    const link = links?.thumbnail || links?.smallThumbnail;
    if (link) {
      const bytes = await fetchImage(String(link).replace(/^http:/, "https:").replace(/&edge=curl/, ""));
      if (bytes) return { bytes, source: "googlebooks" };
    }
  } catch { /* no Google cover */ }
  return null;
}
