/**
 * Acquisitions (التزويد والاقتناء): vendors, funds with a budget, purchase orders, invoices, and subscriptions to
 * journals and databases with issue check-in. This is the pure part: what each kind of entry may hold, a fund's
 * spending, order numbers, late journal issues and subscriptions about to end. The routes are in
 * acquisitionsRoutes.tsx and the tables in the acquisitions migration.
 * No imports: the tests run it in Node.
 */

export type AcqKind = "vendors" | "funds" | "orders" | "invoices" | "subscriptions";
export const ACQ_KINDS: AcqKind[] = ["vendors", "funds", "orders", "invoices", "subscriptions"];

type FieldType = "text" | "longtext" | "number" | "int" | "date" | "url" | "email" | "currency" | "choice" | "ref" | "bool" | "ids";
interface FieldSpec { type: FieldType; required?: boolean; max?: number; min?: number; choices?: string[] }

/** What each kind of entry may hold (the table's columns that people fill in). */
export const SCHEMAS: Record<AcqKind, Record<string, FieldSpec>> = {
  vendors: {
    name: { type: "text", required: true, max: 160 },
    contact: { type: "text", max: 120 },
    email: { type: "email" },
    phone: { type: "text", max: 40 },
    website: { type: "url" },
    country: { type: "text", max: 80 },
    note: { type: "longtext", max: 1000 },
    active: { type: "bool" },
    /** Days this vendor usually takes to deliver (claims, H8); the library's default when empty. */
    lead_days: { type: "int", min: 1, max: 730 },
  },
  funds: {
    code: { type: "text", required: true, max: 30 },
    name: { type: "text", required: true, max: 120 },
    year: { type: "int", required: true, min: 1900, max: 2200 },
    budget: { type: "number", required: true, min: 0, max: 1e12 },
    currency: { type: "currency" },
    note: { type: "longtext", max: 1000 },
  },
  orders: {
    title: { type: "text", required: true, max: 300 },
    author: { type: "text", max: 200 },
    isbn: { type: "text", max: 40 },
    material: { type: "choice", choices: ["book", "journal", "manuscript", "map", "music", "audiovisual", "electronic", "other"] },
    vendor_id: { type: "ref" },
    fund_id: { type: "ref" },
    quantity: { type: "int", required: true, min: 1, max: 10000 },
    unit_price: { type: "number", min: 0, max: 1e9 },
    currency: { type: "currency" },
    /** When the order should arrive (claims, H8); else the order date and the vendor's lead time. */
    expected_at: { type: "date" },
    note: { type: "longtext", max: 1000 },
  },
  invoices: {
    number: { type: "text", required: true, max: 60 },
    vendor_id: { type: "ref", required: true },
    invoice_date: { type: "date", required: true },
    amount: { type: "number", required: true, min: 0, max: 1e12 },
    currency: { type: "currency" },
    order_ids: { type: "ids" },
    note: { type: "longtext", max: 1000 },
  },
  subscriptions: {
    kind: { type: "choice", required: true, choices: ["journal", "database"] },
    title: { type: "text", required: true, max: 300 },
    issn: { type: "text", max: 20 },
    vendor_id: { type: "ref" },
    fund_id: { type: "ref" },
    issues_per_year: { type: "int", min: 0, max: 366 },
    start_date: { type: "date", required: true },
    end_date: { type: "date", required: true },
    cost: { type: "number", min: 0, max: 1e12 },
    currency: { type: "currency" },
    access_url: { type: "url" },
    record_id: { type: "text", max: 120 },
    note: { type: "longtext", max: 1000 },
    active: { type: "bool" },
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An entry as sent from Studio, cleaned and checked, or the first reason it cannot be saved. */
export function readEntry(kind: AcqKind, raw: any): { row: Record<string, unknown> } | { error: string } {
  const schema = SCHEMAS[kind];
  const row: Record<string, unknown> = {};
  for (const [key, f] of Object.entries(schema)) {
    let v = raw?.[key];
    if (typeof v === "string") v = v.trim();
    const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
    if (empty) {
      if (f.required) return { error: `${key.replace(/_id$/, "").replace(/_/g, " ")} is needed` };
      row[key] = f.type === "bool" ? key === "active" : f.type === "ids" ? [] : null;
      continue;
    }
    const bad = (why: string) => ({ error: `${key.replace(/_/g, " ")}: ${why}` });
    switch (f.type) {
      case "text": case "longtext":
        if (typeof v !== "string") return bad("not text");
        row[key] = (v as string).replace(f.type === "text" ? /\s+/g : /[^\S\n]+/g, " ").slice(0, f.max || 300);
        break;
      case "number": case "int": {
        const n = Number(v);
        if (!Number.isFinite(n) || (f.type === "int" && !Number.isInteger(n))) return bad("not a number");
        if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) return bad(`between ${f.min} and ${f.max}`);
        row[key] = f.type === "number" ? Math.round(n * 100) / 100 : n;
        break;
      }
      case "date":
        if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) return bad("a date as YYYY-MM-DD");
        row[key] = v;
        break;
      case "url":
        if (typeof v !== "string" || !/^https?:\/\/[^\s]+$/i.test(v) || v.length > 500) return bad("an address starting http:// or https://");
        row[key] = v;
        break;
      case "email":
        if (typeof v !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 200) return bad("not an email address");
        row[key] = v;
        break;
      case "currency":
        if (typeof v !== "string" || !/^[A-Za-z]{3}$/.test(v)) return bad("a three-letter code such as IQD or USD");
        row[key] = (v as string).toUpperCase();
        break;
      case "choice":
        if (!f.choices!.includes(v as string)) return bad(`one of ${f.choices!.join(", ")}`);
        row[key] = v;
        break;
      case "ref":
        if (typeof v !== "string" || !UUID.test(v)) return bad("not one of the library's entries");
        row[key] = v;
        break;
      case "bool":
        row[key] = v === true || v === "true";
        break;
      case "ids": {
        const ids = (Array.isArray(v) ? v : String(v).split(/[\s,]+/)).map(Number).filter((n) => Number.isInteger(n) && n > 0);
        row[key] = [...new Set(ids)].slice(0, 200);
        break;
      }
    }
  }
  if (kind === "subscriptions" && String(row.end_date) < String(row.start_date)) return { error: "end date: after the start date" };
  return { row };
}

/** The next purchase order number for a year: PO-2026-0001, PO-2026-0002 … (from the numbers already used). */
export function nextOrderNumber(year: number, used: string[]): string {
  const prefix = `PO-${year}-`;
  const top = used.filter((u) => u?.startsWith(prefix)).map((u) => Number(u.slice(prefix.length))).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(top + 1).padStart(4, "0")}`;
}

export const orderTotal = (o: { quantity?: number | null; unit_price?: number | null }) =>
  Math.round((Number(o.quantity) || 0) * (Number(o.unit_price) || 0) * 100) / 100;

export interface FundStatus { committed: number; spent: number; remaining: number; usedShare: number }

/**
 * Where a fund stands: committed = ordered but not yet received; spent = received orders and the subscriptions it
 * pays; remaining = budget less both. Cancelled orders count for nothing.
 */
export function fundStatus(
  fund: { id: string; budget: number },
  orders: Array<{ fund_id?: string | null; status: string; quantity?: number; unit_price?: number | null }>,
  subscriptions: Array<{ fund_id?: string | null; cost?: number | null }>,
): FundStatus {
  const mine = orders.filter((o) => o.fund_id === fund.id);
  const committed = mine.filter((o) => o.status === "ordered").reduce((s, o) => s + orderTotal(o), 0);
  const spent = mine.filter((o) => o.status === "received").reduce((s, o) => s + orderTotal(o), 0)
    + subscriptions.filter((x) => x.fund_id === fund.id).reduce((s, x) => s + (Number(x.cost) || 0), 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const budget = Number(fund.budget) || 0;
  return { committed: r2(committed), spent: r2(spent), remaining: r2(budget - committed - spent), usedShare: budget > 0 ? r2((committed + spent) / budget) : 0 };
}

const DAY = 86_400_000;

/**
 * Journals whose next issue is late: no issue received within the usual gap (a year divided by the issues per
 * year) plus a grace of a fortnight, counted from the last issue received, or from the start of the subscription.
 */
export function lateIssues(
  subs: Array<{ id: number; kind: string; title: string; active?: boolean; issues_per_year?: number | null; start_date: string; end_date: string }>,
  lastReceived: Map<number, string>,
  now: Date,
  graceDays = 14,
): Array<{ id: number; title: string; expected: string; daysLate: number }> {
  const today = now.getTime();
  return subs.flatMap((s) => {
    if (s.kind !== "journal" || s.active === false || !s.issues_per_year) return [];
    if (Date.parse(s.start_date) > today || Date.parse(s.end_date) + DAY < today) return [];
    const from = Date.parse(lastReceived.get(s.id) || s.start_date);
    const expected = from + (365 / s.issues_per_year) * DAY;
    const late = Math.floor((today - expected - graceDays * DAY) / DAY);
    return late > 0 ? [{ id: s.id, title: s.title, expected: new Date(expected).toISOString().slice(0, 10), daysLate: late + graceDays }] : [];
  }).sort((a, b) => b.daysLate - a.daysLate);
}

/** Active subscriptions that end within the next `days` days (time to renew or cancel). */
export function endingSoon<T extends { active?: boolean; end_date: string }>(subs: T[], now: Date, days = 60): T[] {
  const t = now.getTime();
  return subs.filter((s) => s.active !== false && Date.parse(s.end_date) + DAY >= t && Date.parse(s.end_date) - t <= days * DAY)
    .sort((a, b) => a.end_date.localeCompare(b.end_date));
}

// ─── Received orders become copies ───────────────────────────

export interface ReceiptInput { barcodes: string[]; location: string; shelfMark: string; referenceOnly: boolean; count: number }

/**
 * What staff send to add a received order's copies to its record: how many (at most the copies ordered and not
 * yet added), their barcodes (optional, one per copy, each once), where they go on the shelves. Or why not.
 */
export function readReceipt(raw: any, order: { quantity: number; copies_added?: number | null }): { input: ReceiptInput } | { error: string } {
  const left = Math.max(0, (Number(order.quantity) || 0) - (Number(order.copies_added) || 0));
  if (!left) return { error: "Every copy of this order is already in the record" };
  const barcodes = (Array.isArray(raw?.barcodes) ? raw.barcodes : String(raw?.barcodes || "").split(/[\s,;]+/))
    .map((b: unknown) => (typeof b === "string" ? b.trim() : typeof b === "number" ? String(b) : ""))
    .filter(Boolean);
  const bad = barcodes.find((b: string) => !/^[A-Za-z0-9._-]{1,40}$/.test(b));
  if (bad) return { error: `Not a barcode: ${bad.slice(0, 40)}` };
  if (new Set(barcodes).size !== barcodes.length) return { error: "The same barcode is typed twice" };
  const asked = raw?.count === undefined || raw?.count === null || raw?.count === "" ? Math.max(left, barcodes.length) : Number(raw.count);
  if (!Number.isInteger(asked) || asked < 1) return { error: "How many copies: at least 1" };
  if (asked > left) return { error: `Only ${left} ${left === 1 ? "copy is" : "copies are"} left to add from this order` };
  if (barcodes.length > asked) return { error: `${barcodes.length} barcodes for ${asked} ${asked === 1 ? "copy" : "copies"}` };
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
  return { input: { barcodes, location: text(raw?.location, 120), shelfMark: text(raw?.shelfMark, 80), referenceOnly: raw?.referenceOnly === true, count: asked } };
}

/** The first Instance of a record's document (the edition the copies belong to), or null. */
export function firstInstanceId(document: any): string | null {
  const graph: any[] = Array.isArray(document?.["@graph"]) ? document["@graph"] : [];
  const inst = graph.find((n) => [].concat(n?.["@type"] || []).some((t: any) => typeof t === "string" && /(^|[:/])Instance$/.test(t)));
  return inst?.["@id"] ? String(inst["@id"]) : null;
}

/** The copies as rows for copiesImport.withCopies: the library, the order's number in the note, numbered on. */
/** The copies an order adds, one row each; `accessions` (from the library's accession sequence) go on them in turn. */
export function receiptRows(input: ReceiptInput, order: { number: string }, library: string, firstCopyNumber: number, accessions: string[] = []) {
  return Array.from({ length: input.count }, (_, i) => ({
    line: i + 1, record: "", isbn: "", library, location: input.location, shelfMark: input.shelfMark,
    barcode: input.barcodes[i] || "", accession: accessions[i] || "", copyNumber: String(firstCopyNumber + i), referenceOnly: input.referenceOnly,
    note: `Order ${order.number}`,
  }));
}

// ─── Claiming late orders (plan step H8, after FOLIO's Claiming app) ───

/** Days a vendor takes when neither the order nor the vendor says; and days between two claims of one order. */
export const DEFAULT_LEAD_DAYS = 60;
export const CLAIM_AGAIN_DAYS = 30;

export interface LateOrder {
  id: number; number: string; title: string; author?: string | null; isbn?: string | null; quantity: number;
  ordered_at: string; expected: string; daysLate: number; claims: number; lastClaim: string | null;
  /** Never claimed, or the last claim is CLAIM_AGAIN_DAYS old. */
  claimNow: boolean;
}
export interface VendorClaims { vendor: { id: string | null; name: string; email?: string | null; contact?: string | null }; orders: LateOrder[] }

/**
 * Orders not yet received after their expected date (the one on the order, else the order date and the vendor's
 * lead time), grouped by vendor, the latest first; with how often and when each was claimed.
 */
export function lateOrders(
  orders: Array<{ id: number; number: string; title: string; author?: string | null; isbn?: string | null; quantity: number; status: string; ordered_at: string; expected_at?: string | null; vendor_id?: string | null }>,
  vendors: Array<{ id: string; name: string; email?: string | null; contact?: string | null; lead_days?: number | null }>,
  claims: Array<{ order_id: number; claimed_at: string }>,
  now: Date,
): VendorClaims[] {
  const byVendor = new Map(vendors.map((v) => [v.id, v]));
  const claimsOf = new Map<number, string[]>();
  for (const c of claims) claimsOf.set(c.order_id, [...(claimsOf.get(c.order_id) || []), c.claimed_at].sort());
  const groups = new Map<string, VendorClaims>();
  for (const o of orders) {
    if (o.status !== "ordered") continue;
    const v = o.vendor_id ? byVendor.get(o.vendor_id) : undefined;
    const expected = o.expected_at
      ? o.expected_at.slice(0, 10)
      : new Date(new Date(o.ordered_at).getTime() + (v?.lead_days || DEFAULT_LEAD_DAYS) * DAY).toISOString().slice(0, 10);
    const daysLate = Math.floor((now.getTime() - new Date(`${expected}T23:59:59Z`).getTime()) / DAY);
    if (daysLate < 1) continue;
    const done = claimsOf.get(o.id) || [];
    const last = done[done.length - 1] || null;
    const claimNow = !last || now.getTime() - new Date(last).getTime() >= CLAIM_AGAIN_DAYS * DAY;
    const key = v?.id || "";
    const g = groups.get(key) || { vendor: v ? { id: v.id, name: v.name, email: v.email, contact: v.contact } : { id: null, name: "" }, orders: [] };
    g.orders.push({ id: o.id, number: o.number, title: o.title, author: o.author, isbn: o.isbn, quantity: o.quantity, ordered_at: o.ordered_at, expected, daysLate, claims: done.length, lastClaim: last, claimNow });
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, orders: g.orders.sort((a, b) => b.daysLate - a.daysLate) }))
    .sort((a, b) => b.orders[0].daysLate - a.orders[0].daysLate);
}
