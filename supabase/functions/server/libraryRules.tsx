/**
 * Each library's own rules at save (plan step H10, after FOLIO's MARC validation rules and LCCN checks): on top of
 * Moon's publish gate (publishGate.tsx), a library can require more fields and turn on checks: a valid ISBN check
 * digit, the LCCN in its normalized form, no other record with the same ISBN or LCCN. Saving is always allowed, as
 * before; each rule either blocks publishing until it is met, or only warns. A reviewer or the Super Admin sets them.
 * Pure: index.tsx reads the rules from the store, finds duplicates and joins the result to the gate's.
 */
import type { MissingField } from "./publishGate.tsx";

export type RuleMode = "off" | "warn" | "block";
export const CHECKS = ["isbnValid", "lccnForm", "duplicateIsbn", "duplicateLccn"] as const;
export type CheckId = typeof CHECKS[number];

export interface LibraryRules {
  /** Fields this library also requires before a record is published. */
  required: FieldId[];
  checks: Record<CheckId, RuleMode>;
}

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const typesOf = (n: any) => list(n?.["@type"]).filter((t) => typeof t === "string").map((t: string) => t.replace(/^.*[/#:]/, ""));
const prop = (n: any, name: string) => [...list(n?.[`bf:${name}`]), ...list(n?.[name])];
function texts(v: any, depth = 0): string[] {
  if (v == null || depth > 4) return [];
  if (typeof v === "string" || typeof v === "number") return [String(v)];
  if (Array.isArray(v)) return v.flatMap((x) => texts(x, depth + 1));
  if (typeof v === "object") return [v["@id"], v["@value"], v["rdfs:label"], v["rdf:value"], v.value, v.label, v["bf:mainTitle"], v["bf:classificationPortion"]].flatMap((x) => texts(x, depth + 1));
  return [];
}
const nodes = (doc: any): any[] => (Array.isArray(doc?.["@graph"]) ? doc["@graph"] : doc ? [doc] : []);
const works = (doc: any) => nodes(doc).filter((n) => typesOf(n).some((t) => t === "Work" || t === "Text"));
const instances = (doc: any) => nodes(doc).filter((n) => typesOf(n).some((t) => /^(Instance|Print|Electronic|Manuscript)$/.test(t)));
const has = (ns: any[], name: string) => ns.some((n) => prop(n, name).some((v) => texts(v).some((t) => t.trim())));
const identifiers = (doc: any, kind: string) => instances(doc).flatMap((i) => prop(i, "identifiedBy")).filter((x) => typesOf(x).includes(kind))
  .flatMap((x) => texts(x?.["rdf:value"] ?? x?.value ?? x)).map((s) => s.trim()).filter(Boolean);

/** The fields a library may add to the ones Moon requires, and how each is found in a record. */
export const RULE_FIELDS = {
  isbn: { en: "ISBN", ar: "ردمك (ISBN)", entity: "Instance", test: (d: any) => identifiers(d, "Isbn").length > 0 },
  lccn: { en: "LCCN", ar: "رقم LCCN", entity: "Instance", test: (d: any) => identifiers(d, "Lccn").length > 0 },
  subject: { en: "Subject", ar: "الموضوع", entity: "Work", test: (d: any) => has(works(d), "subject") },
  classification: { en: "Classification", ar: "التصنيف", entity: "Work", test: (d: any) => has(works(d), "classification") },
  genreForm: { en: "Genre / form", ar: "النوع / الشكل", entity: "Work", test: (d: any) => has(works(d), "genreForm") },
  summary: { en: "Summary", ar: "الملخص", entity: "Work", test: (d: any) => has(works(d), "summary") },
  extent: { en: "Extent", ar: "الوصف المادي", entity: "Instance", test: (d: any) => has(instances(d), "extent") },
  publisher: { en: "Publication", ar: "بيانات النشر", entity: "Instance", test: (d: any) => has(instances(d), "provisionActivity") },
  responsibility: { en: "Statement of responsibility", ar: "بيان المسؤولية", entity: "Instance", test: (d: any) => has(instances(d), "responsibilityStatement") },
} as const;
export type FieldId = keyof typeof RULE_FIELDS;

export const CHECK_NAMES: Record<CheckId, { en: string; ar: string }> = {
  isbnValid: { en: "ISBN check digit is right", ar: "رقم التحقق في ردمك صحيح" },
  lccnForm: { en: "LCCN is in its normalized form", ar: "رقم LCCN بصيغته المعيارية" },
  duplicateIsbn: { en: "No other record has the same ISBN", ar: "لا تسجيلة أخرى بالردمك نفسه" },
  duplicateLccn: { en: "No other record has the same LCCN", ar: "لا تسجيلة أخرى برقم LCCN نفسه" },
};

export const DEFAULT_RULES: LibraryRules = { required: [], checks: { isbnValid: "warn", lccnForm: "warn", duplicateIsbn: "warn", duplicateLccn: "warn" } };

/** Stored or sent rules, every value checked; anything unknown is left out. */
export function parseRules(raw: unknown): LibraryRules {
  const r: any = raw && typeof raw === "object" ? raw : {};
  const modes: RuleMode[] = ["off", "warn", "block"];
  return {
    required: [...new Set(list(r.required).filter((f) => typeof f === "string" && f in RULE_FIELDS))] as FieldId[],
    checks: Object.fromEntries(CHECKS.map((c) => [c, modes.includes(r.checks?.[c]) ? r.checks[c] : DEFAULT_RULES.checks[c]])) as Record<CheckId, RuleMode>,
  };
}

/** An ISBN-10 or ISBN-13 whose check digit is right (hyphens, spaces and a trailing qualifier aside). */
export function isbnValid(raw: string): boolean {
  const s = raw.replace(/\(.*\)|[^0-9Xx]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = [...s].reduce((t, ch, i) => t + (ch === "X" ? 10 : Number(ch)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(s)) {
    const sum = [...s].reduce((t, ch, i) => t + Number(ch) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }
  return false;
}

/**
 * The LCCN in LC's normalized form (https://www.loc.gov/marc/lccn-namespace.html): letters (up to three), then the
 * year (two or four digits) and a six-digit serial, no spaces or hyphen; "n 79-21164" is "n79021164". Null when it
 * cannot be one.
 */
export function normalizeLccn(raw: string): string | null {
  let s = raw.replace(/\s+/g, "").split("/")[0];
  const dash = s.indexOf("-");
  if (dash > 0) { const serial = s.slice(dash + 1); if (!/^\d{1,6}$/.test(serial)) return null; s = s.slice(0, dash) + serial.padStart(6, "0"); }
  const m = s.match(/^([a-z]{0,3})(\d{8}|\d{10})$/);
  return m ? s : null;
}

export interface RuleResult {
  /** Fields the library requires that the record lacks: these join the publish gate's missing fields. */
  missing: MissingField[];
  /** Checks that failed, each blocking publishing or only warning. */
  problems: Array<{ check: CheckId; severity: "block" | "warn"; en: string; ar: string }>;
}

/** The library's rules on one record. `duplicates` is what the duplicate finder said about it. */
export function checkRules(document: any, rules: LibraryRules, duplicates: Array<{ id: string; title?: string; reasons?: string[] }> = []): RuleResult {
  const missing: MissingField[] = rules.required.filter((f) => !RULE_FIELDS[f].test(document))
    .map((f) => ({ entity: RULE_FIELDS[f].entity as "Work" | "Instance", field: f, en: RULE_FIELDS[f].en, ar: RULE_FIELDS[f].ar }));
  const problems: RuleResult["problems"] = [];
  const say = (check: CheckId, en: string, ar: string) => {
    const mode = rules.checks[check];
    if (mode !== "off") problems.push({ check, severity: mode, en, ar });
  };
  for (const isbn of identifiers(document, "Isbn")) if (!isbnValid(isbn)) say("isbnValid", `The ISBN ${isbn} has a wrong check digit`, `رقم التحقق في الردمك ${isbn} غير صحيح`);
  for (const lccn of identifiers(document, "Lccn")) {
    const n = normalizeLccn(lccn);
    if (!n) say("lccnForm", `${lccn} is not an LCCN`, `${lccn} ليس رقم LCCN`);
    else if (n !== lccn) say("lccnForm", `Write the LCCN as ${n}`, `اكتب رقم LCCN هكذا: ${n}`);
  }
  for (const d of duplicates) {
    const name = d.title ? `“${d.title}” (${d.id})` : d.id;
    if (d.reasons?.includes("isbn")) say("duplicateIsbn", `${name} has the same ISBN`, `التسجيلة ${name} لها الردمك نفسه`);
    if (d.reasons?.includes("lccn")) say("duplicateLccn", `${name} has the same LCCN`, `التسجيلة ${name} لها رقم LCCN نفسه`);
  }
  return { missing, problems };
}

/** What stops publishing: the library's missing fields, and its blocking checks as fields to fix. */
export function blockers(r: RuleResult): MissingField[] {
  return [...r.missing, ...r.problems.filter((p) => p.severity === "block").map((p) => ({ entity: "Instance" as const, field: p.check, en: p.en, ar: p.ar }))];
}
