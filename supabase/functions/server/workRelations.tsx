// Links between works (OPAC plan, stage 1 step 4 and stage 3): "translation of", "commentary on", "contained in",
// "continuation of", "other edition" … as BIBFRAME writes them, read back the same way by the catalogue.
//
// Written in BIBFRAME 2's general form, as LC's own converters write it:
//   <work> bf:relation [ a bf:Relation ; bf:relationship <http://id.loc.gov/vocabulary/relationship/translationof> ;
//                        bf:associatedResource <other work> ]
// Read in that form and in the direct properties older records and the editor use (bf:translationOf, bf:partOf,
// bf:precededBy …), every value, not only the first. Each relation has its words in Arabic and English, and its
// inverse, so the other book's page says "Translated as" where this one says "Translation of".
// Shared: the catalogue reads with it, the server writes with it. No imports.

export const LC_RELATIONSHIP = "http://id.loc.gov/vocabulary/relationship/";

export interface RelationKind { term: string; en: string; ar: string; inverseEn: string; inverseAr: string; direct?: string[] }

/** The relations a cataloguer can make between two works (LC relationship terms), and the direct properties that mean the same. */
export const RELATIONS: RelationKind[] = [
  { term: "translationof", en: "Translation of", ar: "ترجمة لـ", inverseEn: "Translated as", inverseAr: "تُرجم إلى", direct: ["bf:translationOf"] },
  { term: "translatedas", en: "Translated as", ar: "تُرجم إلى", inverseEn: "Translation of", inverseAr: "ترجمة لـ", direct: ["bf:translation"] },
  { term: "commentaryon", en: "Commentary on", ar: "شرح على", inverseEn: "Has commentary", inverseAr: "له شرح" },
  { term: "partof", en: "Contained in", ar: "جزء من", inverseEn: "Contains", inverseAr: "يضم", direct: ["bf:partOf"] },
  { term: "part", en: "Contains", ar: "يضم", inverseEn: "Contained in", inverseAr: "جزء من", direct: ["bf:hasPart"] },
  { term: "continuationof", en: "Continuation of", ar: "تكملة لـ", inverseEn: "Continued by", inverseAr: "أُكمل بـ", direct: ["bf:continuationOf", "bf:precededBy"] },
  { term: "continuedby", en: "Continued by", ar: "أُكمل بـ", inverseEn: "Continuation of", inverseAr: "تكملة لـ", direct: ["bf:continuedBy", "bf:succeededBy"] },
  { term: "abridgementof", en: "Abridgement of", ar: "مختصر لـ", inverseEn: "Abridged as", inverseAr: "اختُصر في" },
  { term: "summaryof", en: "Summary of", ar: "تلخيص لـ", inverseEn: "Summarized as", inverseAr: "لُخّص في" },
  { term: "adaptationof", en: "Adaptation of", ar: "مقتبس من", inverseEn: "Adapted as", inverseAr: "اقتُبس في", direct: ["bf:derivativeOf"] },
  { term: "basedon", en: "Based on", ar: "مبني على", inverseEn: "Basis for", inverseAr: "أساس لـ", direct: ["bf:basedOn"] },
  { term: "supplementto", en: "Supplement to", ar: "ملحق بـ", inverseEn: "Has supplement", inverseAr: "له ملحق", direct: ["bf:supplementTo"] },
  { term: "indexto", en: "Index to", ar: "فهرس لـ", inverseEn: "Has index", inverseAr: "له فهرس" },
  { term: "otheredition", en: "Other edition", ar: "طبعة أخرى", inverseEn: "Other edition", inverseAr: "طبعة أخرى", direct: ["bf:otherEdition"] },
  { term: "relatedwork", en: "Related work", ar: "عمل ذو صلة", inverseEn: "Related work", inverseAr: "عمل ذو صلة", direct: ["bf:relatedTo"] },
];

const BY_TERM = new Map(RELATIONS.map((r) => [r.term, r]));
const BY_DIRECT = new Map(RELATIONS.flatMap((r) => (r.direct || []).map((p) => [p, r] as const)));

/** The words for a relation, or its inverse, in Arabic or English; null when the term is not one Moon knows. */
export function relationWords(term: string, lang: "ar" | "en", inverse = false): string | null {
  const r = BY_TERM.get(term);
  if (!r) return null;
  return lang === "ar" ? (inverse ? r.inverseAr : r.ar) : (inverse ? r.inverseEn : r.en);
}

export const isRelationTerm = (term: unknown): term is string => typeof term === "string" && BY_TERM.has(term);

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const text = (v: any): string => {
  for (const x of list(v)) {
    if (typeof x === "string") return x.trim();
    if (x && typeof x === "object") { const t = text(x["@value"] ?? x["rdfs:label"] ?? x["bflc:aap"] ?? x["bf:mainTitle"]); if (t) return t; }
  }
  return "";
};
const idOf = (v: any): string => (typeof v === "string" ? v : typeof v?.["@id"] === "string" ? v["@id"] : "");

export interface WorkRelation { term: string; targetUri?: string; targetTitle: string; from: "direct" | "relation" }

/**
 * Every work-to-work relation a Work node gives, in either form, every value. nodeOf resolves a reference to its
 * node in the same record (for a label); a target outside the record is kept by its address.
 */
export function readWorkRelations(work: any, nodeOf: (v: any) => any = (v) => v): WorkRelation[] {
  const out: WorkRelation[] = [];
  const push = (term: string, target: any, from: WorkRelation["from"]) => {
    const node = nodeOf(target) || target;
    const uri = idOf(target) || idOf(node);
    const title = text(node?.["bflc:aap"]) || text(nodeOf(node?.["bf:title"])?.["bf:mainTitle"]) || text(node?.["rdfs:label"]) || (typeof target === "string" && !/^https?:/.test(target) ? target : "");
    if (!uri && !title) return;
    if (out.some((r) => r.term === term && ((uri && r.targetUri === uri) || (!uri && r.targetTitle === title)))) return;
    out.push({ term, from, ...(uri && !uri.startsWith("_:") ? { targetUri: uri } : {}), targetTitle: title });
  };
  for (const [prop, kind] of BY_DIRECT) for (const v of list(work?.[prop] ?? work?.[prop.replace(/^bf:/, "")])) push(kind.term, v, "direct");
  for (const rel of list(work?.["bf:relation"] ?? work?.["relation"])) {
    const node = nodeOf(rel) || rel;
    const term = idOf(nodeOf(node?.["bf:relationship"]) || node?.["bf:relationship"]).replace(LC_RELATIONSHIP, "");
    if (!BY_TERM.has(term)) continue;
    for (const target of list(node?.["bf:associatedResource"])) push(term, target, "relation");
  }
  return out;
}

// ---- Writing ----

const typed = (n: any, t: string) => list(n?.["@type"]).some((x: any) => String(x) === `bf:${t}` || String(x).endsWith(`/${t}`));

/** The record's Work node (the first bf:Work of the graph). */
export const workNodeOf = (document: any) => (Array.isArray(document?.["@graph"]) ? document["@graph"] : []).find((n: any) => typed(n, "Work"));

/** The document with a bf:Relation added to its Work (once: an identical relation is not added twice). Input unchanged. */
export function withRelation(document: any, term: string, targetUri: string): any {
  const doc = JSON.parse(JSON.stringify(document));
  const work = workNodeOf(doc);
  if (!work || !BY_TERM.has(term) || !/^https?:\/\//.test(targetUri) || targetUri === work["@id"]) return doc;
  if (readWorkRelations(work).some((r) => r.term === term && r.targetUri === targetUri)) return doc;
  const k = BY_TERM.get(term)!;
  work["bf:relation"] = [...list(work["bf:relation"]), {
    "@type": "bf:Relation",
    "bf:relationship": { "@id": LC_RELATIONSHIP + term, "rdfs:label": k.en.toLowerCase() },
    "bf:associatedResource": { "@id": targetUri },
  }];
  return doc;
}

/** The document without this relation (in either form). Input unchanged. */
export function withoutRelation(document: any, term: string, targetUri: string): any {
  const doc = JSON.parse(JSON.stringify(document));
  const work = workNodeOf(doc);
  if (!work) return doc;
  const kind = BY_TERM.get(term);
  const keepRel = (rel: any) => !(idOf(rel?.["bf:relationship"]).replace(LC_RELATIONSHIP, "") === term && list(rel?.["bf:associatedResource"]).some((t) => idOf(t) === targetUri));
  if (work["bf:relation"] !== undefined) {
    const kept = list(work["bf:relation"]).filter(keepRel);
    if (kept.length) work["bf:relation"] = kept; else delete work["bf:relation"];
  }
  for (const prop of kind?.direct || []) {
    if (work[prop] === undefined) continue;
    const kept = list(work[prop]).filter((v) => idOf(v) !== targetUri);
    if (kept.length) work[prop] = kept; else delete work[prop];
  }
  return doc;
}
