// The public scorecard (OPAC plan, stage 6; https://mooon.site/score.html): how complete Moon's published data is,
// measured the same way every time from the live records and entities, with the plan's target for each. Next to it
// the page shows the BIBFRAME 3.0.1 audit (ldAudit.tsx), which until now only the Super Admin could see.
// Pure: index.tsx passes the published records and the entities. Nothing private is counted or shown.

export interface ScoreRow {
  key: string; en: string; ar: string;
  value: number; total: number;
  /** The share the plan aims for (0..1); null for a count that has no ceiling (links between works). */
  goal: number | null;
}

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const typed = (n: any, t: string) => list(n?.["@type"]).some((x: any) => String(x) === `bf:${t}` || String(x).endsWith(`/${t}`));
const text = (v: any): string => {
  for (const x of list(v)) {
    if (typeof x === "string") return x.trim();
    if (x && typeof x === "object") { const t = text(x["@value"] ?? x["rdfs:label"]); if (t) return t; }
  }
  return "";
};
const ARABIC = /[؀-ۿ]/;
const LATIN = /[A-Za-zÀ-ɏ]/;

/** Work-to-work relations: bf:relation with a relationship, or the direct BIBFRAME properties. */
const RELATION_PROPS = ["bf:translationOf", "bf:translation", "bf:partOf", "bf:hasPart", "bf:precededBy", "bf:succeededBy", "bf:continuationOf",
  "bf:continuedBy", "bf:otherEdition", "bf:derivativeOf", "bf:basedOn", "bf:supplementTo", "bf:relatedTo"];

export interface ScoreRecord { id: string; document: any }
export interface ScoreEntity { kind: string; label: string; variants?: string[]; sameAs?: string[]; data?: Record<string, unknown>; mergedInto?: string | null }

export function scorecard(records: ScoreRecord[], entities: ScoreEntity[]): ScoreRow[] {
  let works = 0, summary = 0, classified = 0, genre = 0, linkedWorks = 0, instances = 0, withCopies = 0;
  for (const r of records) {
    const graph: any[] = Array.isArray(r.document?.["@graph"]) ? r.document["@graph"] : [];
    const byId = new Map(graph.map((n) => [n?.["@id"], n]));
    const deref = (v: any) => (v?.["@id"] && byId.has(v["@id"]) ? byId.get(v["@id"]) : v);
    const work = graph.find((n) => typed(n, "Work"));
    if (work) {
      works++;
      if (list(work["bf:summary"]).some((s) => text(deref(s)))) summary++;
      if (list(work["bf:classification"]).length || work["bf:classificationLcc"] || work["classificationLcc"]) classified++;
      if (list(work["bf:genreForm"]).length) genre++;
      const relation = list(work["bf:relation"]).some((x) => deref(x)?.["bf:associatedResource"])
        || RELATION_PROPS.some((p) => list(work[p]).some((v) => typeof v?.["@id"] === "string" && /^https?:/.test(v["@id"])));
      if (relation) linkedWorks++;
    }
    for (const inst of graph.filter((n) => typed(n, "Instance"))) {
      instances++;
      const items = graph.filter((n) => typed(n, "Item") && list(n["bf:itemOf"]).some((x) => (x?.["@id"] ?? x) === inst["@id"]));
      if (items.length || list(inst["bf:hasItem"]).length) withCopies++;
    }
  }
  const live = entities.filter((e) => !e.mergedInto && ["agent", "place", "topic", "genre"].includes(e.kind));
  const outside = live.filter((e) => (e.sameAs || []).length > 0).length;
  const people = live.filter((e) => e.kind === "agent" && (e.data?.agentType === "Person" || e.data?.agentType === undefined));
  const bothScripts = people.filter((e) => { const names = [e.label, ...(e.variants || [])]; return names.some((n) => ARABIC.test(n)) && names.some((n) => LATIN.test(n)); }).length;
  const dated = people.filter((e) => e.data?.birthDate || e.data?.deathDate || /\b\d{3,4}\s*[-–]/.test(e.label)).length;

  return [
    { key: "summary", en: "Books with a summary", ar: "كتب لها ملخص", value: summary, total: works, goal: 1 },
    { key: "classification", en: "Books with a classification", ar: "كتب لها تصنيف", value: classified, total: works, goal: 1 },
    { key: "genre", en: "Books with a genre or form", ar: "كتب لها نوع أو شكل", value: genre, total: works, goal: 1 },
    { key: "copies", en: "Editions with at least one copy and its place", ar: "طبعات لها نسخة ومكانها", value: withCopies, total: instances, goal: 1 },
    { key: "entitiesLinked", en: "Entities linked to LC, VIAF or Wikidata", ar: "كيانات مربوطة بمكتبة الكونغرس أو VIAF أو ويكي بيانات", value: outside, total: live.length, goal: 0.8 },
    { key: "bothScripts", en: "People with their name in Arabic and in Latin letters", ar: "أشخاص لأسمائهم صيغة عربية ولاتينية", value: bothScripts, total: people.length, goal: 1 },
    { key: "dates", en: "People with a birth or death date", ar: "أشخاص لهم تاريخ ميلاد أو وفاة", value: dated, total: people.length, goal: 1 },
    { key: "workLinks", en: "Books linked to another work (translation, commentary, part, edition …)", ar: "كتب مربوطة بعمل آخر (ترجمة، شرح، جزء، طبعة…)", value: linkedWorks, total: works, goal: null },
  ];
}

/** How far a row is from its goal: 1 = reached. A row with no goal counts as reached when it is above zero. */
export const progress = (r: ScoreRow) => (r.goal === null ? (r.value > 0 ? 1 : 0) : r.total ? Math.min(1, r.value / r.total / r.goal) : 1);
