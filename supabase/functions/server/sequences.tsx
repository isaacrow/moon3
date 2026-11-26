/**
 * Number sequences (plan step H6, after FOLIO's number generators): a library's barcodes, borrower cards, copies'
 * accession numbers and local call numbers can come
 * from a sequence it sets: a prefix, the next number and a width ("B" + 000123). The database hands numbers out
 * (moon_take_numbers), so two desks never get the same one; this file checks a sequence and shows what comes next.
 *
 * Call numbers ("callno") are only for a library's own running numbers (manuscripts "MS 0001", a running shelf
 * number): LC and Dewey call numbers are typed or come from the record, never from here. The cataloguer takes one
 * in the editor's copies panel; copies from an order or a copies import take one only when the sequence says so
 * (forNewCopies). A call number already on a copy is never replaced.
 */
export const SEQUENCE_KINDS = ["barcode", "card", "accession", "callno"] as const;
export type SequenceKind = typeof SEQUENCE_KINDS[number];
export interface Sequence {
  kind: SequenceKind; prefix: string; next: number; width: number;
  /** Call numbers only: copies added from an order or a copies import take one too. */
  forNewCopies?: boolean;
}

/** A number as the sequence writes it: the prefix, then the number padded to the width. */
export function formatNumber(prefix: string, n: number, width: number): string {
  return prefix + String(n).padStart(width, "0");
}

/** A sequence as sent from Studio, checked: the numbers it makes must still be valid barcodes and card numbers. */
export function readSequence(kind: string, raw: any): { sequence: Sequence } | { error: string } {
  if (!(SEQUENCE_KINDS as readonly string[]).includes(kind)) return { error: "Barcodes, borrower cards, accession numbers or call numbers?" };
  const callNo = kind === "callno";
  // A call number's prefix may hold a space and Arabic letters ("MS 0001", "مخ 12"); the others stay plain
  // letters and digits, since they are scanned and typed at the desk.
  const prefix = callNo ? String(raw?.prefix ?? "").replace(/\s+/g, " ").trimStart() : String(raw?.prefix ?? "").trim();
  if (callNo) {
    if (!/^([\p{L}\p{N}][\p{L}\p{N} ._\/-]{0,11})?$/u.test(prefix)) return { error: "The prefix: up to 12 letters, digits, spaces, dot, dash, slash or underscore, starting with a letter or digit" };
  } else if (!/^[A-Za-z0-9._-]{0,12}$/.test(prefix)) return { error: "The prefix: up to 12 letters, digits, dot, dash or underscore" };
  const next = Number(raw?.next);
  if (!Number.isInteger(next) || next < 1 || next > 1e12) return { error: "The next number: a whole number from 1" };
  const width = raw?.width === undefined || raw?.width === "" ? 0 : Number(raw.width);
  if (!Number.isInteger(width) || width < 0 || width > 12) return { error: "The width: 0 to 12 digits" };
  if (formatNumber(prefix, next, width).length > 40) return { error: "The numbers would be longer than 40 characters" };
  const sequence: Sequence = { kind: kind as SequenceKind, prefix, next, width };
  if (callNo) sequence.forNewCopies = raw?.forNewCopies === true;
  return { sequence };
}

const list = (v: any): any[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const typed = (n: any, t: string) => list(n?.["@type"]).some((x: any) => String(x) === `bf:${t}` || String(x).endsWith(`/${t}`) || String(x) === t);
const text = (v: any): string => {
  for (const x of list(v)) {
    if (typeof x === "string" || typeof x === "number") return String(x).trim();
    if (x && typeof x === "object") { const t = text(x["@value"] ?? x["rdfs:label"] ?? x["rdf:value"]); if (t) return t; }
  }
  return "";
};

/**
 * The call number the edition's copies already have, when they all have the same one (a new copy of the same
 * edition goes on the same shelf place); "" when none has one or they differ.
 */
export function editionCallNumber(document: any, instance: string): string {
  const marks = new Set<string>();
  for (const n of (Array.isArray(document?.["@graph"]) ? document["@graph"] : [])) {
    if (!typed(n, "Item") || list(n["bf:itemOf"] ?? n["itemOf"]).every((r: any) => (r?.["@id"] ?? r) !== instance)) continue;
    const m = text(n["bf:shelfMark"] ?? n["shelfMark"]);
    if (m) marks.add(m);
  }
  return marks.size === 1 ? [...marks][0] : "";
}

export interface CallNumberGroup { instance: string; rows: Array<{ shelfMark: string }> }
const lacking = (g: CallNumberGroup) => g.rows.filter((r) => !String(r.shelfMark || "").trim());

/** How many new call numbers these copies need: one per edition with a copy lacking one and none to share. */
export function callNumbersWanted(document: any, groups: CallNumberGroup[]): number {
  return groups.filter((g) => lacking(g).length > 0 && !editionCallNumber(document, g.instance)).length;
}

/**
 * Gives the new copies without a call number one: the edition's own when its copies share one, else the next
 * of `numbers` (one per edition, so copies of the same edition share it). Typed call numbers are kept. Changes
 * the rows; returns how many of `numbers` were used.
 */
export function giveCallNumbers(document: any, groups: CallNumberGroup[], numbers: string[]): number {
  let used = 0;
  for (const g of groups) {
    const rows = lacking(g);
    if (!rows.length) continue;
    let mark = editionCallNumber(document, g.instance);
    if (!mark && used < numbers.length) mark = numbers[used++];
    if (mark) for (const r of rows) r.shelfMark = mark;
  }
  return used;
}
