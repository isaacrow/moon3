// Plain pages for Moon's people, organisations, places and subjects (OPAC plan, stage 5), like the book pages:
// readable without JavaScript, for search engines and AI assistants. https://mooon.site/resource/?entity=<kind>/<id>
//
// Each shows the entity's names in every form it has (both scripts once step 2 has filled them), its dates, its
// outside links (LC, VIAF, Wikidata …: the same thing elsewhere), and the published books that name it, with
// schema.org markup (Person, Organization, Place, or DefinedTerm). Book pages link to the entities they name,
// so a crawler that finds one book finds its people and subjects. Made from the data on every request.

import { esc, SITE } from "./seoPages.tsx";

export const ENTITY_KINDS = ["agent", "place", "topic", "genre"] as const;
const MOON_ENTITY = /^https:\/\/mooon\.site\/resource\/(agent|place|topic|genre)\/([A-Za-z0-9._:-]{1,120})$/;

export interface EntityLike {
  id: string; kind: string; label: string; variants?: string[]; sameAs?: string[]; note?: string | null;
  data?: Record<string, unknown>; mergedInto?: string | null;
}
export interface EntityBook { id: string; title: string; creator?: string; year?: string }

export const entityPlainUrl = (kind: string, id: string, site = SITE) => `${site}/resource/?entity=${encodeURIComponent(`${kind}/${id}`)}`;
export const entityUri = (kind: string, id: string, site = SITE) => `${site}/resource/${kind}/${id}`;

/** "agent/ali-abunimah-8007e742" → its kind and id, or null when it is not one. */
export function parseEntityParam(v: unknown): { kind: string; id: string } | null {
  const m = typeof v === "string" ? v.match(/^(agent|place|topic|genre)\/([A-Za-z0-9._:-]{1,120})$/) : null;
  return m ? { kind: m[1], id: m[2] } : null;
}

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const text = (v: any): string => {
  for (const x of list(v)) {
    if (typeof x === "string") return x.trim();
    if (x && typeof x === "object") { const t = text(x["@value"] ?? x["rdfs:label"]); if (t) return t; }
  }
  return "";
};

/** Every Moon entity a record names (contributors, subjects, places, genres), once each, with the label the record gives. */
export function moonEntitiesOf(document: any): Array<{ kind: string; id: string; label: string }> {
  const out = new Map<string, { kind: string; id: string; label: string }>();
  const visit = (v: any, depth: number) => {
    if (depth > 6 || v == null) return;
    if (Array.isArray(v)) { v.forEach((x) => visit(x, depth + 1)); return; }
    if (typeof v !== "object") return;
    const id = typeof v["@id"] === "string" ? v["@id"] : "";
    const m = id.match(MOON_ENTITY);
    if (m && !out.has(id)) out.set(id, { kind: m[1], id: m[2], label: text(v["rdfs:label"] ?? v["madsrdf:authoritativeLabel"]) });
    for (const [k, x] of Object.entries(v)) if (k !== "@id" && k !== "@type") visit(x, depth + 1);
  };
  visit(Array.isArray(document?.["@graph"]) ? document["@graph"] : [], 0);
  // A label from the record's own node for the same address, when the reference itself had none.
  for (const n of Array.isArray(document?.["@graph"]) ? document["@graph"] : []) {
    const hit = typeof n?.["@id"] === "string" && out.get(n["@id"]);
    if (hit && !hit.label) hit.label = text(n["rdfs:label"] ?? n["madsrdf:authoritativeLabel"]);
  }
  return [...out.values()];
}

/** Whether a record names this entity (by its address anywhere in the record). */
export const namesEntity = (document: any, kind: string, id: string) => JSON.stringify(document || {}).includes(`"${entityUri(kind, id)}"`);

// The entity file writes the type in lower case ("person", "organization"); older data may capitalise it.
const SCHEMA_TYPE: Record<string, string> = { person: "Person", organization: "Organization", family: "Organization", meeting: "Event", jurisdiction: "Organization" };

/** schema.org markup, as JSON safe inside a <script> tag. */
export function entityJsonLd(e: EntityLike, site = SITE): string {
  const agentType = String(e.data?.agentType || "").toLowerCase();
  const type = e.kind === "agent" ? SCHEMA_TYPE[agentType] || "Person" : e.kind === "place" ? "Place" : "DefinedTerm";
  const birth = text(e.data?.birthDate), death = text(e.data?.deathDate);
  const data = {
    "@context": "https://schema.org",
    "@type": type,
    "@id": entityUri(e.kind, e.id, site),
    name: e.label,
    ...((e.variants || []).length ? { alternateName: (e.variants || []).slice(0, 20) } : {}),
    ...(type === "Person" && birth ? { birthDate: birth } : {}),
    ...(type === "Person" && death ? { deathDate: death } : {}),
    ...((e.sameAs || []).length ? { sameAs: (e.sameAs || []).filter((u) => /^https?:\/\//.test(u)).slice(0, 20) } : {}),
    url: entityPlainUrl(e.kind, e.id, site),
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const KIND_WORDS: Record<string, [string, string]> = { agent: ["Person or body", "شخص أو هيئة"], place: ["Place", "مكان"], topic: ["Subject", "موضوع"], genre: ["Genre", "نوع"] };
const sourceName = (u: string) => (/id\.loc\.gov/.test(u) ? "Library of Congress" : /viaf\.org/.test(u) ? "VIAF" : /wikidata\.org/.test(u) ? "Wikidata" : /isni\.org/.test(u) ? "ISNI" : /orcid\.org/.test(u) ? "ORCID" : /fast/.test(u) ? "FAST" : "Link");

/** The entity as a complete page. */
export function entityPageHtml(e: EntityLike, books: EntityBook[], bookUrl: (id: string) => string, site = SITE): string {
  const [en, ar] = KIND_WORDS[e.kind] || ["Entity", "كيان"];
  const birth = text(e.data?.birthDate), death = text(e.data?.deathDate);
  const forms = [...new Set((e.variants || []).filter((v) => v && v !== e.label))];
  const description = [e.label, forms.length ? `also ${forms.slice(0, 3).join(", ")}` : "", birth || death ? `(${birth || "?"}–${death || ""})` : "",
    books.length ? `${books.length} ${books.length === 1 ? "book" : "books"} in the Moon catalogue` : ""].filter(Boolean).join(" · ").slice(0, 280);
  const row = (label: string, value: string) => (value ? `<dt>${esc(label)}</dt><dd dir="auto">${value}</dd>` : "");
  return `<!doctype html>
<html lang="${/[؀-ۿ]/.test(e.label) ? "ar" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(e.label)} | Moon Catalogue · فهرس مون</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(entityPlainUrl(e.kind, e.id, site))}">
<link rel="alternate" type="application/ld+json" href="${esc(entityUri(e.kind, e.id, site))}.jsonld">
<meta property="og:title" content="${esc(e.label)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:site_name" content="Moon · مون">
<script type="application/ld+json">${entityJsonLd(e, site)}</script>
<style>
body{font-family:system-ui,"Segoe UI",Tahoma,sans-serif;max-width:46rem;margin:0 auto;padding:2rem 1rem;line-height:1.7;color:#1e293b;background:#f8fafc}
.kind{color:#64748b;font-size:.9rem}h1{font-size:1.6rem;margin:.1rem 0 1rem}dl{display:grid;grid-template-columns:max-content 1fr;gap:.35rem 1.25rem}
dt{color:#64748b}dd{margin:0}a{color:#0369a1}ul{padding-inline-start:1.2rem}footer{margin-top:2rem;font-size:.85rem;color:#64748b}
</style>
</head>
<body>
<main>
<div class="kind">${esc(en)} · ${esc(ar)}</div>
<h1 dir="auto">${esc(e.label)}</h1>
<dl>
${row("Other forms · أشكال أخرى", forms.map((f) => `<span dir="auto">${esc(f)}</span>`).join(" · "))}
${row("Born · ولد", esc(birth))}
${row("Died · توفي", esc(death))}
${row("Same as · هو نفسه في", (e.sameAs || []).filter((u) => /^https?:\/\//.test(u)).map((u) => `<a href="${esc(u)}">${esc(sourceName(u))}</a>`).join(" · "))}
${row("Note · ملاحظة", esc(e.note || ""))}
</dl>
<h2>${books.length ? `Books · الكتب (${books.length})` : "No published book names it yet · لا كتاب منشور يذكره بعد"}</h2>
${books.length ? `<ul>${books.map((b) => `<li><a href="${esc(bookUrl(b.id))}" dir="auto">${esc(b.title)}</a>${b.creator ? ` — <span dir="auto">${esc(b.creator)}</span>` : ""}${b.year ? ` (${esc(b.year)})` : ""}</li>`).join("")}</ul>` : ""}
<footer><p>Linked data: <a href="${esc(entityUri(e.kind, e.id, site))}.jsonld">JSON-LD</a> · <a href="${esc(entityUri(e.kind, e.id, site))}.ttl">Turtle</a> · <a href="${esc(`${site}/opac.html`)}">The catalogue</a> · <a href="${esc(`${site}/llms.txt`)}">About this catalogue</a></p></footer>
</main>
</body>
</html>
`;
}
