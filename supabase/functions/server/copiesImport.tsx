// Bulk import of copies (OPAC plan, stage 1 step 3): the library's shelf list as a spreadsheet, one row per copy,
// becomes bf:Item nodes on the right records, so the catalogue can say where each book is.
//
// A row names its book by Moon record id or by ISBN (10 or 13 digits, hyphens or not, either form finds the
// other), and gives the library, the place in it, the shelf mark, the barcode, the copy number, "reference only"
// and a note. Column names may be English or Arabic. A copy already on the record (same barcode, or the same
// library, shelf mark and copy number) is not added again, so the same sheet can be imported twice safely.
// Items are written as the editor's copies panel writes them (src/services/itemCopies.ts), so the editor, the
// OPAC and the exports read imported copies like any other. Pure: index.tsx does the reading and the saving.

export interface CopyRow {
  line: number;
  record: string; isbn: string; library: string; location: string; shelfMark: string; barcode: string;
  copyNumber: string; referenceOnly: boolean; note: string;
}

const COLUMNS: Record<keyof Omit<CopyRow, "line">, RegExp> = {
  record: /^(record|record id|id|moon id|رقم التسجيلة|التسجيلة|المعرف)$/i,
  isbn: /^(isbn|ردمك|رقم isbn|الرقم الدولي)$/i,
  library: /^(library|held by|المكتبة|الجهة)$/i,
  location: /^(location|sublocation|collection|place|المكان|الموقع|القسم|المجموعة)$/i,
  shelfMark: /^(shelf ?mark|call ?number|call no\.?|رقم الرف|رمز الرف|رقم الاستدعاء|التصنيف)$/i,
  barcode: /^(barcode|item barcode|الباركود|الرمز الشريطي)$/i,
  copyNumber: /^(copy|copy number|copy no\.?|c\.|النسخة|رقم النسخة)$/i,
  referenceOnly: /^(reference|reference only|ref|للاطلاع|للاطلاع فقط|مرجع)$/i,
  note: /^(note|notes|ملاحظة|ملاحظات)$/i,
};

/** One line of CSV or TSV (from Excel or Google Sheets), with "quoted, fields" and "" for a quote. */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === "") { quoted = true; cur = ""; }
    else if (ch === sep) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const YES = /^(yes|y|true|1|x|نعم|✓)$/i;
export const MAX_ROWS = 2000;

/** The rows of a pasted or uploaded sheet, and what could not be read (no header it knows, too many rows …). */
export function parseCopiesTable(text: string): { rows: CopyRow[]; problems: string[] } {
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], problems: ["The sheet is empty"] };
  const sep = lines[0].includes("\t") ? "\t" : lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const header = splitLine(lines[0], sep).map((h) => h.replace(/\s+/g, " ").trim());
  const index: Partial<Record<keyof typeof COLUMNS, number>> = {};
  header.forEach((h, i) => {
    for (const [key, re] of Object.entries(COLUMNS)) if (re.test(h) && index[key as keyof typeof COLUMNS] === undefined) index[key as keyof typeof COLUMNS] = i;
  });
  const problems: string[] = [];
  if (index.record === undefined && index.isbn === undefined) problems.push('No "ISBN" or "Record" column: each row must name its book');
  if (index.library === undefined && index.shelfMark === undefined && index.location === undefined && index.barcode === undefined) {
    problems.push('No "Library", "Location", "Shelf mark" or "Barcode" column: there is nothing to say where the copy is');
  }
  if (problems.length) return { rows: [], problems };
  if (lines.length - 1 > MAX_ROWS) problems.push(`Only the first ${MAX_ROWS} rows are read; split the sheet`);
  const rows: CopyRow[] = [];
  lines.slice(1, MAX_ROWS + 1).forEach((l, i) => {
    const cells = splitLine(l, sep);
    const get = (k: keyof typeof COLUMNS) => (index[k] === undefined ? "" : (cells[index[k]!] || "").slice(0, 300));
    const row: CopyRow = {
      line: i + 2, record: get("record"), isbn: get("isbn"), library: get("library"), location: get("location"),
      shelfMark: get("shelfMark"), barcode: get("barcode"), copyNumber: get("copyNumber").replace(/^c\.\s*/i, ""),
      referenceOnly: YES.test(get("referenceOnly")), note: get("note"),
    };
    if (Object.entries(row).some(([k, v]) => k !== "line" && k !== "referenceOnly" && v)) rows.push(row);
  });
  return { rows, problems };
}

// ---- ISBNs ----

/** An ISBN as 13 digits, from ISBN-10 or ISBN-13 with or without hyphens; "" when it is not one. */
export function isbn13(raw: string): string {
  const d = String(raw || "").toUpperCase().replace(/[^0-9X]/g, "");
  if (/^97[89]\d{10}$/.test(d)) return d;
  if (/^\d{9}[\dX]$/.test(d)) {
    const core = "978" + d.slice(0, 9);
    const sum = [...core].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0);
    return core + ((10 - (sum % 10)) % 10);
  }
  return "";
}

// ---- The records ----

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const typed = (n: any, t: string) => list(n?.["@type"]).some((x: any) => String(x) === `bf:${t}` || String(x).endsWith(`/${t}`) || String(x) === t);
const text = (v: any): string => {
  for (const x of list(v)) {
    if (typeof x === "string" || typeof x === "number") return String(x).trim();
    if (x && typeof x === "object") { const t = text(x["@value"] ?? x["rdfs:label"] ?? x["rdf:value"] ?? x["bf:value"]); if (t) return t; }
  }
  return "";
};

export interface RecordLike { id: string; title?: string; document: any; version?: number }

/** Every ISBN of a record's Instances, as 13 digits, with the Instance it belongs to. */
export function isbnsOf(document: any): Array<{ isbn: string; instance: string }> {
  const graph: any[] = Array.isArray(document?.["@graph"]) ? document["@graph"] : [];
  const byId = new Map(graph.map((n) => [n?.["@id"], n]));
  const out: Array<{ isbn: string; instance: string }> = [];
  for (const inst of graph.filter((n) => typed(n, "Instance"))) {
    for (const ref of list(inst["bf:identifiedBy"] ?? inst["identifiedBy"])) {
      const id = ref?.["@id"] && byId.has(ref["@id"]) ? byId.get(ref["@id"]) : ref;
      if (!typed(id, "Isbn")) continue;
      const v = isbn13(text(id?.["rdf:value"] ?? id?.["bf:value"] ?? id?.["value"] ?? id));
      if (v) out.push({ isbn: v, instance: inst["@id"] });
    }
  }
  return out;
}

const firstInstance = (document: any): string | undefined =>
  (Array.isArray(document?.["@graph"]) ? document["@graph"] : []).find((n: any) => typed(n, "Instance"))?.["@id"];

/** The copies already on an Instance, as keys that say "the same copy". */
function existingKeys(document: any, instance: string): Set<string> {
  const keys = new Set<string>();
  for (const n of (Array.isArray(document?.["@graph"]) ? document["@graph"] : [])) {
    if (!typed(n, "Item") || list(n["bf:itemOf"] ?? n["itemOf"]).every((r: any) => (r?.["@id"] ?? r) !== instance)) continue;
    const barcode = list(n["bf:identifiedBy"]).map((b: any) => (typed(b, "Barcode") ? text(b) : "")).find(Boolean);
    if (barcode) keys.add(`barcode:${barcode.toLowerCase()}`);
    keys.add(copyKey(text(n["bf:heldBy"]), text(n["bf:shelfMark"]) || text(n["bf:sublocation"]), text(n["bf:enumerationAndChronology"]).replace(/^c\.\s*/i, "")));
  }
  return keys;
}
const copyKey = (library: string, shelfMark: string, copy: string) => `copy:${library.toLowerCase().trim()}|${shelfMark.toLowerCase().replace(/\s+/g, " ").trim()}|${copy.trim()}`;
// A barcode names one copy on its own; without one, the library, the shelf mark (or the location) and the copy
// number together say which copy it is. Two copies with different barcodes are two copies, whatever else they share.
const keysOf = (r: CopyRow) => (r.barcode ? [`barcode:${r.barcode.toLowerCase()}`] : [copyKey(r.library, r.shelfMark || r.location, r.copyNumber)]);

export type RowStatus = "add" | "already there" | "no such book" | "several books" | "repeated in the sheet";
export interface PlannedRow { line: number; status: RowStatus; recordId?: string; title?: string; instance?: string; row: CopyRow }

/** What the import would do with each row, without changing anything (the preview). */
export function planImport(records: RecordLike[], rows: CopyRow[]): PlannedRow[] {
  const byIsbn = new Map<string, Array<{ record: RecordLike; instance: string }>>();
  for (const r of records) for (const { isbn, instance } of isbnsOf(r.document)) {
    const at = byIsbn.get(isbn) || [];
    if (!at.some((x) => x.record.id === r.id)) at.push({ record: r, instance });
    byIsbn.set(isbn, at);
  }
  const byId = new Map(records.map((r) => [r.id, r]));
  const seen = new Set<string>();
  return rows.map((row) => {
    let target: { record: RecordLike; instance: string } | undefined;
    if (row.record) {
      const r = byId.get(row.record.trim());
      const instance = r && firstInstance(r.document);
      if (r && instance) target = { record: r, instance };
    } else if (row.isbn) {
      const found = byIsbn.get(isbn13(row.isbn)) || [];
      if (found.length > 1) return { line: row.line, status: "several books" as const, row };
      target = found[0];
    }
    if (!target) return { line: row.line, status: "no such book" as const, row };
    const base = { line: row.line, recordId: target.record.id, title: target.record.title, instance: target.instance, row };
    const keys = keysOf(row).map((k) => `${target!.instance}|${k}`);
    if (keys.some((k) => seen.has(k))) return { ...base, status: "repeated in the sheet" as const };
    keys.forEach((k) => seen.add(k));
    const there = existingKeys(target.record.document, target.instance);
    if (keysOf(row).some((k) => there.has(k))) return { ...base, status: "already there" as const };
    return { ...base, status: "add" as const };
  });
}

/** A new copy's address next to its Instance's: …/instance/<id> → …/item/<id>-<n>. */
export function itemId(instance: string, n: number, salt: string): string {
  const m = instance.match(/^(.*)\/instance\/([^/#]+)$/);
  return m ? `${m[1]}/item/${m[2]}-${salt}${n}` : `${instance.replace(/#.*$/, "")}#item-${salt}${n}`;
}

/** The record's document with these copies added as bf:Items of the Instance (the input is not changed). */
export function withCopies(document: any, instance: string, rows: CopyRow[], salt: string): any {
  const doc = JSON.parse(JSON.stringify(document));
  const graph: any[] = Array.isArray(doc["@graph"]) ? doc["@graph"] : (doc["@graph"] = []);
  const inst = graph.find((n) => n?.["@id"] === instance);
  if (!inst) return doc;
  rows.forEach((r, i) => {
    const id = itemId(instance, i + 1, salt);
    const node: any = { "@id": id, "@type": "bf:Item", "bf:itemOf": { "@id": instance } };
    if (r.library) node["bf:heldBy"] = { "@type": "bf:Organization", "rdfs:label": r.library };
    if (r.location) node["bf:sublocation"] = { "@type": "bf:Sublocation", "rdfs:label": r.location };
    if (r.shelfMark) node["bf:shelfMark"] = { "@type": "bf:ShelfMark", "rdfs:label": r.shelfMark };
    if (r.barcode) node["bf:identifiedBy"] = [{ "@type": "bf:Barcode", "rdf:value": r.barcode }];
    if (r.copyNumber) node["bf:enumerationAndChronology"] = { "@type": "bf:Enumeration", "rdfs:label": `c. ${r.copyNumber}` };
    if (r.referenceOnly) node["bf:usageAndAccessPolicy"] = { "@type": "bf:UsePolicy", "rdfs:label": "Reference only — للاطلاع فقط" };
    if (r.note) node["bf:note"] = { "@type": "bf:Note", "rdfs:label": r.note };
    graph.push(node);
    inst["bf:hasItem"] = [...list(inst["bf:hasItem"]), { "@id": id }];
  });
  return doc;
}

/** The rows to add, grouped by record and Instance (one save per record). */
export function byRecord(plan: PlannedRow[]): Map<string, { instance: string; rows: CopyRow[] }[]> {
  const out = new Map<string, { instance: string; rows: CopyRow[] }[]>();
  for (const p of plan) {
    if (p.status !== "add" || !p.recordId || !p.instance) continue;
    const groups = out.get(p.recordId) || [];
    const g = groups.find((x) => x.instance === p.instance);
    if (g) g.rows.push(p.row); else groups.push({ instance: p.instance, rows: [p.row] });
    out.set(p.recordId, groups);
  }
  return out;
}
