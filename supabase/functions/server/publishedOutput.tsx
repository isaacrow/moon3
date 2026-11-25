/**
 * The last step before Moon publishes a record as linked data (resource pages, the data dump, SPARQL,
 * OAI-PMH): Phase 12, step 3. The stored record is not changed; what the world reads is strict BIBFRAME 3.0.1.
 *
 * 1. Language: Arabic-script text is tagged @ar; its romanization beside it (the same field in both scripts)
 *    @ar-Latn, as LC tags parallel scripts.
 * 2. Dates: each publication's date as written gets a typed EDTF date beside it (a Hijri year gives the
 *    Gregorian years it runs across: "1445 هـ" → [2023,2024]).
 * 3. Terms outside BIBFRAME 3.0.1 become theirs: bf:creator → a primary bf:contribution, bf:classificationLcc
 *    → bf:classification (bf:ClassificationLcc), bf:topical → bf:subject (bf:Topic), bf:Expression → bf:Work,
 *    bf:catalogerId → bflc:catalogerId, bflc:TemporalCoverage → bf:Temporal; terms BIBFRAME has no place for
 *    (accessibility content, government publication, projected date) move to Moon's own namespace, kept.
 * 4. Kinds of value: an object property given text gets a node (an LC vocabulary address for codes such as
 *    "rda" or "ara", a link for a web address, else a labelled node of the property's class); a text property
 *    given a node gets the node's text.
 */
import { readDate } from "./hijri.tsx";
import { BF_OBJECT_PROPERTIES, BF_DATATYPE_PROPERTIES } from "./bibframeTerms.generated.tsx";

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const LATIN = /[A-Za-zÀ-ɏḀ-ỿ]/;
const VOCAB = "http://id.loc.gov/vocabulary";
const EDTF = "http://id.loc.gov/datatypes/edtf";
const all = (v: any): any[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const bare = (k: string) => k.replace(/^bf:/, "");

/** Codes that stand for an LC vocabulary term, by property. */
const CODED: Record<string, (code: string) => string | null> = {
  descriptionConventions: (c) => (/^[a-z]{2,12}$/i.test(c) ? `${VOCAB}/descriptionConventions/${c.toLowerCase()}` : null),
  descriptionLanguage: (c) => (/^[a-z]{3}$/.test(c) ? `${VOCAB}/languages/${c}` : null),
  language: (c) => (/^[a-z]{3}$/.test(c) ? `${VOCAB}/languages/${c}` : null),
  issuance: (c) => (/^(mono|serl|intg|mulm)$/.test(c) ? `${VOCAB}/issuance/${c}` : null),
  carrier: (c) => (/^[a-z]{2}$/.test(c) ? `${VOCAB}/carriers/${c}` : null),
  media: (c) => (/^[a-z]$/.test(c) ? `${VOCAB}/mediaTypes/${c}` : null),
  content: (c) => (/^[a-z]{3}$/.test(c) ? `${VOCAB}/contentTypes/${c}` : null),
  descriptionAuthentication: (c) => (/^[a-z]{2,10}$/.test(c) ? `http://id.loc.gov/vocabulary/marcauthen/${c}` : null),
};
/** The class a text value becomes, by property. */
const CLASS_OF: Record<string, string> = {
  source: "bf:Source", shelfMark: "bf:ShelfMark", summary: "bf:Summary", tableOfContents: "bf:TableOfContents",
  note: "bf:Note", title: "bf:Title", genreForm: "bf:GenreForm", illustrativeContent: "bf:Illustration",
  intendedAudience: "bf:IntendedAudience", supplementaryContent: "bf:SupplementaryContent", originPlace: "bf:Place",
  geographicCoverage: "bf:GeographicCoverage", acquisitionSource: "bf:AcquisitionSource", immediateAcquisition: "bf:ImmediateAcquisition",
  generationProcess: "bf:GenerationProcess", translationOf: "bf:Work", extent: "bf:Extent", role: "bf:Role",
  descriptionConventions: "bf:DescriptionConventions", descriptionLanguage: "bf:Language", issuance: "bf:Issuance",
  carrier: "bf:Carrier", media: "bf:Media", content: "bf:Content",
};
const MOVED_TO_MOON: Record<string, string> = {
  "bf:accessibilityContent": "moonext:accessibilityContent", "bf:governmentPublication": "moonext:governmentPublication",
  "bf:projectedProvisionDate": "moonext:projectedProvisionDate", "bf:catalogerId": "bflc:catalogerId",
};
const TYPE_MAP: Record<string, string[]> = {
  "bf:Expression": ["bf:Work", "moonext:Expression"], "bf:AccessibilityContent": ["moonext:AccessibilityContent"],
  "bf:GovernmentPublication": ["moonext:GovernmentPublication"], "bflc:TemporalCoverage": ["bf:Temporal"],
};

const textOf = (v: any): string => {
  for (const x of all(v)) {
    if (typeof x === "string" || typeof x === "number") return String(x);
    if (x && typeof x === "object") { const t = textOf(x["@value"] ?? x["rdfs:label"] ?? x["bf:mainTitle"]); if (t) return t; }
  }
  return "";
};

/** A text value for an object property, as the node it should be. */
function asNode(prop: string, v: string): any {
  const p = bare(prop);
  if (/^https?:\/\/\S+$/.test(v)) return { "@id": v };
  const coded = CODED[p]?.(v.trim());
  if (coded) return { "@id": coded, "rdfs:label": v.trim() };
  if (p === "title") return { "@type": "bf:Title", "bf:mainTitle": v };
  return { ...(CLASS_OF[p] ? { "@type": CLASS_OF[p] } : {}), "rdfs:label": v };
}

/**
 * BCP 47 tags for text in Arabic script (Phase 13 S9). The language is the Work's, so Persian, Urdu, Ottoman
 * Turkish or Kurdish in Arabic script are not called Arabic; the shortest tag is used (the script is implied
 * by the language), and a romanized form says how it was romanized: "ar-Latn-t-ar-m0-alaloc" (ALA-LC), as LC
 * tags it. A record with no Arabic-script language keeps "ar" for Arabic-script text.
 */
const SCRIPT_LANGS: Record<string, string> = {
  ara: "ar", per: "fa", fas: "fa", urd: "ur", ota: "ota", kur: "ku", ckb: "ckb", kmr: "kmr", pus: "ps", snd: "sd", uig: "ug", bal: "bal", kas: "ks", pan: "pa",
};
export function scriptLanguage(graph: any[]): string {
  const codes = graph.filter((n) => all(n?.["@type"]).some((t: any) => /(^|\/|:)Work$/.test(String(t))))
    .flatMap((w) => all(w?.["bf:language"] ?? w?.["http://id.loc.gov/ontologies/bibframe/language"]))
    .map((l: any) => String(l?.["@id"] ?? l ?? "").replace(/\/+$/, "").split("/").pop() || "");
  for (const c of codes) if (SCRIPT_LANGS[c]) return SCRIPT_LANGS[c];
  return "ar";
}
export const romanizedTag = (lang: string) => `${lang}-Latn-t-${lang}-m0-alaloc`;
let currentLang = "ar";

/** Strings in two scripts on one property: the Arabic-script form in its language, the romanized form tagged as ALA-LC romanization. */
function tagLiterals(values: any[]): any[] {
  const strings = values.filter((x) => typeof x === "string");
  const parallel = strings.some((s) => ARABIC.test(s)) && strings.some((s) => LATIN.test(s) && !ARABIC.test(s));
  return values.map((x) => {
    if (typeof x === "string") {
      if (ARABIC.test(x)) return { "@value": x, "@language": currentLang };
      if (parallel && LATIN.test(x)) return { "@value": x, "@language": romanizedTag(currentLang) };
      return x;
    }
    if (x && typeof x === "object" && typeof x["@value"] === "string" && !x["@language"] && !x["@type"] && ARABIC.test(x["@value"])) {
      return { ...x, "@language": currentLang };
    }
    return x;
  });
}

function fixNode(n: any, parentKey = ""): any {
  if (Array.isArray(n)) return n.map((x) => fixNode(x, parentKey));
  if (!n || typeof n !== "object" || "@value" in n) return n;
  const out: any = {};
  for (const [k0, v0] of Object.entries(n)) {
    if (k0 === "@type") {
      const types = all(v0).flatMap((t) => (typeof t === "string" && TYPE_MAP[t] ? TYPE_MAP[t] : [t]));
      out["@type"] = types.length === 1 ? types[0] : [...new Set(types)];
      continue;
    }
    if (k0.startsWith("@")) { out[k0] = v0; continue; }
    const k = MOVED_TO_MOON[k0] || k0;
    let values = all(v0);
    const p = k.startsWith("bf:") ? bare(k) : "";
    if (p && BF_OBJECT_PROPERTIES.has(p)) values = values.map((x) => (typeof x === "string" || typeof x === "number" ? asNode(k, String(x)) : x));
    else if (p && BF_DATATYPE_PROPERTIES.has(p)) values = values.map((x) => (x && typeof x === "object" && !("@value" in x) ? textOf(x) : x)).filter((x) => x !== "");
    values = tagLiterals(values.map((x) => fixNode(x, k)));
    const prev = out[k] === undefined ? [] : all(out[k]);
    const merged = [...prev, ...values];
    out[k] = merged.length === 1 && !Array.isArray(v0) && !prev.length ? merged[0] : merged;
  }
  // A publication's date as written, with its EDTF reading beside it.
  if (/provisionActivity$/.test(parentKey) && out["bf:date"] !== undefined) {
    const dates = all(out["bf:date"]);
    if (!dates.some((d) => d && typeof d === "object" && d["@type"] === EDTF)) {
      const r = readDate(textOf(dates));
      if (r.edtf) out["bf:date"] = [...dates, { "@value": r.edtf, "@type": EDTF }];
    }
  }
  // The publisher, date and place as transcribed, beside the linked ones (bflc:simple*), as LC's converter writes
  // them and as BIG's monograph shapes ask for them.
  if (/provisionActivity$/.test(parentKey)) {
    const labels = (v: any) => all(v).map((x: any) => (x && typeof x === "object" ? textOf(x["rdfs:label"] ?? x) : typeof x === "string" && !/^https?:/.test(x) ? x : "")).filter(Boolean);
    const add = (key: string, texts: string[]) => {
      if (out[key] !== undefined || !texts.length) return;
      out[key] = tagLiterals([...new Set(texts)]);
    };
    add("bflc:simpleAgent", labels(out["bf:agent"]));
    add("bflc:simplePlace", labels(out["bf:place"]));
    add("bflc:simpleDate", all(out["bf:date"]).filter((d: any) => !(d && typeof d === "object" && d["@type"] === EDTF)).map((d: any) => textOf(d)).filter(Boolean).slice(0, 1));
  }
  return out;
}

/** The Work's bf:creator values as a primary contribution each (unless already a contribution). */
function creatorsToContributions(n: any): any {
  if (!n || typeof n !== "object" || n["bf:creator"] === undefined) return n;
  const { "bf:creator": creators, ...rest } = n;
  const contributions = all(rest["bf:contribution"]);
  const known = new Set(contributions.map((c: any) => JSON.stringify(c?.["bf:agent"]?.["@id"] || textOf(c?.["bf:agent"]))));
  for (const a of all(creators)) {
    const agent = typeof a === "string" ? (/^https?:\/\//.test(a) ? { "@id": a } : { "@type": "bf:Agent", "rdfs:label": a }) : a;
    const key = JSON.stringify(agent?.["@id"] || textOf(agent));
    if (known.has(key)) continue;
    known.add(key);
    contributions.push({ "@type": ["bf:Contribution", "bf:PrimaryContribution"], "bf:agent": agent });
  }
  return { ...rest, "bf:contribution": contributions };
}

/** bf:classificationLcc / bf:topical (older records) as bf:classification / bf:subject. */
function legacyToBibframe(n: any): any {
  if (!n || typeof n !== "object") return n;
  const out = { ...n };
  if (out["bf:classificationLcc"] !== undefined) {
    const cls = all(out["bf:classification"]);
    for (const v of all(out["bf:classificationLcc"])) cls.push({ "@type": "bf:ClassificationLcc", "bf:classificationPortion": textOf(v) });
    out["bf:classification"] = cls;
    delete out["bf:classificationLcc"];
  }
  if (out["bf:topical"] !== undefined) {
    const subjects = all(out["bf:subject"]);
    for (const v of all(out["bf:topical"])) subjects.push(typeof v === "string" ? (/^https?:\/\//.test(v) ? { "@id": v } : { "@type": "bf:Topic", "rdfs:label": v }) : v);
    out["bf:subject"] = subjects;
    delete out["bf:topical"];
  }
  return out;
}

/**
 * Older records' terms in place (bf:creator → a primary contribution, bf:classificationLcc, bf:topical), so
 * a save or the linking job can link those names and subjects too. Changes the document; returns whether
 * anything changed.
 */
export function upgradeLegacyTerms(document: any): boolean {
  const graph = Array.isArray(document?.["@graph"]) ? document["@graph"] : null;
  if (!graph) return false;
  let changed = false;
  for (let i = 0; i < graph.length; i++) {
    const next = legacyToBibframe(creatorsToContributions(graph[i]));
    if (next !== graph[i] && JSON.stringify(next) !== JSON.stringify(graph[i])) { graph[i] = next; changed = true; }
  }
  return changed;
}

const typesOf = (n: any): string[] => all(n?.["@type"]).filter((t: any) => typeof t === "string");
const isType = (n: any, t: string) => typesOf(n).some((x) => x === `bf:${t}` || x.endsWith(`/bibframe/${t}`));
const idsOf = (v: any): string[] => all(v).map((x) => (typeof x === "string" ? x : x?.["@id"])).filter((x): x is string => typeof x === "string");

/**
 * Step 6 (completeness), on the published copy: a record's Work and Instance point at each other both ways
 * (bf:hasInstance and bf:instanceOf), and an Instance with no title takes its Work's (a Work with none, its
 * Instance's), as BIBFRAME expects every Work and Instance to carry one.
 */
export function completeRecord(graph: any[], fallbackTitle?: string): any[] {
  const out = graph.map((n) => (n && typeof n === "object" ? { ...n } : n));
  const nodeById = new Map(out.filter((n) => n?.["@id"]).map((n) => [n["@id"], n]));
  // A title held as a reference ({"@id": "_:b1"}) to a Title node elsewhere in the graph counts, and is copied as that node.
  const titles = (n: any) => all(n?.["bf:title"]).map((t: any) => (t && typeof t === "object" && Object.keys(t).length === 1 && t["@id"] ? nodeById.get(t["@id"]) || t : t))
    .filter((t: any) => t && typeof t === "object" && t["bf:mainTitle"] !== undefined);
  const hasTitle = (n: any) => titles(n).length > 0;
  const works = out.filter((n) => isType(n, "Work") && typeof n["@id"] === "string" && !typesOf(n).includes("bf:Expression"));
  const instances = out.filter((n) => isType(n, "Instance") && typeof n["@id"] === "string");
  const byId = new Map(out.filter((n) => n?.["@id"]).map((n) => [n["@id"], n]));
  const link = (w: any, i: any) => {
    if (!idsOf(w["bf:hasInstance"]).includes(i["@id"])) w["bf:hasInstance"] = [...all(w["bf:hasInstance"]), { "@id": i["@id"] }];
    if (!idsOf(i["bf:instanceOf"]).includes(w["@id"])) i["bf:instanceOf"] = [...all(i["bf:instanceOf"]).filter((x: any) => idsOf(x).length), { "@id": w["@id"] }];
  };
  for (const i of instances) for (const wid of idsOf(i["bf:instanceOf"])) { const w = byId.get(wid); if (w && isType(w, "Work")) link(w, i); }
  for (const w of works) for (const iid of idsOf(w["bf:hasInstance"])) { const i = byId.get(iid); if (i && isType(i, "Instance")) link(w, i); }
  // One Work and one Instance with no link between them: they are the record's pair.
  if (works.length === 1 && instances.length === 1 && !idsOf(instances[0]["bf:instanceOf"]).length) link(works[0], instances[0]);
  const titleCopy = (t: any) => { const { "@id": _id, ...rest } = t; return rest; };
  for (const i of instances) {
    const w = idsOf(i["bf:instanceOf"]).map((id) => byId.get(id)).find((x) => x && hasTitle(x));
    if (!hasTitle(i) && w) i["bf:title"] = titles(w).slice(0, 1).map(titleCopy);
  }
  for (const w of works) {
    const i = idsOf(w["bf:hasInstance"]).map((id) => byId.get(id)).find((x) => x && hasTitle(x));
    if (!hasTitle(w) && i) w["bf:title"] = titles(i).filter((t: any) => !/Variant|Parallel/.test(JSON.stringify(t["@type"] || ""))).slice(0, 1).map(titleCopy);
  }
  // No title anywhere in the graph: the record's own title (the one Moon lists it by), on its Work and Instance.
  if (fallbackTitle?.trim() && works.length === 1 && instances.length <= 1) {
    for (const n of [...works, ...instances]) if (!hasTitle(n)) n["bf:title"] = [{ "@type": "bf:Title", "bf:mainTitle": fallbackTitle.trim() }];
  }
  return out;
}

/** The record as Moon publishes it: strict BIBFRAME 3.0.1, tagged, typed, complete. The input is not changed. */
export function finishPublished(document: any, options: { title?: string } = {}): any {
  const graph = Array.isArray(document?.["@graph"]) ? document["@graph"] : [];
  // MARC fields kept for the round trip (moonext:marcField) stay in Moon; they are not published.
  const withoutMarc = graph.map((node: any) => { if (!node || !("moonext:marcField" in node)) return node; const { ["moonext:marcField"]: _kept, ...rest } = node; return rest; });
  currentLang = scriptLanguage(withoutMarc);
  return { ...document, "@graph": completeRecord(withoutMarc.map((node: any) => legacyToBibframe(creatorsToContributions(node))), options.title).map((node: any) => fixNode(node)) };
}
