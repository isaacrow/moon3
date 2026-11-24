/**
 * A published record's BIBFRAME graph read into the fields the catalogue's search looks at (searchCore.tsx's
 * SearchableWork): titles, the people (the first or primary contribution as the author), subjects, series,
 * publisher and place, genre and form, call numbers and ISBNs, contents, summary, notes, the works inside a volume.
 * So the server searches the published catalogue with the same rules as the catalogue page (one search).
 * Pure, so the tests and the search test can run it.
 */
import type { SearchableWork } from "./searchCore.tsx";

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const types = (n: any): string[] => list(n?.["@type"]).filter((t) => typeof t === "string");
const isA = (n: any, name: string) => types(n).some((t) => t === `bf:${name}` || t === name || t.endsWith(`/${name}`) || t.endsWith(`#${name}`));

/** Every human-readable text of a value: literals, @value, labels, titles, names, rdf:value (nested). */
function texts(v: any, depth = 0, byId?: Map<string, any>): string[] {
  if (v == null || depth > 5) return [];
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  if (typeof v === "number") return [String(v)];
  if (Array.isArray(v)) return v.flatMap((x) => texts(x, depth + 1, byId));
  if (typeof v !== "object") return [];
  if (v["@value"] !== undefined) return texts(v["@value"], depth + 1, byId);
  const out: string[] = [];
  for (const k of ["rdfs:label", "label", "bf:mainTitle", "mainTitle", "bf:subtitle", "rdf:value", "value", "madsrdf:authoritativeLabel", "bflc:name00MatchKey", "schema:name", "name"]) {
    if (v[k] !== undefined) out.push(...texts(v[k], depth + 1, byId));
  }
  // A node given only by its address: the graph's node of that address.
  if (!out.length && typeof v["@id"] === "string" && byId?.has(v["@id"]) && depth < 3) out.push(...texts(byId.get(v["@id"]), depth + 1, byId));
  return out;
}

const prop = (n: any, ...keys: string[]) => keys.flatMap((k) => list(n?.[k] ?? n?.[k.replace(/^bf:/, "")]));
const joinTexts = (vals: any[], byId: Map<string, any>) => [...new Set(vals.flatMap((v) => texts(v, 0, byId)))];

function agentName(contribution: any, byId: Map<string, any>): { name: string; uri?: string } | null {
  const agent = prop(contribution, "bf:agent")[0];
  if (!agent) return null;
  const node = typeof agent === "object" && agent["@id"] && byId.has(agent["@id"]) ? { ...byId.get(agent["@id"]), ...agent } : agent;
  const names = texts(node, 0, byId);
  return names.length ? { name: names.join(" "), uri: typeof node?.["@id"] === "string" ? node["@id"] : undefined } : null;
}

/** The record's fields for the search, from its JSON-LD document (null when it has no Work or Instance). */
export function searchableOf(document: any): SearchableWork | null {
  const graph: any[] = list(document?.["@graph"]);
  const byId = new Map<string, any>(graph.filter((n) => typeof n?.["@id"] === "string").map((n) => [n["@id"], n]));
  const work = graph.find((n) => isA(n, "Work") && !isA(n, "Hub")) || graph.find((n) => isA(n, "Work"));
  const instances = graph.filter((n) => isA(n, "Instance"));
  const items = graph.filter((n) => isA(n, "Item"));
  if (!work && !instances.length) return null;
  const main = work || instances[0];

  const titleNodes = [...prop(work, "bf:title"), ...instances.flatMap((i) => prop(i, "bf:title"))];
  const mains = joinTexts(titleNodes.map((t) => (t && typeof t === "object" ? t["bf:mainTitle"] ?? t["mainTitle"] ?? t["rdfs:label"] : t)), byId);
  const subs = joinTexts(titleNodes.map((t) => (t && typeof t === "object" ? t["bf:subtitle"] ?? t["subtitle"] : null)), byId);
  const title = mains[0] || texts(main?.["rdfs:label"], 0, byId)[0] || "";

  const contributions = [...prop(work, "bf:contribution"), ...instances.flatMap((i) => prop(i, "bf:contribution"))];
  const primaryC = contributions.find((c) => isA(c, "PrimaryContribution") || /author|aut\b|مؤلف/i.test(JSON.stringify(prop(c, "bf:role")))) || contributions[0];
  const people = contributions.map((c) => ({ c, a: agentName(c, byId) })).filter((x) => x.a);
  const primary = people.find((x) => x.c === primaryC)?.a;
  const others = people.filter((x) => x.c !== primaryC).map((x) => x.a!);

  const subjects = prop(work, "bf:subject").map((s) => {
    const node = s && typeof s === "object" && s["@id"] && byId.has(s["@id"]) ? { ...byId.get(s["@id"]), ...s } : s;
    return { label: texts(node, 0, byId).join(" "), uri: typeof node?.["@id"] === "string" ? node["@id"] : undefined };
  }).filter((s) => s.label || s.uri);

  const notes = joinTexts([...prop(work, "bf:note"), ...instances.flatMap((i) => [...prop(i, "bf:note"), ...prop(i, "bf:editionStatement"), ...prop(i, "bf:responsibilityStatement")])], byId);
  const provision = instances.flatMap((i) => prop(i, "bf:provisionActivity"));
  const isbns = instances.flatMap((i) => prop(i, "bf:identifiedBy").filter((x) => isA(x, "Isbn") || isA(x, "Issn")).flatMap((x) => texts(x["rdf:value"] ?? x["value"] ?? x, 0, byId)));
  const callNumbers = joinTexts([
    ...instances.flatMap((i) => [...prop(i, "bf:shelfMark")]),
    ...items.flatMap((i) => prop(i, "bf:shelfMark")),
  ], byId);
  const classification = prop(work, "bf:classification").flatMap((c) => texts(c?.["bf:classificationPortion"] ?? c?.["classificationPortion"] ?? c, 0, byId));

  return {
    title,
    subtitle: [...mains.slice(1), ...subs].join(" "),
    primaryCreator: primary ? { name: primary.name, uri: primary.uri } : undefined,
    contributors: others.map((a) => ({ name: a.name, uri: a.uri })),
    subjects,
    series: joinTexts([...prop(work, "bf:seriesStatement"), ...instances.flatMap((i) => prop(i, "bf:seriesStatement"))], byId).join(" "),
    expressionOfHub: { label: joinTexts(prop(work, "bf:expressionOf"), byId).join(" ") },
    containedWorks: prop(work, "bf:hasPart").map((p) => ({ title: texts(p, 0, byId).join(" ") })),
    publisher: { name: joinTexts(provision.flatMap((p) => prop(p, "bf:agent")), byId).join(" "), city: joinTexts(provision.flatMap((p) => prop(p, "bf:place")), byId).join(" ") },
    genreForm: joinTexts(prop(work, "bf:genreForm"), byId),
    classificationDdc: classification.join(" "),
    tableOfContents: joinTexts([...prop(work, "bf:tableOfContents"), ...instances.flatMap((i) => prop(i, "bf:tableOfContents"))], byId).join(" "),
    summaryArabic: joinTexts([...prop(work, "bf:summary"), ...instances.flatMap((i) => prop(i, "bf:summary"))], byId).join(" "),
    notes,
    languageLabel: joinTexts(prop(work, "bf:language"), byId).join(" "),
    instances: [{ isbn: isbns.join(" "), callNumber: callNumbers.join(" "), carrierType: joinTexts(instances.flatMap((i) => prop(i, "bf:carrier")), byId).join(" ") }],
  };
}

export interface SearchDoc<R> { record: R; work: SearchableWork }
export interface SearchPage<R> { total: number; results: Array<{ record: R; score: number; reason: string }> }

/**
 * One search of the published catalogue, with the catalogue page's rules (matchWork; when nothing at all
 * matches, fuzzyMatchWork for a typing slip), best first, one page of it. An empty query lists everything in
 * the order given.
 */
export function searchDocs<R>(
  docs: Array<SearchDoc<R>>,
  query: string,
  match: { matchWork: (w: SearchableWork, q: string) => { score: number; reason: string } | null; fuzzyMatchWork: (w: SearchableWork, q: string) => { score: number; reason: string } | null },
  offset = 0,
  limit = 20,
): SearchPage<R> {
  const q = query.trim();
  let hits = q
    ? docs.map((d, i) => ({ d, i, m: match.matchWork(d.work, q) })).filter((x) => x.m)
    : docs.map((d, i) => ({ d, i, m: { score: 0, reason: "" } }));
  if (q && !hits.length) hits = docs.map((d, i) => ({ d, i, m: match.fuzzyMatchWork(d.work, q) })).filter((x) => x.m);
  hits.sort((a, b) => b.m!.score - a.m!.score || a.i - b.i);
  return {
    total: hits.length,
    results: hits.slice(offset, offset + limit).map((x) => ({ record: x.d.record, score: x.m!.score, reason: x.m!.reason })),
  };
}
