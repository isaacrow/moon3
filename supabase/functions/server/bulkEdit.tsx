/**
 * Bulk change (plan step H3, after FOLIO's Bulk Edit): a list made with Lists (lists.tsx) is changed in one job, a
 * field set to one value on every row: copies moved to another location or made reference only, due dates moved
 * (a closure), borrowers' kind or block, holds' collection date, subscriptions and vendors made active or not.
 * A preview shows every change before anything is written; the job keeps each row's value before and after, so the
 * whole job can be undone, and an undo leaves alone any row changed again since.
 * Pure: listsRoutes.tsx reads and writes; this file says what may change, plans the changes and edits a copy in a
 * record's document.
 */
import { ENTITIES, dayOf, type EntityId, type Row } from "./lists.tsx";

export type BulkType = "text" | "bool" | "date" | "choice";
export interface BulkField {
  entity: EntityId; key: string; type: BulkType; en: string; ar: string;
  /** The table and column written; none for copies, which live in their record's document. */
  table?: string; column?: string;
  choices?: Array<{ v: string; en: string; ar: string }>;
}

const choicesOf = (entity: EntityId, key: string) => ENTITIES[entity].fields.find((f) => f.key === key)?.choices;

export const BULK_FIELDS: BulkField[] = [
  { entity: "copies", key: "location", type: "text", en: "Location", ar: "المكان" },
  { entity: "copies", key: "reference_only", type: "bool", en: "Reference only", ar: "للاطلاع فقط" },
  { entity: "loans", key: "due_at", type: "date", en: "Due date (loans still out)", ar: "تاريخ الاستحقاق (للإعارات التي لم تُرجع)", table: "loans", column: "due_at" },
  { entity: "borrowers", key: "kind", type: "choice", en: "Kind of borrower", ar: "نوع المستفيد", table: "patrons", column: "kind", choices: choicesOf("borrowers", "kind") },
  { entity: "borrowers", key: "blocked", type: "bool", en: "Blocked", ar: "موقوف", table: "patrons", column: "blocked" },
  { entity: "holds", key: "expires_at", type: "date", en: "Collect by (holds waiting or on the shelf)", ar: "آخر موعد للاستلام (للحجوزات القائمة)", table: "holds", column: "expires_at" },
  { entity: "subscriptions", key: "active", type: "bool", en: "Active", ar: "فعّال", table: "acq_subscriptions", column: "active" },
  { entity: "subscriptions", key: "end_date", type: "date", en: "Ends", ar: "ينتهي", table: "acq_subscriptions", column: "end_date" },
  { entity: "vendors", key: "active", type: "bool", en: "Currently used", ar: "نتعامل معه حاليًا", table: "acq_vendors", column: "active" },
];
export const MAX_CHANGES = 2000;

export const bulkFieldOf = (entity: EntityId, key: string) => BULK_FIELDS.find((f) => f.entity === entity && f.key === key);

/** The field and the value to set, checked. A date may be counted from today (today+7). */
export function readBulk(entity: EntityId, input: any, now = new Date()): { field: BulkField; value: string | boolean } | { error: string } {
  const field = bulkFieldOf(entity, String(input?.field || ""));
  if (!field) return { error: "This field cannot be changed in bulk" };
  const raw = typeof input.value === "boolean" ? String(input.value) : String(input.value ?? "").trim();
  if (field.type === "bool") {
    if (raw !== "true" && raw !== "false") return { error: `${field.en} is yes or no` };
    return { field, value: raw === "true" };
  }
  if (field.type === "date") {
    if (!/^(\d{4}-\d{2}-\d{2}|today([+-]\d{1,4})?)$/.test(raw)) return { error: `${field.en} takes a date (YYYY-MM-DD, or today+7)` };
    const day = dayOf(raw, now);
    if (isNaN(new Date(day).getTime())) return { error: `${field.en}: no such day` };
    return { field, value: day };
  }
  if (field.type === "choice") {
    if (!field.choices?.some((c) => c.v === raw)) return { error: `Choose one of the kinds for ${field.en}` };
    return { field, value: raw };
  }
  if (!raw || raw.length > 120) return { error: `Give ${field.en} (up to 120 characters)` };
  return { field, value: raw };
}

export interface Change { key: string; recordId?: string; label: string; before: unknown; after: unknown }
export interface Plan { changes: Change[]; unchanged: number; skipped: Array<{ label: string; why: string }> }

/** What a row is called in the preview and the job. */
function labelOf(entity: EntityId, r: Row): string {
  const s = (v: unknown) => (v == null ? "" : String(v));
  switch (entity) {
    case "copies": return `${s(r.barcode)} · ${s(r.title)}`;
    case "loans": return `${s(r.barcode)} · ${s(r.record_title)}${r.borrower_name ? ` · ${s(r.borrower_name)}` : ""}`;
    case "borrowers": return `${s(r.card)} · ${s(r.name)}`;
    case "holds": return `${s(r.record_title)}${r.borrower_name ? ` · ${s(r.borrower_name)}` : ""}`;
    default: return s(r.title || r.name || r.number || r.id);
  }
}

/** The date part set, the time of day kept (a due date keeps its hour). */
const withDay = (before: unknown, day: string) => (typeof before === "string" && before.length > 10 ? day + before.slice(10) : day);

/** Every row the job would change, the rows it leaves as they are, and the rows it may not change. */
export function planChanges(entity: EntityId, rows: Row[], field: BulkField, value: string | boolean): Plan {
  const plan: Plan = { changes: [], unchanged: 0, skipped: [] };
  for (const r of rows) {
    const label = labelOf(entity, r);
    if (entity === "loans" && r.returned_at) { plan.skipped.push({ label, why: "already returned" }); continue; }
    if (entity === "holds" && !["waiting", "ready"].includes(String(r.status))) { plan.skipped.push({ label, why: "no longer waiting" }); continue; }
    const key = entity === "copies" ? String(r.barcode ?? "") : String(r.id ?? "");
    if (!key) { plan.skipped.push({ label, why: "no number to find it by" }); continue; }
    const before = r[field.key] ?? (field.type === "bool" ? false : null);
    const after = field.type === "date" ? withDay(before, String(value)) : value;
    const same = field.type === "date" ? String(before ?? "").slice(0, 10) === String(value) : field.type === "bool" ? !!before === after : String(before ?? "") === String(after);
    if (same) { plan.unchanged++; continue; }
    plan.changes.push({ key, ...(entity === "copies" ? { recordId: String(r.record_id) } : {}), label, before: before ?? null, after });
  }
  return plan;
}

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const typed = (n: any, name: string) => list(n?.["@type"]).some((t) => typeof t === "string" && (t === `bf:${name}` || t === name || t.endsWith(`/${name}`)));
function textOf(v: any): string {
  for (const x of list(v)) {
    if (typeof x === "string" || typeof x === "number") return String(x).trim();
    if (x && typeof x === "object") { const t = textOf(x["@value"] ?? x["rdfs:label"] ?? x["label"] ?? x["rdf:value"] ?? x["value"]); if (t) return t; }
  }
  return "";
}
const barcodeOf = (n: any) => {
  const bc = list(n["bf:identifiedBy"] ?? n["identifiedBy"]).find((i) => typed(i, "Barcode"));
  return bc ? textOf(bc) : textOf(n["bf:barcode"] ?? n["barcode"]);
};
export const REFERENCE_ONLY = { "@type": "bf:UsePolicy", "rdfs:label": "Reference only — للاطلاع فقط" };

/**
 * A record's document with one copy changed (found by its barcode), written as the editor and the copies import
 * write it: the location as bf:sublocation, reference only as a bf:UsePolicy. Null when no copy has the barcode.
 */
export function withCopyChange(document: any, barcode: string, key: "location" | "reference_only", value: unknown): any | null {
  const doc = JSON.parse(JSON.stringify(document));
  let found = false;
  const walk = (n: any, depth: number) => {
    if (!n || typeof n !== "object" || depth > 6) return;
    if (Array.isArray(n)) { n.forEach((x) => walk(x, depth + 1)); return; }
    if (typed(n, "Item") && barcodeOf(n) === barcode) {
      found = true;
      if (key === "location") {
        delete n.sublocation;
        if (value) n["bf:sublocation"] = { "@type": "bf:Sublocation", "rdfs:label": String(value) };
        else delete n["bf:sublocation"];
      } else {
        const others = list(n["bf:usageAndAccessPolicy"] ?? n.usageAndAccessPolicy).filter((p) => !/reference|للاطلاع/i.test(textOf(p)));
        delete n.usageAndAccessPolicy;
        const all = value ? [...others, REFERENCE_ONLY] : others;
        if (all.length) n["bf:usageAndAccessPolicy"] = all.length === 1 ? all[0] : all; else delete n["bf:usageAndAccessPolicy"];
      }
    }
    for (const k of ["@graph", "bf:hasItem", "hasItem"]) if (n[k]) walk(n[k], depth + 1);
  };
  walk(doc, 0);
  return found ? doc : null;
}
