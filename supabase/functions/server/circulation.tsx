/**
 * Circulation (the library's loan desk): borrowers, loans, renewals, holds and, if the library wants them,
 * fines. This file is the pure part (rules, dates, checks, finding a copy in a record by its barcode); the
 * routes are in circulationRoutes.tsx and the tables in the circulation migration.
 *
 * What Moon keeps about borrowers, and for how long:
 *   - a borrower: card number, name, kind (reader, student, staff), and optionally an email, a phone and a note;
 *   - a loan names its borrower only while it is out. When the book comes back the borrower is removed from the
 *     loan, so Moon keeps no reading history: only that the copy was lent and returned, and when (for counts).
 *     A loan that ends with an unpaid fine keeps its borrower until the fine is paid or waived.
 *   - a borrower can be deleted when they have nothing out and owe nothing.
 * No imports: the tests run it in Node.
 */

export type PatronKind = "reader" | "student" | "staff";
export const PATRON_KINDS: PatronKind[] = ["reader", "student", "staff"];

export interface Rules {
  /** Days a loan lasts, by kind of borrower. */
  loanDays: Record<PatronKind, number>;
  /** Most copies out at once, by kind of borrower. */
  maxLoans: Record<PatronKind, number>;
  /** How many times one loan may be renewed. */
  maxRenewals: number;
  /** Whether the library charges for late returns. */
  fines: boolean;
  finePerDay: number;
  /** The most one loan can be fined. */
  fineCap: number;
  currency: string;
  /** Days a copy waits on the hold shelf for the borrower who asked for it. */
  holdDays: number;
  /** Days a reading-room copy waits on the hold shelf for its reader between visits (plan step H7). */
  roomDays: number;
}

export const DEFAULT_RULES: Rules = {
  loanDays: { reader: 14, student: 21, staff: 30 },
  maxLoans: { reader: 5, student: 10, staff: 20 },
  maxRenewals: 2,
  fines: false,
  finePerDay: 0.25,
  fineCap: 10,
  currency: "USD",
  holdDays: 7,
  roomDays: 3,
};

const DAY = 86_400_000;
const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/** The library's rules from what was stored (or sent), every value checked; missing values are the defaults. */
export function parseRules(raw: unknown): Rules {
  let r: any = raw;
  if (typeof r === "string") { try { r = JSON.parse(r); } catch { r = null; } }
  if (!r || typeof r !== "object") r = {};
  const d = DEFAULT_RULES;
  const byKind = (o: any, dflt: Record<PatronKind, number>, hi: number) =>
    Object.fromEntries(PATRON_KINDS.map((k) => [k, Math.round(clamp(o?.[k], 1, hi, dflt[k]))])) as Record<PatronKind, number>;
  return {
    loanDays: byKind(r.loanDays, d.loanDays, 365),
    maxLoans: byKind(r.maxLoans, d.maxLoans, 100),
    maxRenewals: Math.round(clamp(r.maxRenewals, 0, 20, d.maxRenewals)),
    fines: r.fines === true,
    finePerDay: Math.round(clamp(r.finePerDay, 0, 1000, d.finePerDay) * 100) / 100,
    fineCap: Math.round(clamp(r.fineCap, 0, 100000, d.fineCap) * 100) / 100,
    currency: typeof r.currency === "string" && /^[A-Z]{3}$/.test(r.currency) ? r.currency : d.currency,
    holdDays: Math.round(clamp(r.holdDays, 1, 60, d.holdDays)),
    roomDays: Math.round(clamp(r.roomDays, 1, 30, d.roomDays)),
  };
}

/** When a loan made at `from` for this kind of borrower is due: the end of the last day, as an ISO date-time. */
export function dueDate(from: Date, kind: PatronKind, rules: Rules): string {
  const d = new Date(from.getTime() + rules.loanDays[kind] * DAY);
  d.setUTCHours(23, 59, 59, 0);
  return d.toISOString();
}

/** Whole days late (0 when not late). */
export function daysOverdue(due: string, now: Date, returned?: string | null): number {
  const end = returned ? new Date(returned) : now;
  const late = end.getTime() - new Date(due).getTime();
  return late > 0 ? Math.ceil(late / DAY) : 0;
}

/** What a late loan costs under the rules (0 when the library charges no fines). */
export function fineFor(due: string, now: Date, rules: Rules, returned?: string | null): number {
  if (!rules.fines) return 0;
  return Math.min(rules.fineCap, Math.round(daysOverdue(due, now, returned) * rules.finePerDay * 100) / 100);
}

/** A barcode or card number as typed or scanned: letters, digits, dot, dash and underscore, 1 to 40 of them. */
export function cleanCode(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
  return /^[A-Za-z0-9._-]{1,40}$/.test(s) ? s : null;
}

export interface PatronInput { card: string; name: string; kind: PatronKind; email?: string | null; phone?: string | null; note?: string | null; blocked?: boolean; readerEmail?: string | null }

/** The borrower as sent from the desk, cleaned, or the reason it cannot be saved. */
export function readPatron(raw: any): { patron: PatronInput } | { error: string } {
  const card = cleanCode(raw?.card);
  if (!card) return { error: "The card number: letters and digits only, up to 40" };
  const name = typeof raw?.name === "string" ? raw.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 120) return { error: "The name is needed (up to 120 characters)" };
  const kind = PATRON_KINDS.includes(raw?.kind) ? raw.kind : "reader";
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const email = text(raw?.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "The email address is not valid" };
  const phone = text(raw?.phone, 40);
  if (phone && !/^[+0-9 ()\-]{3,40}$/.test(phone)) return { error: "The phone number: digits, spaces, + ( ) - only" };
  // The email of the borrower's reader account in the catalogue, to link the two (blank: no link).
  const readerEmail = text(raw?.readerEmail, 200)?.toLowerCase() || null;
  if (readerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(readerEmail)) return { error: "The reader account email is not valid" };
  return { patron: { card, name, kind, email, phone, note: text(raw?.note, 500), blocked: raw?.blocked === true, readerEmail } };
}

export interface FoundCopy {
  itemId: string;
  barcode: string;
  /** The copy's accession number (bf:AccessionNumber), or "". */
  accession: string;
  library: string;
  location: string;
  shelfMark: string;
  copyNumber: string;
  referenceOnly: boolean;
}

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
function textOf(v: any): string {
  for (const x of list(v)) {
    if (typeof x === "string" || typeof x === "number") return String(x).trim();
    if (x && typeof x === "object") {
      const inner = x["@value"] ?? x["rdfs:label"] ?? x["label"] ?? x["rdf:value"] ?? x["value"];
      const t = inner === undefined ? "" : textOf(inner);
      if (t) return t;
    }
  }
  return "";
}
const typed = (n: any, name: string) => list(n?.["@type"]).some((t) => typeof t === "string" && (t === `bf:${name}` || t === name || t.endsWith(`/${name}`)));

/** Every copy (bf:Item) in a record's document that has a barcode, as Moon's editor writes them (itemCopies.ts). */
export function copiesIn(document: any): FoundCopy[] {
  const nodes: any[] = [];
  const walk = (n: any, depth: number) => {
    if (!n || typeof n !== "object" || depth > 6) return;
    if (Array.isArray(n)) { n.forEach((x) => walk(x, depth + 1)); return; }
    if (typed(n, "Item")) nodes.push(n);
    for (const k of ["@graph", "bf:hasItem", "hasItem"]) if (n[k]) walk(n[k], depth + 1);
  };
  walk(document, 0);
  const seen = new Set<string>();
  return nodes.flatMap((n) => {
    const ids = list(n["bf:identifiedBy"] ?? n["identifiedBy"]);
    const bc = ids.find((i) => typed(i, "Barcode"));
    const barcode = bc ? textOf(bc) : textOf(n["bf:barcode"] ?? n["barcode"]);
    const acc = ids.find((i) => typed(i, "AccessionNumber"));
    if (!barcode || seen.has(barcode)) return [];
    seen.add(barcode);
    return [{
      itemId: String(n["@id"] || ""),
      barcode,
      accession: acc ? textOf(acc) : "",
      library: textOf(n["bf:heldBy"] ?? n["heldBy"]),
      location: textOf(n["bf:sublocation"] ?? n["sublocation"]),
      shelfMark: textOf(n["bf:shelfMark"] ?? n["shelfMark"]),
      copyNumber: textOf(n["bf:enumerationAndChronology"]).replace(/^c\.\s*/i, ""),
      referenceOnly: list(n["bf:usageAndAccessPolicy"] ?? n["usageAndAccessPolicy"]).some((p) => /reference|للاطلاع/i.test(textOf(p))),
    }];
  });
}

export interface PatronState { kind: PatronKind; blocked: boolean; openLoans: number; overdue: number; finesOwed: number }

/**
 * Why this borrower cannot take this copy now, or null when the loan can go ahead. A reading-room loan (inRoom) is
 * the only loan a reference-only copy has: used in the reading room, never taken home; it does not count against
 * the borrower's number of copies.
 */
export function checkoutProblem(p: PatronState, copy: { referenceOnly: boolean; onLoan: boolean; heldForOther: boolean }, rules: Rules, inRoom = false): string | null {
  if (copy.referenceOnly && !inRoom) return "This copy is for use in the reading room only: lend it for the reading room";
  if (copy.onLoan) return "This copy is already on loan; check it in first";
  if (copy.heldForOther) return "This copy is held for another borrower";
  if (p.blocked) return "This borrower is blocked";
  if (inRoom) return null;
  if (p.overdue > 0) return `This borrower has ${p.overdue} overdue ${p.overdue === 1 ? "loan" : "loans"}`;
  if (rules.fines && p.finesOwed > 0) return `This borrower owes ${p.finesOwed.toFixed(2)} ${rules.currency}`;
  if (p.openLoans >= rules.maxLoans[p.kind]) return `This borrower already has ${p.openLoans} copies out (the most for a ${p.kind})`;
  return null;
}

/** Why a loan cannot be renewed now, or null. */
export function renewProblem(loan: { due_at: string; renewals: number; in_room?: boolean }, rules: Rules, othersWaiting: number, now: Date): string | null {
  if (loan.in_room) return "A reading-room loan is not renewed: put it on the hold shelf for the reader instead";
  if (loan.renewals >= rules.maxRenewals) return `Renewed ${loan.renewals} times already (the most allowed)`;
  if (othersWaiting > 0) return "Another borrower is waiting for this book";
  if (daysOverdue(loan.due_at, now) > 0 && rules.fines) return "Overdue: return it and settle the fine first";
  return null;
}

/** A renewed loan's new due date: the loan period again, counted from today (never earlier than the old date). */
export function renewedDue(oldDue: string, kind: PatronKind, rules: Rules, now: Date): string {
  const next = dueDate(now, kind, rules);
  return next > oldDue ? next : oldDue;
}

/** When a copy put aside for a hold stops waiting. */
export function holdExpiry(readyAt: Date, rules: Rules): string {
  return dueDate(readyAt, "reader", { ...rules, loanDays: { ...rules.loanDays, reader: rules.holdDays } });
}

export type RoomState = "in-use" | "on-shelf";
/**
 * When a reading-room loan is next due (plan step H7, after FOLIO's "for use at location"): in use, at the end of
 * today; on the hold shelf for its reader, at the end of the last day it waits there (roomDays).
 */
export function roomDue(now: Date, state: RoomState, rules: Rules): string {
  const d = new Date(now.getTime() + (state === "on-shelf" ? rules.roomDays : 0) * DAY);
  d.setUTCHours(23, 59, 59, 0);
  return d.toISOString();
}

export interface PickSlip { holdId: number; placedAt: string; title: string; recordId: string; borrower: string; card: string; barcode: string; location: string; shelfMark: string }

/** Shelf marks in shelf order: numbers by value ("QA76.9" before "QA100"), letters as letters. */
export function shelfOrder(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

/**
 * Pick slips (plan step H9, after FOLIO's staff slips): for each hold still waiting, oldest first, one copy of the
 * book to fetch from the shelves: on no loan, not reference only, not already put aside for another hold, of this
 * library. Sorted the way staff walk the stacks: by location, then shelf mark.
 */
export function pickSlips(
  holds: Array<{ id: number; record_id: string; record_title?: string | null; placed_at: string; patron?: { name?: string; card?: string } | null }>,
  documents: Map<string, { title?: string; document: any }>,
  busy: Set<string>,
  library: string,
): PickSlip[] {
  const taken = new Set(busy);
  const slips: PickSlip[] = [];
  for (const h of [...holds].sort((a, b) => a.placed_at.localeCompare(b.placed_at))) {
    const rec = documents.get(h.record_id);
    if (!rec) continue;
    const copy = copiesIn(rec.document).find((c) => !taken.has(c.barcode) && !c.referenceOnly && (!c.library || c.library === library));
    if (!copy) continue;
    taken.add(copy.barcode);
    slips.push({
      holdId: h.id, placedAt: h.placed_at, title: h.record_title || rec.title || h.record_id, recordId: h.record_id,
      borrower: h.patron?.name || "", card: h.patron?.card || "", barcode: copy.barcode, location: copy.location, shelfMark: copy.shelfMark,
    });
  }
  return slips.sort((a, b) => shelfOrder(a.location, b.location) || shelfOrder(a.shelfMark, b.shelfMark));
}
