/**
 * Linking Moon's works to LC Works and Hubs (plan step A3; lcWorks.tsx has the matching). Library staff only.
 *
 *   GET  /lc-works                 every record, the ones not yet linked first, with what cataloguers decided
 *   GET  /lc-works/:id             the record's work as Moon reads it, and LC's candidates scored, best first
 *   POST /lc-works/:id {accept: uri, kind} | {reject: uri} | {noMatch: true} | {clear: true}
 *        accept writes the link into the record (a new version): a Hub as bf:expressionOf, an LC Work as owl:sameAs
 *
 * Decisions (rejected candidates, "not in LC") are kept per record, as for entities (reconcileQueue.tsx).
 */
import { Hono } from "npm:hono";
import { getClient } from "./db.tsx";
import * as kv from "./kv_store.tsx";
import * as recordStore from "./recordStore.tsx";
import { getSession } from "./accountRoutes.tsx";
import { readNote, applyNote, parseNoteAction, NO_MATCH_DAYS } from "./reconcileQueue.tsx";
import { workFacts, parseHits, rank, searchesFor, withLcLink, type Candidate, type LcKind } from "./lcWorks.tsx";

const lcWorksRoutes = new Hono();
const sb = (): any => getClient();
const NOTE = (id: string) => `moon:lcwork:${id}`;
const LC_TIMEOUT = 12_000;

async function staffOf(c: any) {
  const s = await getSession(c);
  return s && ["admin", "reviewer", "cataloger"].includes(s.role) ? s : null;
}
const denied = (c: any) => c.json({ error: "Library staff only (cataloguers, reviewers and the Super Admin)" }, 403);
const validId = (id: string) => /^[A-Za-z0-9._:-]{1,120}$/.test(id);

lcWorksRoutes.get("/lc-works", async (c) => {
  if (!(await staffOf(c))) return denied(c);
  try {
    const { data, error } = await sb().from("records").select("id, title, status, document, updated_at").is("deleted_at", null).order("updated_at", { ascending: false }).limit(2000);
    if (error) throw new Error(error.message);
    const notes = await kv.getByPrefix("moon:lcwork:").catch(() => []);
    const byId = new Map<string, any>();
    for (const n of notes as any[]) { const v = n?.value ?? n; if (v?.id) byId.set(v.id, v); }
    const now = Date.now();
    const rows = (data || []).map((r: any) => {
      const f = workFacts(r.document);
      const decision = readNote(byId.get(r.id));
      return { id: r.id, title: r.title, status: r.status, linked: f.linked, decision };
    }).filter((r: any) => !(r.decision.noMatch && now - new Date(r.decision.noMatch.at).getTime() < NO_MATCH_DAYS * 86_400_000));
    const order = (r: any) => (r.linked.length ? 2 : r.decision.checkedAt ? 1 : 0);
    rows.sort((a: any, b: any) => order(a) - order(b) || String(a.title).localeCompare(String(b.title), "ar"));
    return c.json({ records: rows, linked: rows.filter((r: any) => r.linked.length).length, total: rows.length });
  } catch (e: any) {
    console.error("[lc-works] list:", e?.message || e);
    return c.json({ error: "The records could not be read" }, 500);
  }
});

async function suggest(q: string, kind: LcKind): Promise<Candidate[]> {
  const url = `https://id.loc.gov/resources/${kind}s/suggest2?q=${encodeURIComponent(q)}&searchtype=keyword&count=10`;
  const r = await fetch(url, { signal: AbortSignal.timeout(LC_TIMEOUT), headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`LC ${kind}s: ${r.status}`);
  return parseHits(await r.json(), kind);
}

lcWorksRoutes.get("/lc-works/:id", async (c) => {
  if (!(await staffOf(c))) return denied(c);
  const id = c.req.param("id");
  if (!validId(id)) return c.json({ error: "Not a record number" }, 400);
  try {
    const rec: any = await recordStore.getRecord(id);
    if (!rec) return c.json({ error: "No record has this number" }, 404);
    const facts = workFacts(rec.document);
    const note = readNote((await kv.get(NOTE(id)).catch(() => null)));
    const searches = searchesFor(facts);
    const got = await Promise.allSettled(searches.flatMap((q) => (["work", "hub"] as const).map((k) => suggest(q, k))));
    const cands = got.flatMap((g) => (g.status === "fulfilled" ? g.value : []));
    const lcDown = got.length > 0 && got.every((g) => g.status === "rejected");
    return c.json({ id, title: rec.title, facts, searches, candidates: rank(facts, cands, [...note.rejected, ...facts.linked]), decision: note, ...(lcDown ? { lcDown: true } : {}) });
  } catch (e: any) {
    console.error("[lc-works] candidates:", e?.message || e);
    return c.json({ error: "LC could not be searched just now" }, 502);
  }
});

lcWorksRoutes.post("/lc-works/:id", async (c) => {
  const s = await staffOf(c);
  if (!s) return denied(c);
  const id = c.req.param("id");
  if (!validId(id)) return c.json({ error: "Not a record number" }, 400);
  const body = await c.req.json().catch(() => ({}));
  try {
    if (typeof body.accept === "string") {
      const uri = body.accept.trim();
      const kind: LcKind | null = /^http:\/\/id\.loc\.gov\/resources\/hubs\/[\w-]{1,80}$/.test(uri) ? "hub" : /^http:\/\/id\.loc\.gov\/resources\/works\/[\w-]{1,80}$/.test(uri) ? "work" : null;
      if (!kind) return c.json({ error: "Not an LC Work or Hub address" }, 400);
      const rec: any = await recordStore.getRecord(id);
      if (!rec) return c.json({ error: "No record has this number" }, 404);
      const document = withLcLink(rec.document, uri, kind);
      if (!document) return c.json({ error: "This record has no Work to link" }, 409);
      await recordStore.saveRecord({ ...rec, document, saved: new Date().toISOString() }, s.username, `LC ${kind} linked: ${uri}`, Number.isInteger(rec.version) ? rec.version : undefined);
      await kv.set(NOTE(id), { id, ...applyNote(await kv.get(NOTE(id)).catch(() => null), { checked: true }, s.username) });
      return c.json({ linked: uri, kind, facts: workFacts(document) });
    }
    const action = parseNoteAction(body);
    if (!action) return c.json({ error: "Accept, reject, no match, or clear?" }, 400);
    const note = applyNote(await kv.get(NOTE(id)).catch(() => null), action, s.username);
    await kv.set(NOTE(id), { id, ...note });
    return c.json({ decision: note });
  } catch (e: any) {
    if (/conflict|version/i.test(e?.message || "")) return c.json({ error: "Someone saved this record just now; try again" }, 409);
    console.error("[lc-works] decide:", e?.message || e);
    return c.json({ error: "The decision could not be saved" }, 500);
  }
});

export default lcWorksRoutes;
