/**
 * Lists routes (lists.tsx has the fields and the query engine; the table is in the lists migration). Library staff
 * only (the Super Admin, reviewers and cataloguers); each library sees its own rows and its own saved lists, and a
 * private list only its maker.
 *
 *   POST   /lists/run {query, limit?}        the rows a query keeps (the first `limit`, 100 by default) and how many
 *   POST   /lists/export {query, lang?}      the whole result as CSV
 *   GET    /lists                            the library's saved lists
 *   POST   /lists {name, query, private?}    PUT /lists/:id    DELETE /lists/:id (its maker or a reviewer)
 *   POST   /lists/:id/refresh                runs a saved list again and keeps its count and time
 *   GET    /lists/ready                      the ready-made lists (lists.tsx READY_LISTS) with how many rows each has now
 *   POST   /lists/bulk/preview {query, field, value}          every change a bulk change would make (bulkEdit.tsx)
 *   POST   /lists/bulk/apply {query, field, value, expect}    makes it, if the list still gives `expect` changes
 *   GET    /lists/bulk                       the library's recent bulk changes
 *   POST   /lists/bulk/:id/undo              puts every row back that has not been changed again since
 *
 * Rows are read per library, up to ROW_CAP of each kind; a result says when the cap was reached.
 */
import { Hono } from "npm:hono";
import { getClient } from "./db.tsx";
import { getSession, libraryOf } from "./accountRoutes.tsx";
import { copiesIn } from "./circulation.tsx";
import * as recordStore from "./recordStore.tsx";
import { readBulk, planChanges, withCopyChange, bulkFieldOf, MAX_CHANGES, type BulkField, type Change } from "./bulkEdit.tsx";
import { readQuery, runQuery, toCsv, subjectsIn, scriptsOf, READY_LISTS, type EntityId, type ListQuery, type Row } from "./lists.tsx";

const listsRoutes = new Hono();
const sb = (): any => getClient();
export const ROW_CAP = 5000;
const PAGE = 1000;

interface Staff { username: string; role: string; library: string }
async function staffOf(c: any): Promise<Staff | null> {
  const s = await getSession(c);
  if (!s || !["admin", "reviewer", "cataloger"].includes(s.role)) return null;
  return { username: s.username, role: s.role, library: await libraryOf(s.username) };
}
const denied = (c: any) => c.json({ error: "Library staff only (cataloguers, reviewers and the Super Admin)" }, 403);

/** Every row of a select, a page at a time, up to the cap. */
async function all(build: (from: number, to: number) => any): Promise<{ rows: any[]; capped: boolean }> {
  const rows: any[] = [];
  for (let from = 0; from < ROW_CAP; from += PAGE) {
    const { data, error } = await build(from, Math.min(from + PAGE, ROW_CAP) - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return { rows, capped: false };
  }
  return { rows, capped: true };
}

const nameOf = (x: any) => (Array.isArray(x) ? x[0] : x) || {};

/** The library's rows of one kind, flattened to the fields lists.tsx names. */
export async function loadRows(entity: EntityId, library: string): Promise<{ rows: Row[]; capped: boolean }> {
  const lib = (table: string, cols: string, order: string, asc = false) => (from: number, to: number) =>
    sb().from(table).select(cols).eq("library", library).order(order, { ascending: asc }).order("id").range(from, to);
  switch (entity) {
    case "books":
    case "copies": {
      const got = await all((from, to) => sb().from("records")
        .select("id, title, status, cataloger, assigned_to, created_at, updated_at, approved_at, document")
        .is("deleted_at", null).order("updated_at", { ascending: false }).order("id").range(from, to));
      if (entity === "books") {
        return { capped: got.capped, rows: got.rows.map(({ document, ...r }) => ({ ...r, copies: copiesIn(document).length, subjects: subjectsIn(document) })) };
      }
      const { data: out } = await sb().from("loans").select("barcode").eq("library", library).is("returned_at", null);
      const onLoan = new Set((out || []).map((x: any) => x.barcode));
      const rows: Row[] = [];
      for (const r of got.rows) {
        for (const cp of copiesIn(r.document)) {
          if (cp.library && cp.library !== library) continue;
          rows.push({ barcode: cp.barcode, record_id: r.id, title: r.title, location: cp.location, shelf_mark: cp.shelfMark, copy_number: cp.copyNumber, reference_only: cp.referenceOnly, on_loan: onLoan.has(cp.barcode) });
        }
      }
      return { capped: got.capped, rows };
    }
    case "people": {
      // The authority file is shared by every library: its people and bodies (agents), not merged into another.
      const got = await all((from, to) => sb().from("authorities").select("id, label, variants, same_as, created_by, created_at, updated_at")
        .eq("kind", "agent").is("merged_into", null).order("label").order("id").range(from, to));
      return {
        capped: got.capped,
        rows: got.rows.map((a: any) => ({
          id: a.id, name: a.label, variants: (a.variants || []).join(" · "), links: (a.same_as || []).length,
          created_by: a.created_by, created_at: a.created_at, updated_at: a.updated_at, ...scriptsOf([a.label, ...(a.variants || [])]),
        })),
      };
    }
    case "loans": {
      const got = await all(lib("loans", "*, patrons(card, name)", "loaned_at"));
      const now = new Date().toISOString();
      return {
        capped: got.capped,
        rows: got.rows.map(({ patrons, patron_id, ...r }) => ({
          ...r, borrower_card: nameOf(patrons).card, borrower_name: nameOf(patrons).name,
          out: !r.returned_at, overdue: !r.returned_at && r.due_at < now, fine: Number(r.fine) || 0,
        })),
      };
    }
    case "borrowers":
      return all(lib("patrons", "card, name, kind, email, phone, blocked, note, created_at, id", "name", true));
    case "holds": {
      const got = await all(lib("holds", "*, patrons(card, name)", "placed_at"));
      return { capped: got.capped, rows: got.rows.map(({ patrons, patron_id, ...r }) => ({ ...r, borrower_card: nameOf(patrons).card, borrower_name: nameOf(patrons).name })) };
    }
    case "orders": {
      const got = await all(lib("acq_orders", "*, acq_vendors(name), acq_funds(code)", "ordered_at"));
      return {
        capped: got.capped,
        rows: got.rows.map(({ acq_vendors, acq_funds, ...r }) => ({
          ...r, vendor: nameOf(acq_vendors).name, fund: nameOf(acq_funds).code,
          total: r.unit_price == null ? null : Math.round(Number(r.unit_price) * r.quantity * 100) / 100,
        })),
      };
    }
    case "invoices": {
      const got = await all(lib("acq_invoices", "*, acq_vendors(name)", "invoice_date"));
      return { capped: got.capped, rows: got.rows.map(({ acq_vendors, order_ids, ...r }) => ({ ...r, vendor: nameOf(acq_vendors).name, amount: Number(r.amount), orders: (order_ids || []).length })) };
    }
    case "subscriptions": {
      const got = await all(lib("acq_subscriptions", "*, acq_vendors(name), acq_funds(code)", "end_date", true));
      return { capped: got.capped, rows: got.rows.map(({ acq_vendors, acq_funds, ...r }) => ({ ...r, vendor: nameOf(acq_vendors).name, fund: nameOf(acq_funds).code })) };
    }
    case "vendors":
      return all(lib("acq_vendors", "*", "name", true));
    case "funds":
      return all(lib("acq_funds", "*", "year"));
  }
}

async function run(q: ListQuery, library: string) {
  const { rows, capped } = await loadRows(q.entity, library);
  return { rows: runQuery(rows, q), capped };
}

listsRoutes.post("/lists/run", async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const body = await c.req.json().catch(() => ({}));
  const read = readQuery(body.query);
  if ("error" in read) return c.json({ error: read.error }, 400);
  try {
    const { rows, capped } = await run(read.query, st.library);
    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 500);
    return c.json({ query: read.query, total: rows.length, rows: rows.slice(0, limit), capped });
  } catch (e: any) {
    console.error("[lists] run:", e?.message || e);
    return c.json({ error: "The list could not be made" }, 500);
  }
});

listsRoutes.post("/lists/export", async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const body = await c.req.json().catch(() => ({}));
  const read = readQuery(body.query);
  if ("error" in read) return c.json({ error: read.error }, 400);
  try {
    const { rows } = await run(read.query, st.library);
    return c.body(toCsv(rows, read.query, body.lang === "ar"), 200, { "Content-Type": "text/csv; charset=utf-8" });
  } catch (e: any) {
    console.error("[lists] export:", e?.message || e);
    return c.json({ error: "The list could not be exported" }, 500);
  }
});

const maySee = (st: Staff) => (l: any) => !l.private || l.created_by === st.username;

listsRoutes.get("/lists", async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const { data, error } = await sb().from("lists").select("*").eq("library", st.library).order("updated_at", { ascending: false }).limit(500);
  if (error) return c.json({ error: "Lists could not be read" }, 500);
  return c.json({ lists: (data || []).filter(maySee(st)) });
});

function readSaved(body: any): { row: Record<string, unknown> } | { error: string } {
  const name = String(body?.name || "").trim();
  if (!name || name.length > 120) return { error: "Give the list a name (up to 120 characters)" };
  const read = readQuery(body.query);
  if ("error" in read) return read;
  return { row: { name, description: String(body.description || "").trim().slice(0, 500) || null, query: read.query, entity: read.query.entity, private: !!body.private } };
}

listsRoutes.post("/lists", async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const read = readSaved(await c.req.json().catch(() => ({})));
  if ("error" in read) return c.json({ error: read.error }, 400);
  const { data, error } = await sb().from("lists").insert({ ...read.row, library: st.library, created_by: st.username }).select().single();
  if (error) return c.json({ error: /unique|duplicate/i.test(error.message) ? "There is already a list with this name" : "The list could not be saved" }, /unique|duplicate/i.test(error.message) ? 409 : 500);
  return c.json({ list: data }, 201);
});

/** A saved list of this library this person may see. */
async function seen(c: any, st: Staff) {
  const { data } = await sb().from("lists").select("*").eq("library", st.library).eq("id", c.req.param("id")).maybeSingle();
  return data && maySee(st)(data) ? data : null;
}
/** A saved list this person may change: their own, or any of the library's for a reviewer or the Super Admin. */
async function own(c: any, st: Staff) {
  const data = await seen(c, st);
  if (!data) return null;
  return data.created_by === st.username || st.role !== "cataloger" ? data : null;
}

listsRoutes.put("/lists/:id", async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  if (!(await own(c, st))) return c.json({ error: "Only its maker or a reviewer can change this list" }, 403);
  const read = readSaved(await c.req.json().catch(() => ({})));
  if ("error" in read) return c.json({ error: read.error }, 400);
  const { data, error } = await sb().from("lists").update({ ...read.row, updated_at: new Date().toISOString() }).eq("id", c.req.param("id")).eq("library", st.library).select().single();
  if (error) return c.json({ error: "The list could not be saved" }, 500);
  return c.json({ list: data });
});

listsRoutes.delete("/lists/:id", async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  if (!(await own(c, st))) return c.json({ error: "Only its maker or a reviewer can delete this list" }, 403);
  const { error } = await sb().from("lists").delete().eq("id", c.req.param("id")).eq("library", st.library);
  if (error) return c.json({ error: "The list could not be deleted" }, 500);
  return c.json({ ok: true });
});

listsRoutes.post("/lists/:id/refresh", async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const list = await seen(c, st);
  if (!list) return c.json({ error: "No such list" }, 404);
  const read = readQuery(list.query);
  if ("error" in read) return c.json({ error: read.error }, 400);
  try {
    const { rows, capped } = await run(read.query, st.library);
    const at = new Date().toISOString();
    await sb().from("lists").update({ row_count: rows.length, refreshed_at: at, refreshed_by: st.username }).eq("id", list.id);
    return c.json({ list: { ...list, row_count: rows.length, refreshed_at: at }, total: rows.length, rows: rows.slice(0, 100), capped });
  } catch (e: any) {
    console.error("[lists] refresh:", e?.message || e);
    return c.json({ error: "The list could not be refreshed" }, 500);
  }
});

// ---- Bulk change (bulkEdit.tsx): preview, apply, undo ----

async function plan(st: Staff, body: any) {
  const read = readQuery(body?.query);
  if ("error" in read) return { error: read.error };
  const bulk = readBulk(read.query.entity, body);
  if ("error" in bulk) return { error: bulk.error };
  const { rows } = await run(read.query, st.library);
  return { query: read.query, field: bulk.field, value: bulk.value, ...planChanges(read.query.entity, rows, bulk.field, bulk.value) };
}

listsRoutes.post("/lists/bulk/preview", async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  try {
    const p = await plan(st, await c.req.json().catch(() => ({})));
    if ("error" in p) return c.json({ error: p.error }, 400);
    return c.json({ total: p.changes.length, changes: p.changes.slice(0, 500), unchanged: p.unchanged, skipped: p.skipped.slice(0, 200), skippedTotal: p.skipped.length, max: MAX_CHANGES });
  } catch (e: any) {
    console.error("[lists] bulk preview:", e?.message || e);
    return c.json({ error: "The preview could not be made" }, 500);
  }
});

/** Writes one change, or its undo (from → to), only while the row still has `from`. True when written. */
async function write(st: Staff, field: BulkField, change: Change, from: unknown, to: unknown, by: string, note: string): Promise<boolean> {
  if (field.entity === "copies") {
    const rec: any = await recordStore.getRecord(change.recordId!);
    if (!rec) return false;
    const now = copiesIn(rec.document).find((x) => x.barcode === change.key);
    if (!now || (now.library && now.library !== st.library)) return false;
    const current = field.key === "location" ? now.location || null : now.referenceOnly;
    if (field.key === "location" ? (current ?? "") !== (from ?? "") : !!current !== !!from) return false;
    const document = withCopyChange(rec.document, change.key, field.key as "location" | "reference_only", to);
    if (!document) return false;
    await recordStore.saveRecord({ ...rec, document, saved: new Date().toISOString() }, by, note, Number.isInteger(rec.version) ? rec.version : undefined);
    return true;
  }
  let q = sb().from(field.table!).update({ [field.column!]: to, ...(field.table === "loans" ? {} : { updated_at: new Date().toISOString() }) })
    .eq("id", change.key).eq("library", st.library);
  q = from === null || from === undefined ? q.is(field.column!, null) : q.eq(field.column!, from);
  if (field.table === "loans") q = q.is("returned_at", null);
  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  return (data || []).length > 0;
}

/** Copies of one record are changed in one new version of it, the others one row at a time. */
async function writeAll(st: Staff, field: BulkField, changes: Change[], undo: boolean, note: string) {
  let done = 0, kept = 0;
  const ok: boolean[] = [];
  for (const ch of changes) {
    try {
      const w = await write(st, field, ch, undo ? ch.after : ch.before, undo ? ch.before : ch.after, st.username, note);
      ok.push(w);
      if (w) done++; else kept++;
    } catch (e: any) {
      console.error("[lists] bulk write:", e?.message || e);
      ok.push(false); kept++;
    }
  }
  return { done, kept, ok };
}

listsRoutes.post("/lists/bulk/apply", async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const body = await c.req.json().catch(() => ({}));
  try {
    const p = await plan(st, body);
    if ("error" in p) return c.json({ error: p.error }, 400);
    if (!p.changes.length) return c.json({ error: "Nothing to change: every row already has this value" }, 409);
    if (p.changes.length > MAX_CHANGES) return c.json({ error: `At most ${MAX_CHANGES} rows in one job; narrow the list` }, 400);
    if (Number(body.expect) !== p.changes.length) return c.json({ error: "The list changed since the preview; look at the preview again" }, 409);
    const label = `${p.field.en} → ${p.field.type === "bool" ? (p.value ? "yes" : "no") : p.field.type === "choice" ? p.field.choices?.find((x) => x.v === p.value)?.en || p.value : p.value}`;
    const { data: job, error } = await sb().from("bulk_jobs").insert({
      library: st.library, entity: p.query.entity, field: p.field.key, value: String(p.value), label,
      query: p.query, changes: p.changes, total: p.changes.length, created_by: st.username,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const r = await writeAll(st, p.field, p.changes, false, `bulk change ${job.id}: ${label}`);
    const changes = p.changes.map((ch, i) => ({ ...ch, applied: r.ok[i] }));
    await sb().from("bulk_jobs").update({ changes, applied: r.done, failed: r.kept }).eq("id", job.id);
    return c.json({ job: { id: job.id, label, total: p.changes.length, applied: r.done, failed: r.kept } });
  } catch (e: any) {
    console.error("[lists] bulk apply:", e?.message || e);
    return c.json({ error: "The change could not be made" }, 500);
  }
});

listsRoutes.get("/lists/bulk", async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const { data, error } = await sb().from("bulk_jobs")
    .select("id, entity, field, value, label, total, applied, failed, created_by, created_at, undone_at, undone_by, restored, kept")
    .eq("library", st.library).order("created_at", { ascending: false }).limit(30);
  if (error) return c.json({ error: "Bulk changes could not be read" }, 500);
  return c.json({ jobs: data || [] });
});

listsRoutes.post("/lists/bulk/:id/undo", async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const { data: job } = await sb().from("bulk_jobs").select("*").eq("id", Number(c.req.param("id"))).eq("library", st.library).maybeSingle();
  if (!job) return c.json({ error: "No such bulk change" }, 404);
  if (job.undone_at) return c.json({ error: "This change was undone already" }, 409);
  if (job.created_by !== st.username && st.role === "cataloger") return c.json({ error: "Only who made the change, or a reviewer, can undo it" }, 403);
  const field = bulkFieldOf(job.entity, job.field);
  if (!field) return c.json({ error: "This change can no longer be undone" }, 409);
  // Mark it first, so two undos at once cannot both run.
  const { data: claimed } = await sb().from("bulk_jobs").update({ undone_at: new Date().toISOString(), undone_by: st.username })
    .eq("id", job.id).is("undone_at", null).select("id");
  if (!claimed?.length) return c.json({ error: "This change was undone already" }, 409);
  try {
    const applied = (job.changes || []).filter((ch: any) => ch.applied !== false);
    const r = await writeAll(st, field, applied, true, `undo bulk change ${job.id}`);
    await sb().from("bulk_jobs").update({ restored: r.done, kept: r.kept }).eq("id", job.id);
    return c.json({ restored: r.done, kept: r.kept });
  } catch (e: any) {
    console.error("[lists] bulk undo:", e?.message || e);
    return c.json({ error: "The undo could not be finished" }, 500);
  }
});

listsRoutes.get("/lists/ready", async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const loaded = new Map<EntityId, Promise<{ rows: Row[]; capped: boolean }>>();
  const rowsOf = (e: EntityId) => { if (!loaded.has(e)) loaded.set(e, loadRows(e, st.library)); return loaded.get(e)!; };
  const now = new Date();
  const lists = await Promise.all(READY_LISTS.map(async (l) => {
    try { return { ...l, total: runQuery((await rowsOf(l.query.entity)).rows, l.query, now).length }; }
    catch (e: any) { console.error(`[lists] ready ${l.id}:`, e?.message || e); return { ...l, total: null }; }
  }));
  return c.json({ lists });
});

export default listsRoutes;
