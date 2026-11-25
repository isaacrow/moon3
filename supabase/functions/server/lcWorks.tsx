/**
 * Suggested links from Moon's works to the Library of Congress's Works and Hubs (plan step A3, after Illinois 2025
 * and Ford 2025): LC's suggest service is searched with the work's contributor and title, each candidate is scored
 * with the contributors weighted above the title (two works may share a title; a work keeps its author), and a
 * cataloguer accepts or rejects each. An accepted Hub becomes the work's bf:expressionOf, an accepted LC Work its
 * owl:sameAs. Nothing is linked without a person.
 * Pure: lcWorksRoutes.tsx fetches LC and saves the records.
 */
import { fold } from "./searchCore.tsx";

export type LcKind = "work" | "hub";
export const LC_BASE: Record<LcKind, string> = { work: "http://id.loc.gov/resources/works/", hub: "http://id.loc.gov/resources/hubs/" };

export interface WorkFacts {
  titles: string[];
  contributors: string[];
  language?: string;
  year?: number;
  lccns: string[];
  /** LC Works and Hubs the work is linked to already. */
  linked: string[];
}

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const typesOf = (n: any) => list(n?.["@type"]).filter((t) => typeof t === "string").map((t: string) => t.replace(/^.*[/#:]/, ""));
function texts(v: any, depth = 0): string[] {
  if (v == null || depth > 4) return [];
  if (typeof v === "string" || typeof v === "number") return [String(v)];
  if (Array.isArray(v)) return v.flatMap((x) => texts(x, depth + 1));
  if (typeof v === "object") return [v["@value"], v["rdfs:label"], v["bf:mainTitle"], v.mainTitle, v.label, v["rdf:value"], v.value].flatMap((x) => texts(x, depth + 1));
  return [];
}
const prop = (n: any, name: string) => [...list(n?.[`bf:${name}`]), ...list(n?.[name])];

/** What a Moon record says about its work, for matching. */
export function workFacts(document: any): WorkFacts {
  const graph: any[] = Array.isArray(document?.["@graph"]) ? document["@graph"] : [document];
  const byId = new Map(graph.filter((n) => n?.["@id"]).map((n) => [n["@id"], n]));
  const deref = (x: any) => (x && typeof x === "object" && x["@id"] && byId.has(x["@id"]) ? { ...byId.get(x["@id"]), ...x } : x);
  const work = graph.find((n) => typesOf(n).some((t) => t === "Work" || t === "Text")) || {};
  const instances = graph.filter((n) => typesOf(n).some((t) => /^(Instance|Print|Electronic|Manuscript)$/.test(t)));
  const titles = [...new Set([work, ...instances].flatMap((n) => prop(n, "title").map(deref).flatMap((t) => {
    const main = texts(t?.["bf:mainTitle"] ?? t?.mainTitle ?? t);
    const sub = texts(t?.["bf:subtitle"] ?? t?.subtitle);
    return main.map((m) => (sub[0] ? `${m} ${sub[0]}` : m));
  })).map((s) => s.trim().replace(/[\s:;/.,]+$/, "")).filter((s) => s && !/^https?:/.test(s)))];
  const contributors = [...new Set([work, ...instances].flatMap((n) => prop(n, "contribution")).map(deref)
    .flatMap((c) => texts(deref(prop(c, "agent")[0])?.["rdfs:label"] ?? deref(prop(c, "agent")[0])))
    .map((s) => s.trim()).filter((s) => s && !/^https?:/.test(s)))];
  const lang = words(prop(work, "language")).map((w) => w.replace(/^.*\//, "")).find((w) => /^[a-z]{3}$/.test(w));
  const yearText = instances.flatMap((i) => prop(i, "provisionActivity").map(deref).flatMap((p) => texts(p?.["bf:date"] ?? p?.["bflc:simpleDate"] ?? p?.date))).join(" ");
  const y = yearText.match(/(1[0-9]\d\d|20\d\d)/);
  const lccns = instances.flatMap((i) => prop(i, "identifiedBy")).map(deref).filter((x) => typesOf(x).includes("Lccn"))
    .flatMap((x) => texts(x?.["rdf:value"] ?? x)).map(normLccn).filter(Boolean);
  const linked = [...prop(work, "expressionOf"), ...list(work?.["owl:sameAs"])].map((x) => (typeof x === "string" ? x : x?.["@id"]))
    .filter((u): u is string => typeof u === "string" && /id\.loc\.gov\/resources\/(works|hubs)\//.test(u));
  return { titles, contributors, ...(lang ? { language: lang } : {}), ...(y ? { year: Number(y[1]) } : {}), lccns, linked };
}
function words(v: any): string[] {
  return list(v).flatMap((x) => (typeof x === "string" ? [x] : x && typeof x === "object" ? [x["@id"], x.code, ...texts(x)].filter((s) => typeof s === "string") : [])).map((s: string) => s.toLowerCase());
}
const normLccn = (s: string) => s.trim().split(/\s+\/|\s{2,}|\/\//)[0].replace(/\s+/g, "").replace(/^([a-z]*)(\d{2,4})-?(\d+)$/i, (_m, p, a, b) => `${p}${a}${b.padStart(6, "0")}`).toLowerCase();

export interface Candidate {
  uri: string; kind: LcKind; label: string; titles: string[]; contributors: string[];
  languages: string[]; dates: string[]; identifiers: string[];
}

/** Candidates from LC's suggest2 answer for /resources/works or /resources/hubs. */
export function parseHits(json: any, kind: LcKind): Candidate[] {
  return list(json?.hits).filter((h) => typeof h?.uri === "string").map((h) => {
    const more = h.more || {};
    const contributors = list(more.contributors).filter((s) => typeof s === "string");
    // An authorized access point is "Name. Title"; the title is what follows a contributor's name.
    const aaps = list(more.aaps).concat(h.aLabel || []).filter((s) => typeof s === "string");
    const fromAap = aaps.map((a: string) => {
      const who = contributors.find((c) => a.startsWith(c));
      return (who ? a.slice(who.length) : a).replace(/^[\s.,]+/, "");
    });
    // A variant title may carry its Arabic-script form glued on: "Muqaddimahمقدمة".
    const variants = list(more.varianttitles).filter((s) => typeof s === "string").flatMap((v: string) => v.split(/(?<=[^؀-ۿ\s])(?=[؀-ۿ])/));
    return {
      uri: h.uri, kind, label: String(h.aLabel || h.suggestLabel || h.uri),
      titles: [...new Set([...fromAap, ...variants].map((s) => s.trim()).filter(Boolean))],
      contributors,
      languages: list(more.languages).filter((s) => typeof s === "string"),
      dates: list(more.pubdates).filter((s) => typeof s === "string"),
      identifiers: list(more.identifiers).filter((s) => typeof s === "string").map(normLccn),
    };
  });
}

const tokens = (s: string) => fold(s).split(" ").filter((w) => w.length > 1 && !/^\d+$/.test(w) && !/^(al|el|the|a|an|of|and|wa|fi|li|bi|ال)$/.test(w));
/** How alike two texts are: the share of the shorter one's words found in the longer (articles and dates aside). */
export function alike(a: string, b: string): number {
  const x = new Set(tokens(a)), y = new Set(tokens(b));
  if (!x.size || !y.size) return 0;
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  let hit = 0;
  for (const w of small) if (big.has(w) || [...big].some((v) => v.length > 3 && w.length > 3 && (v.startsWith(w) || w.startsWith(v)))) hit++;
  // A long title matched by a two-word one is weaker than two titles of the same length.
  return (hit / small.size) * (0.7 + 0.3 * (small.size / big.size));
}
const best = (xs: string[], ys: string[]) => Math.max(0, ...xs.flatMap((x) => ys.map((y) => alike(x, y))));

const LANGUAGE_NAMES: Record<string, string> = { ara: "arabic", per: "persian", fas: "persian", eng: "english", fre: "french", ger: "german", tur: "turkish", ota: "turkish, ottoman", urd: "urdu", heb: "hebrew", spa: "spanish" };

export interface Scored extends Candidate { score: number; reasons: string[] }

/** A candidate's score (0 to 1): contributors weigh 0.6, the title 0.4; the same LCCN settles it. */
export function scoreCandidate(f: WorkFacts, c: Candidate): Scored {
  const reasons: string[] = [];
  if (f.lccns.some((l) => c.identifiers.includes(l))) return { ...c, score: 0.99, reasons: ["same LCCN"] };
  const title = best(f.titles, c.titles);
  const who = f.contributors.length && c.contributors.length ? best(f.contributors, c.contributors) : null;
  let score = who === null ? title * (c.contributors.length ? 0.75 : 0.9) : 0.6 * who + 0.4 * title;
  if (title >= 0.8) reasons.push("title"); else if (title >= 0.5) reasons.push("title in part");
  if (who !== null && who >= 0.8) reasons.push("contributor"); else if (who !== null && who >= 0.5) reasons.push("contributor in part");
  else if (who !== null) reasons.push("other contributor");
  if (f.language && c.languages.some((l) => l.toLowerCase() === LANGUAGE_NAMES[f.language!])) { score += 0.05; reasons.push("language"); }
  if (c.kind === "work" && f.year && c.dates.some((d) => d.includes(String(f.year)))) { score += 0.03; reasons.push("year"); }
  // A Hub of a translation or of selections ("… Muqaddimah. English") is another expression than the original.
  const part = c.label.match(/\.\s*(Selections|[A-Z][a-z]+(?: & [A-Z][a-z]+)?)\.?$/);
  if (c.kind === "hub" && part && (part[1] === "Selections" || Object.values(LANGUAGE_NAMES).includes(part[1].toLowerCase().split(" & ")[0]))) {
    const same = f.language && part[1].toLowerCase().includes(LANGUAGE_NAMES[f.language] || "-");
    if (!same) { score -= 0.08; reasons.push(part[1] === "Selections" ? "selections" : "other language"); }
  }
  return { ...c, score: Math.min(0.98, Math.round(score * 100) / 100), reasons };
}

/** What to ask LC: the first contributor's name and the title, then the title alone. */
export function searchesFor(f: WorkFacts): string[] {
  const title = f.titles.find((t) => !/[؀-ۿ]/.test(t)) || f.titles[0] || "";
  const who = f.contributors.find((c) => !/[؀-ۿ]/.test(c)) || f.contributors[0] || "";
  const surname = tokens(who.split(",")[0] || who).slice(0, 2).join(" ");
  const t = tokens(title).slice(0, 5).join(" ");
  return [...new Set([surname && t ? `${surname} ${t}` : "", t].filter(Boolean))];
}

/** Candidates scored, best first, the rejected ones and those below `min` left out. */
export function rank(f: WorkFacts, cands: Candidate[], rejected: string[] = [], min = 0.35, max = 8): Scored[] {
  const seen = new Set<string>();
  return cands.filter((c) => !rejected.includes(c.uri) && !seen.has(c.uri) && seen.add(c.uri))
    .map((c) => scoreCandidate(f, c)).filter((c) => c.score >= min)
    .sort((a, b) => b.score - a.score).slice(0, max);
}

/** The record's document with the accepted link on its Work: a Hub as bf:expressionOf, an LC Work as owl:sameAs. */
export function withLcLink(document: any, uri: string, kind: LcKind): any | null {
  const doc = JSON.parse(JSON.stringify(document));
  const graph: any[] = Array.isArray(doc?.["@graph"]) ? doc["@graph"] : [];
  const work = graph.find((n) => typesOf(n).some((t) => t === "Work" || t === "Text"));
  if (!work) return null;
  const key = kind === "hub" ? "bf:expressionOf" : "owl:sameAs";
  const have = list(work[key]).filter((x) => x != null);
  if (have.some((x) => (typeof x === "string" ? x : x?.["@id"]) === uri)) return doc;
  const next = [...have, { "@id": uri }];
  work[key] = next.length === 1 ? next[0] : next;
  return doc;
}
