/**
 * The manuscripts catalogue's routes (the table is in the manuscripts migration; scripts/import-manuscripts.mjs
 * fills it from Al-Qamar). Only the Super Admin and accounts the Super Admin gave the "manuscripts" role:
 * everyone else, signed in or not, gets 403 and sees nothing of the catalogue.
 *
 *   GET /manuscripts/facets                                   total, and the libraries, subjects and languages to filter by
 *   GET /manuscripts/search?q=&library=&subject=&language=&page=   one page of 50, with the total
 *   GET /manuscripts/:id                                      one manuscript with all its source fields
 */
import { Hono } from "npm:hono";
import { getClient } from "./db.tsx";
import { getSession, canSeeManuscripts } from "./accountRoutes.tsx";

const manuscriptsRoutes = new Hono();
const P = "/manuscripts";
const PAGE = 50;
const FACETS_TTL_MS = 10 * 60_000;
const sb = (): any => getClient();

const denied = (c: any) => c.json({ error: "The manuscripts catalogue is for the Super Admin and Manuscripts accounts" }, 403);
const failed = (c: any, what: string, e: unknown) => {
  console.error(`[manuscripts] ${what}:`, e instanceof Error ? e.message : e);
  return c.json({ error: `${what} failed` }, 500);
};
const allowed = async (c: any) => canSeeManuscripts(await getSession(c));
/** A filter value from the query string: trimmed, at most 300 characters, or null when empty. */
const filter = (v: string | undefined) => {
  const s = (v || "").trim().slice(0, 300);
  return s ? s : null;
};

// The filter lists change only when the catalogue is imported again, so they are kept for a while.
let facets: { at: number; data: unknown } | null = null;

manuscriptsRoutes.get(`${P}/facets`, async (c) => {
  if (!(await allowed(c))) return denied(c);
  try {
    if (!facets || Date.now() - facets.at > FACETS_TTL_MS) {
      const { data, error } = await sb().rpc("moon_manuscript_facets");
      if (error) throw new Error(error.message);
      facets = { at: Date.now(), data };
    }
    return c.json(facets.data);
  } catch (e) { return failed(c, "The filter lists", e); }
});

manuscriptsRoutes.get(`${P}/search`, async (c) => {
  if (!(await allowed(c))) return denied(c);
  const page = Math.max(0, Math.min(10_000, Math.floor(Number(c.req.query("page")) || 0)));
  try {
    const { data, error } = await sb().rpc("moon_search_manuscripts", {
      p_q: (c.req.query("q") || "").trim().slice(0, 200),
      p_library: filter(c.req.query("library")),
      p_subject: filter(c.req.query("subject")),
      p_language: filter(c.req.query("language")),
      p_limit: PAGE,
      p_offset: page * PAGE,
    });
    if (error) throw new Error(error.message);
    return c.json({ ...(data || { total: 0, rows: [] }), page, pageSize: PAGE });
  } catch (e) { return failed(c, "The search", e); }
});

manuscriptsRoutes.get(`${P}/:id`, async (c) => {
  if (!(await allowed(c))) return denied(c);
  const id = c.req.param("id");
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(id)) return c.json({ error: "No manuscript has this number" }, 404);
  try {
    const { data, error } = await sb().from("manuscripts").select("id, view_url, fields, imported_at").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return c.json({ error: "No manuscript has this number" }, 404);
    return c.json({ id: data.id, viewUrl: data.view_url, fields: data.fields || {}, importedAt: data.imported_at });
  } catch (e) { return failed(c, "Opening the manuscript", e); }
});

export default manuscriptsRoutes;
