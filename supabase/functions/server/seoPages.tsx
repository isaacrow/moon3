// Pages for search engines and AI assistants that do not run JavaScript.
//
// The public catalogue (opac.html) is built in the reader's browser, so a crawler that does not run scripts sees an
// empty page. These are made by the server, from the published records, every time they are asked for, so a book that
// is added, changed or unpublished shows up (or goes) here by itself, with nothing to edit by hand:
//   - bookPageHtml:  one book as a plain page, with its facts and schema.org markup (https://mooon.site/resource/?book=<id>)
//   - booksText:     every published book on one line each, for assistants and tools (https://mooon.site/resource/books.txt)
// No imports besides Ask Moon's reader of a stored record, which is pure.

import { askRecordOf, type AskRecord } from "./askMoon.tsx";

export const SITE = "https://mooon.site";

export interface BookFacts extends AskRecord {
  isbn?: string;
  publisher?: string;
  /** The Work's permanent linked-data address (mooon.site/resource/work/...). */
  workUri?: string;
}

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const text = (v: any): string => {
  for (const x of list(v)) {
    if (typeof x === "string" && x.trim()) return x.trim();
    if (x && typeof x === "object") {
      const t = typeof x["@value"] === "string" ? x["@value"].trim() : text(x["rdfs:label"] ?? x["bf:mainTitle"] ?? x["mainTitle"] ?? x["bf:value"]);
      if (t) return t;
    }
  }
  return "";
};
const typed = (n: any, t: string) => list(n?.["@type"]).some((x: any) => String(x).endsWith(t));
const get = (n: any, k: string) => n?.[`bf:${k}`] ?? n?.[k];

/** The facts of one published record: Ask Moon's reading of it, plus ISBN, publisher and its permanent address. */
export function bookFactsOf(r: { id: string; title?: string; document?: any }, site = SITE): BookFacts {
  const base = askRecordOf(r, site);
  const graph: any[] = Array.isArray(r.document?.["@graph"]) ? r.document["@graph"] : [];
  const byId = new Map(graph.map((n) => [n?.["@id"], n]));
  const deref = (v: any) => (v && typeof v === "object" && v["@id"] && byId.has(v["@id"]) && Object.keys(v).length === 1 ? byId.get(v["@id"]) : v);
  const instance = graph.find((n) => typed(n, "Instance")) || {};
  const work = graph.find((n) => typed(n, "Work") && String(n?.["@id"] || "").startsWith(`${site}/resource/work/`));
  const isbn = list(get(instance, "identifiedBy")).map(deref).filter((i) => typed(i, "Isbn")).map((i) => text(get(i, "value") ?? i?.["rdf:value"])).find(Boolean);
  const publisher = list(get(instance, "provisionActivity")).map(deref).map((p) => text(deref(get(p, "agent")))).find(Boolean);
  return { ...base, ...(isbn ? { isbn } : {}), ...(publisher ? { publisher } : {}), ...(work ? { workUri: work["@id"] } : {}) };
}

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** The address of the book in the catalogue (the page readers use). */
export const catalogueUrl = (id: string, site = SITE) => `${site}/opac.html?work=${encodeURIComponent(id)}`;
/** The address of the plain page made for crawlers and assistants. */
export const plainPageUrl = (id: string, site = SITE) => `${site}/resource/?book=${encodeURIComponent(id)}`;

/** A short description for results and link previews. */
export function descriptionOf(f: BookFacts): string {
  const head = [f.title, f.creator ? `— ${f.creator}` : "", f.year ? `(${f.year})` : ""].filter(Boolean).join(" ");
  const about = f.summary ? f.summary.replace(/\s+/g, " ").slice(0, 200) : f.subjects?.length ? `Subjects: ${f.subjects.slice(0, 5).join("; ")}.` : "";
  return `${head}. ${about}`.replace(/\s+/g, " ").trim().slice(0, 280);
}

/** schema.org Book markup, as a JSON string that is safe inside a <script> tag. */
export function bookJsonLd(f: BookFacts, site = SITE): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: f.title,
    url: catalogueUrl(f.id, site),
    ...(f.creator ? { author: { "@type": "Person", name: f.creator } } : {}),
    ...(f.language ? { inLanguage: f.language } : {}),
    ...(f.subjects?.length ? { about: f.subjects.slice(0, 12) } : {}),
    ...(f.isbn ? { isbn: f.isbn } : {}),
    ...(f.publisher ? { publisher: { "@type": "Organization", name: f.publisher } } : {}),
    ...(f.year ? { datePublished: f.year } : {}),
    ...(f.summary ? { description: f.summary.slice(0, 500) } : {}),
    ...(f.workUri ? { sameAs: [f.workUri] } : {}),
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** One book as a complete page: readable without scripts, with preview tags and schema.org markup. */
export function bookPageHtml(f: BookFacts, site = SITE): string {
  const url = catalogueUrl(f.id, site);
  const description = descriptionOf(f);
  const title = [f.title, f.creator].filter(Boolean).join(" — ");
  const row = (label: string, value: string | undefined) => (value ? `<dt>${esc(label)}</dt><dd dir="auto">${esc(value)}</dd>` : "");
  const alternates = f.workUri
    ? (["jsonld", "ttl", "rdf", "nt"] as const).map((e) => `<a href="${esc(`${f.workUri}.${e}`)}">${e === "jsonld" ? "JSON-LD" : e === "ttl" ? "Turtle" : e === "rdf" ? "RDF/XML" : "N-Triples"}</a>`).join(" · ")
    : "";
  return `<!doctype html>
<html lang="${esc(f.language && /^[a-z]{2,3}$/.test(f.language) ? f.language : "ar")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | Moon Catalogue · فهرس مون</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="book">
<meta property="og:site_name" content="Moon · مون">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<script type="application/ld+json">${bookJsonLd(f, site)}</script>
<style>
body{font-family:system-ui,"Segoe UI",Tahoma,sans-serif;max-width:46rem;margin:0 auto;padding:2rem 1rem;line-height:1.7;color:#1e293b;background:#f8fafc}
h1{font-size:1.6rem;margin:0 0 .25rem}.by{color:#475569;margin:0 0 1.5rem}dl{display:grid;grid-template-columns:max-content 1fr;gap:.35rem 1.25rem}
dt{color:#64748b}dd{margin:0}a{color:#0369a1}.open{display:inline-block;margin:1.5rem 0;padding:.6rem 1.1rem;border-radius:999px;background:#0f172a;color:#fff;text-decoration:none}
footer{margin-top:2rem;font-size:.85rem;color:#64748b}
</style>
</head>
<body>
<main>
<h1 dir="auto">${esc(f.title)}</h1>
${f.creator ? `<p class="by" dir="auto">${esc(f.creator)}</p>` : ""}
${f.summary ? `<p dir="auto">${esc(f.summary)}</p>` : ""}
<dl>
${row("Year · السنة", f.year)}
${row("Publisher · الناشر", f.publisher)}
${row("ISBN", f.isbn)}
${row("Language · اللغة", f.language)}
${row("Subjects · الموضوعات", f.subjects?.join(" · "))}
</dl>
<a class="open" href="${esc(url)}">Open in the catalogue · افتح في الفهرس</a>
<footer>${alternates ? `<p>Linked data: ${alternates}</p>` : ""}<p><a href="${esc(`${site}/resource/`)}">All published records</a> · <a href="${esc(`${site}/llms.txt`)}">About this catalogue (for AI assistants)</a></p></footer>
</main>
</body>
</html>
`;
}

/** Every published book on one line, for assistants and tools: "Title — Author (year): address". */
export function booksText(allFacts: BookFacts[], site = SITE): string {
  // Empty records saved with no title ("Untitled") are not worth an assistant's time.
  const all = allFacts.filter((f) => !/^untitled$/i.test(f.title.trim()));
  const lines = all
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((f) => `- ${[f.title, f.creator ? `— ${f.creator}` : "", f.year ? `(${f.year})` : ""].filter(Boolean).join(" ")}: ${plainPageUrl(f.id, site)}`);
  return `# Moon catalogue: all published books (${all.length})\n# Each address opens a plain page with the book's facts. The catalogue itself is ${site}/opac.html\n\n${lines.join("\n")}\n`;
}
