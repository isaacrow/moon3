/**
 * The quality checker (plan step D3, after LC's LCCNBot, 2026): a nightly job reads the catalogue and flags what a
 * person should look at, each with its reason. It never changes data. Three kinds of finding:
 *  - links: an entity linked to an LC or Wikidata address that no longer exists, whose name there looks nothing like
 *    Moon's, or that is not an address of a known kind;
 *  - records: two records with the same ISBN or LCCN (likely the same book catalogued twice), or the same title and
 *    first contributor;
 *  - entities: two entities of one kind with the same name, not yet merged.
 * Pure: index.tsx reads the tables, runs these and keeps the report.
 */
import { fold } from "./searchCore.tsx";

export type FindingKind = "link-gone" | "link-different" | "link-malformed" | "record-same-identifier" | "record-same-title" | "entity-same-name";
export interface Finding {
  kind: FindingKind;
  /** "check" for a likely problem, "look" for one a person may well find fine. */
  severity: "check" | "look";
  en: string; ar: string;
  items: Array<{ type: "record" | "entity" | "link"; id: string; label: string }>;
}
export interface QualityReport { at: string; findings: Finding[]; counts: Record<FindingKind, number>; checked: { records: number; entities: number; links: number } }

const words = (s: string) => new Set(fold(s).split(" ").filter((w) => w.length > 1 && !/^\d+$/.test(w)));
/** How alike two names are: the share of the shorter one's words in the longer (dates and one-letter words aside). */
export function nameLikeness(a: string, b: string): number {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 1; // nothing to compare: not a finding
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  let hit = 0;
  for (const w of small) if (big.has(w) || [...big].some((v) => v.length > 3 && w.length > 3 && (v.startsWith(w) || w.startsWith(v)))) hit++;
  return hit / small.size;
}

const KNOWN = /^https?:\/\/(id\.loc\.gov\/(authorities|vocabulary|resources|rwo)\/|www\.wikidata\.org\/entity\/Q\d+$|viaf\.org\/viaf\/\d+$|isni\.org\/isni\/\d{15}[\dX]$|orcid\.org\/\d{4}-\d{4}-\d{4}-\d{3}[\dX]$|(www\.)?geonames\.org\/\d+|vocab\.getty\.edu\/|d-nb\.info\/gnd\/|data\.bnf\.fr\/|mooon\.site\/)/;
const LATIN = /[A-Za-z]/;

export interface EntityRow { id: string; kind: string; label: string; variants?: string[]; sameAs?: string[]; mergedInto?: string | null }
export interface LabelRow { uri: string; labels: string[]; missing?: boolean }

/** Links that look wrong: gone at their source, a different name there, or not an address of a known kind. */
export function linkFindings(entities: EntityRow[], cache: Map<string, LabelRow>): Finding[] {
  const out: Finding[] = [];
  for (const e of entities) {
    if (e.mergedInto) continue;
    const names = [e.label, ...(e.variants || [])].filter(Boolean);
    for (const uri of e.sameAs || []) {
      const item = [{ type: "entity" as const, id: e.id, label: e.label }, { type: "link" as const, id: uri, label: uri }];
      if (!KNOWN.test(uri)) {
        out.push({ kind: "link-malformed", severity: "look", en: `${e.label}: ${uri} is not an address of a known authority file`, ar: `${e.label}: ${uri} ليس عنوانًا في ملف استنادي معروف`, items: item });
        continue;
      }
      const c = cache.get(uri);
      if (!c) continue;
      if (c.missing) {
        out.push({ kind: "link-gone", severity: "check", en: `${e.label}: ${uri} no longer exists at its source (deleted or replaced)`, ar: `${e.label}: ${uri} لم يعد موجودًا في مصدره (حُذف أو استُبدل)`, items: item });
        continue;
      }
      // Compare names in the same script: a Latin name at LC against Moon's Latin forms.
      const theirs = c.labels.filter((l) => LATIN.test(l));
      const ours = names.filter((n) => LATIN.test(n));
      if (!theirs.length || !ours.length) continue;
      const best = Math.max(...ours.flatMap((n) => theirs.map((l) => nameLikeness(n, l))));
      if (best < 0.34) {
        out.push({ kind: "link-different", severity: "check", en: `${e.label}: the name at ${uri} is “${theirs[0]}”, which looks like another one`, ar: `${e.label}: الاسم في ${uri} هو «${theirs[0]}»، ويبدو اسمًا آخر`, items: item });
      }
    }
  }
  return out;
}

export interface RecordRow { id: string; title: string; identifier_keys?: string[] | null; title_key?: string | null; first_contributor?: string | null }

/** Records that are likely the same book: the same ISBN or LCCN; or the same title and first contributor. */
export function recordFindings(records: RecordRow[]): Finding[] {
  const out: Finding[] = [];
  const byKey = new Map<string, RecordRow[]>();
  for (const r of records) for (const k of r.identifier_keys || []) if (/^(isbn|lccn):/.test(k)) byKey.set(k, [...(byKey.get(k) || []), r]);
  const reported = new Set<string>();
  for (const [k, rs] of byKey) {
    if (rs.length < 2) continue;
    const key = rs.map((r) => r.id).sort().join("|");
    if (reported.has(key)) continue;
    reported.add(key);
    const [type, value] = k.split(":");
    out.push({
      kind: "record-same-identifier", severity: "check",
      en: `${rs.length} records have the same ${type.toUpperCase()} ${value}`, ar: `${rs.length} تسجيلات لها ${type === "isbn" ? "الردمك" : "رقم LCCN"} نفسه ${value}`,
      items: rs.map((r) => ({ type: "record" as const, id: r.id, label: r.title })),
    });
  }
  const byTitle = new Map<string, RecordRow[]>();
  for (const r of records) {
    if (!r.title_key) continue;
    const k = `${r.title_key}|${fold(r.first_contributor || "")}`;
    byTitle.set(k, [...(byTitle.get(k) || []), r]);
  }
  for (const rs of byTitle.values()) {
    if (rs.length < 2) continue;
    const key = rs.map((r) => r.id).sort().join("|");
    if (reported.has(key)) continue;
    reported.add(key);
    out.push({
      kind: "record-same-title", severity: "look",
      en: `${rs.length} records have the same title and first contributor; another edition, or a duplicate?`,
      ar: `${rs.length} تسجيلات لها العنوان والمساهم الأول نفسهما؛ طبعة أخرى أم تكرار؟`,
      items: rs.map((r) => ({ type: "record" as const, id: r.id, label: r.title })),
    });
  }
  return out;
}

/** Entities of one kind with the same name (folded), none merged into the other. */
export function entityFindings(entities: EntityRow[]): Finding[] {
  const groups = new Map<string, EntityRow[]>();
  for (const e of entities) {
    if (e.mergedInto || !e.label) continue;
    const k = `${e.kind}|${fold(e.label)}`;
    groups.set(k, [...(groups.get(k) || []), e]);
  }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => ({
    kind: "entity-same-name" as const, severity: "check" as const,
    en: `${g.length} entities named “${g[0].label}”: the same one, to merge?`, ar: `${g.length} كيانات باسم «${g[0].label}»: كيان واحد يُدمج؟`,
    items: g.map((e) => ({ type: "entity" as const, id: e.id, label: e.label })),
  }));
}

export function report(records: RecordRow[], entities: EntityRow[], cache: Map<string, LabelRow>, now = new Date()): QualityReport {
  const findings = [...linkFindings(entities, cache), ...recordFindings(records), ...entityFindings(entities)];
  const counts = { "link-gone": 0, "link-different": 0, "link-malformed": 0, "record-same-identifier": 0, "record-same-title": 0, "entity-same-name": 0 } as Record<FindingKind, number>;
  for (const f of findings) counts[f.kind]++;
  return { at: now.toISOString(), findings, counts, checked: { records: records.length, entities: entities.length, links: entities.reduce((n, e) => n + (e.sameAs?.length || 0), 0) } };
}
