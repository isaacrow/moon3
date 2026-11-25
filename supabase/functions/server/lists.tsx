/**
 * Lists (plan step H1, after FOLIO's Lists app): staff build a list of books, copies, loans, borrowers, holds,
 * orders, invoices, subscriptions, vendors or funds from conditions on their fields, save it, refresh it and export
 * it as CSV with readable headers. listsRoutes.tsx loads the library's rows; this file holds the fields, reads a
 * query, runs it on rows and writes the CSV. Pure: no imports but text folding, so the tests and the Studio screen
 * use the same code.
 *
 * A condition is a field, an operator and a value: is, contains, starts with, any of, is empty, before/after (dates),
 * more/less than (numbers); any condition can be turned around with NOT. A list matches all of its conditions, or
 * any of them. Text is compared the way the catalogue search compares it (fold: case, accents, Arabic letter forms).
 * A date can be a day (2026-11-25) or a day counted from today (today, today-30, today+60), so a saved list stays
 * true as days pass. READY_LISTS are the lists every library starts with (plan step H2).
 */
import { fold } from "./searchCore.tsx";

export type FieldType = "text" | "number" | "date" | "bool" | "choice";
export interface ListField { key: string; en: string; ar: string; type: FieldType; choices?: Array<{ v: string; en: string; ar: string }> }
export type EntityId = "books" | "people" | "copies" | "loans" | "borrowers" | "holds" | "orders" | "invoices" | "subscriptions" | "vendors" | "funds";
export interface ListEntity { id: EntityId; en: string; ar: string; fields: ListField[]; columns: string[] }

const t = (key: string, en: string, ar: string, type: FieldType = "text", choices?: ListField["choices"]): ListField => ({ key, en, ar, type, ...(choices ? { choices } : {}) });
const c = (v: string, en: string, ar: string) => ({ v, en, ar });

export const ENTITIES: Record<EntityId, ListEntity> = {
  books: {
    id: "books", en: "Books (records)", ar: "الكتب (التسجيلات)",
    fields: [
      t("id", "Record number", "رقم التسجيلة"), t("title", "Title", "العنوان"),
      t("status", "Status", "الحالة", "choice", [c("complete", "Published", "منشورة"), c("pending-review", "Waiting for review", "بانتظار المراجعة"), c("needs-review", "Returned for changes", "معادة للتعديل")]),
      t("cataloger", "Cataloguer", "المفهرس"), t("assigned_to", "Reviewer", "المراجع"),
      t("copies", "Copies", "عدد النسخ", "number"), t("subjects", "Subjects", "عدد الموضوعات", "number"),
      t("created_at", "Created", "تاريخ الإنشاء", "date"), t("updated_at", "Last changed", "آخر تعديل", "date"), t("approved_at", "Published on", "تاريخ النشر", "date"),
    ],
    columns: ["id", "title", "status", "cataloger", "copies", "updated_at"],
  },
  people: {
    id: "people", en: "People and bodies (authority file)", ar: "الأشخاص والهيئات (الملف الاستنادي)",
    fields: [
      t("id", "Entity number", "رقم الكيان"), t("name", "Name", "الاسم"), t("variants", "Other names", "الأسماء الأخرى"),
      t("has_arabic", "Has a name in Arabic script", "له اسم بالحرف العربي", "bool"), t("has_latin", "Has a name in Latin script", "له اسم بالحرف اللاتيني", "bool"),
      t("links", "Links (LC, VIAF, Wikidata …)", "الروابط (LC وVIAF وويكي بيانات …)", "number"),
      t("created_by", "Made by", "أنشأه"), t("created_at", "Created", "تاريخ الإنشاء", "date"), t("updated_at", "Last changed", "آخر تعديل", "date"),
    ],
    columns: ["name", "variants", "has_arabic", "has_latin", "links"],
  },
  copies: {
    id: "copies", en: "Copies", ar: "النسخ",
    fields: [
      t("barcode", "Barcode", "الباركود"), t("record_id", "Record number", "رقم التسجيلة"), t("title", "Title", "العنوان"),
      t("location", "Location", "المكان"), t("shelf_mark", "Shelf mark", "رقم الرف"), t("copy_number", "Copy number", "رقم النسخة"),
      t("reference_only", "Reference only", "للاطلاع فقط", "bool"), t("on_loan", "On loan now", "معارة الآن", "bool"),
    ],
    columns: ["barcode", "title", "location", "shelf_mark", "on_loan"],
  },
  loans: {
    id: "loans", en: "Loans", ar: "الإعارات",
    fields: [
      t("barcode", "Barcode", "الباركود"), t("record_id", "Record number", "رقم التسجيلة"), t("record_title", "Title", "العنوان"),
      t("borrower_card", "Borrower card", "بطاقة المستفيد"), t("borrower_name", "Borrower", "المستفيد"),
      t("patron_kind", "Kind of borrower", "نوع المستفيد", "choice", [c("reader", "Reader", "قارئ"), c("student", "Student", "طالب"), c("staff", "Staff", "موظف")]),
      t("loaned_at", "Loaned", "تاريخ الإعارة", "date"), t("due_at", "Due", "تاريخ الاستحقاق", "date"), t("returned_at", "Returned", "تاريخ الإرجاع", "date"),
      t("out", "Still out", "لم تُرجع", "bool"), t("overdue", "Overdue", "متأخرة", "bool"),
      t("renewals", "Renewals", "مرات التجديد", "number"), t("fine", "Fine", "الغرامة", "number"), t("fine_settled", "Fine settled", "سُددت الغرامة", "bool"),
      t("loaned_by", "Loaned by", "أعارها"),
    ],
    columns: ["barcode", "record_title", "borrower_name", "loaned_at", "due_at", "overdue"],
  },
  borrowers: {
    id: "borrowers", en: "Borrowers", ar: "المستفيدون",
    fields: [
      t("card", "Card number", "رقم البطاقة"), t("name", "Name", "الاسم"),
      t("kind", "Kind", "النوع", "choice", [c("reader", "Reader", "قارئ"), c("student", "Student", "طالب"), c("staff", "Staff", "موظف")]),
      t("email", "Email", "البريد"), t("phone", "Phone", "الهاتف"), t("blocked", "Blocked", "موقوف", "bool"), t("note", "Note", "ملاحظة"),
      t("created_at", "Registered", "تاريخ التسجيل", "date"),
    ],
    columns: ["card", "name", "kind", "blocked", "created_at"],
  },
  holds: {
    id: "holds", en: "Holds", ar: "الحجوزات",
    fields: [
      t("record_id", "Record number", "رقم التسجيلة"), t("record_title", "Title", "العنوان"),
      t("borrower_card", "Borrower card", "بطاقة المستفيد"), t("borrower_name", "Borrower", "المستفيد"),
      t("status", "Status", "الحالة", "choice", [c("waiting", "Waiting", "بالانتظار"), c("ready", "On the hold shelf", "على رف الحجز"), c("done", "Collected", "استُلم"), c("cancelled", "Cancelled", "أُلغي")]),
      t("barcode", "Copy barcode", "باركود النسخة"), t("placed_at", "Placed", "تاريخ الحجز", "date"), t("expires_at", "Expires", "ينتهي", "date"),
    ],
    columns: ["record_title", "borrower_name", "status", "placed_at"],
  },
  orders: {
    id: "orders", en: "Purchase orders", ar: "أوامر الشراء",
    fields: [
      t("number", "Order number", "رقم الطلب"), t("title", "Title", "العنوان"), t("author", "Author", "المؤلف"), t("isbn", "ISBN / ISSN", "ISBN / ISSN"),
      t("material", "Material", "نوع المادة"), t("vendor", "Vendor", "المورد"), t("fund", "Fund", "الصندوق"),
      t("quantity", "Copies", "عدد النسخ", "number"), t("unit_price", "Price per copy", "سعر النسخة", "number"), t("total", "Total", "المجموع", "number"), t("currency", "Currency", "العملة"),
      t("status", "Status", "الحالة", "choice", [c("ordered", "Ordered", "مطلوب"), c("received", "Received", "وصل"), c("cancelled", "Cancelled", "ملغى")]),
      t("ordered_at", "Ordered", "تاريخ الطلب", "date"), t("received_at", "Received", "تاريخ الوصول", "date"),
      t("record_id", "Record number", "رقم التسجيلة"), t("copies_added", "Copies added", "النسخ المضافة", "number"),
    ],
    columns: ["number", "title", "vendor", "fund", "quantity", "total", "status", "ordered_at"],
  },
  invoices: {
    id: "invoices", en: "Invoices", ar: "الفواتير",
    fields: [
      t("number", "Invoice number", "رقم الفاتورة"), t("vendor", "Vendor", "المورد"), t("invoice_date", "Date", "التاريخ", "date"),
      t("amount", "Amount", "المبلغ", "number"), t("currency", "Currency", "العملة"),
      t("status", "Status", "الحالة", "choice", [c("unpaid", "Unpaid", "لم تُدفع"), c("paid", "Paid", "مدفوعة")]),
      t("paid_at", "Paid on", "تاريخ الدفع", "date"), t("orders", "Purchase orders", "أوامر الشراء", "number"),
    ],
    columns: ["number", "vendor", "invoice_date", "amount", "currency", "status"],
  },
  subscriptions: {
    id: "subscriptions", en: "Subscriptions", ar: "الاشتراكات",
    fields: [
      t("kind", "Kind", "النوع", "choice", [c("journal", "Journal", "دورية"), c("database", "Database", "قاعدة بيانات")]),
      t("title", "Title", "العنوان"), t("issn", "ISSN", "ISSN"), t("vendor", "Vendor", "المورد"), t("fund", "Fund", "الصندوق"),
      t("start_date", "Starts", "يبدأ", "date"), t("end_date", "Ends", "ينتهي", "date"),
      t("cost", "Cost", "التكلفة", "number"), t("currency", "Currency", "العملة"), t("active", "Active", "فعّال", "bool"), t("access_url", "Access link", "رابط الدخول"),
    ],
    columns: ["kind", "title", "vendor", "end_date", "cost", "active"],
  },
  vendors: {
    id: "vendors", en: "Vendors", ar: "الموردون",
    fields: [
      t("name", "Name", "الاسم"), t("contact", "Contact person", "الشخص المسؤول"), t("email", "Email", "البريد"), t("phone", "Phone", "الهاتف"),
      t("website", "Website", "الموقع"), t("country", "Country", "البلد"), t("active", "Currently used", "نتعامل معه حاليًا", "bool"),
    ],
    columns: ["name", "contact", "email", "country", "active"],
  },
  funds: {
    id: "funds", en: "Funds", ar: "الصناديق",
    fields: [
      t("code", "Code", "الرمز"), t("name", "Name", "الاسم"), t("year", "Year", "السنة", "number"),
      t("budget", "Budget", "الميزانية", "number"), t("currency", "Currency", "العملة"),
    ],
    columns: ["code", "name", "year", "budget", "currency"],
  },
};
export const ENTITY_IDS = Object.keys(ENTITIES) as EntityId[];

export type Op = "is" | "contains" | "starts" | "anyOf" | "empty" | "before" | "after" | "more" | "less";
export const OPS_BY_TYPE: Record<FieldType, Op[]> = {
  text: ["contains", "is", "starts", "anyOf", "empty"],
  choice: ["is", "anyOf", "empty"],
  number: ["is", "more", "less", "empty"],
  date: ["is", "before", "after", "empty"],
  bool: ["is"],
};
export const OP_NAMES: Record<Op, { en: string; ar: string }> = {
  is: { en: "is", ar: "يساوي" }, contains: { en: "contains", ar: "يحتوي" }, starts: { en: "starts with", ar: "يبدأ بـ" },
  anyOf: { en: "is any of", ar: "أيٌّ من" }, empty: { en: "is empty", ar: "فارغ" },
  before: { en: "is before", ar: "قبل" }, after: { en: "is after", ar: "بعد" }, more: { en: "is more than", ar: "أكبر من" }, less: { en: "is less than", ar: "أصغر من" },
};

export interface Condition { field: string; op: Op; value?: string | string[]; not?: boolean }
export interface ListQuery { entity: EntityId; match: "all" | "any"; conditions: Condition[]; columns: string[]; sort?: { field: string; desc?: boolean } }

/** Reads a query sent by the Studio screen (or saved earlier): every field and operator must be known. */
export function readQuery(input: any): { query: ListQuery } | { error: string } {
  const entity = ENTITIES[input?.entity as EntityId];
  if (!entity) return { error: "Choose what to list" };
  const field = (k: string) => entity.fields.find((f) => f.key === k);
  const raw = Array.isArray(input.conditions) ? input.conditions : [];
  if (raw.length > 20) return { error: "A list has at most 20 conditions" };
  const conditions: Condition[] = [];
  for (const x of raw) {
    const f = field(String(x?.field || ""));
    if (!f) return { error: `Unknown field: ${x?.field}` };
    const op = String(x?.op || "") as Op;
    if (!OPS_BY_TYPE[f.type].includes(op)) return { error: `“${OP_NAMES[op]?.en || op}” does not apply to ${f.en}` };
    let value: Condition["value"];
    if (op === "anyOf") {
      const vs = (Array.isArray(x.value) ? x.value : String(x.value ?? "").split(/[,،\n]/)).map((v: unknown) => String(v).trim()).filter(Boolean).slice(0, 200);
      if (!vs.length) return { error: `Give at least one value for ${f.en}` };
      value = vs;
    } else if (op !== "empty") {
      value = String(x.value ?? "").trim().slice(0, 200);
      if (!value) return { error: `Give a value for ${f.en}` };
      if (f.type === "number" && !Number.isFinite(Number(value))) return { error: `${f.en} takes a number` };
      if (f.type === "date" && !/^(\d{4}-\d{2}-\d{2}|today([+-]\d{1,4})?)$/.test(value)) return { error: `${f.en} takes a date (YYYY-MM-DD, or today, today-30, today+60)` };
      if (f.type === "bool" && !["true", "false"].includes(value)) return { error: `${f.en} is yes or no` };
    }
    conditions.push({ field: f.key, op, ...(value !== undefined ? { value } : {}), ...(x.not ? { not: true } : {}) });
  }
  const columns = (Array.isArray(input.columns) ? input.columns : []).map(String).filter((k: string) => field(k));
  const sortField = input.sort?.field && field(String(input.sort.field)) ? String(input.sort.field) : undefined;
  return {
    query: {
      entity: entity.id,
      match: input.match === "any" ? "any" : "all",
      conditions,
      columns: columns.length ? [...new Set<string>(columns)] : entity.columns,
      ...(sortField ? { sort: { field: sortField, ...(input.sort.desc ? { desc: true } : {}) } } : {}),
    },
  };
}

export type Row = Record<string, unknown>;
const isEmpty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && !v.length);
const day = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : "");

/** A condition's date as a day: itself, or counted from today (today-30 is thirty days ago). */
export function dayOf(value: string, now: Date): string {
  const m = value.match(/^today([+-]\d+)?$/);
  if (!m) return value;
  return new Date(now.getTime() + Number(m[1] || 0) * 86_400_000).toISOString().slice(0, 10);
}

function holds(row: Row, cond: Condition, type: FieldType, now: Date): boolean {
  const v = row[cond.field];
  if (cond.op === "empty") return isEmpty(v);
  if (isEmpty(v)) return false;
  const want = cond.value;
  switch (type) {
    case "number": {
      const n = Number(v), w = Number(want);
      return cond.op === "is" ? n === w : cond.op === "more" ? n > w : n < w;
    }
    case "date": {
      const d = day(v), w = dayOf(String(want), now);
      return cond.op === "is" ? d === w : cond.op === "before" ? d < w : d > w;
    }
    case "bool":
      return String(!!v) === want;
    default: {
      const text = fold(String(v));
      const raw = String(v).trim().toLowerCase();
      const one = (w: string) => {
        const fw = fold(w);
        if (cond.op === "contains") return !!fw && text.includes(fw);
        if (cond.op === "starts") return !!fw && text.startsWith(fw);
        return text === fw || raw === w.trim().toLowerCase();
      };
      return cond.op === "anyOf" ? (want as string[]).some(one) : one(String(want));
    }
  }
}

/** The rows the query keeps, sorted. */
export function runQuery(rows: Row[], q: ListQuery, now = new Date()): Row[] {
  const types = new Map(ENTITIES[q.entity].fields.map((f) => [f.key, f.type]));
  const test = (r: Row, cond: Condition) => holds(r, cond, types.get(cond.field) || "text", now) !== !!cond.not;
  const kept = q.conditions.length
    ? rows.filter((r) => (q.match === "any" ? q.conditions.some((x) => test(r, x)) : q.conditions.every((x) => test(r, x))))
    : rows.slice();
  if (q.sort) {
    const { field, desc } = q.sort;
    const type = types.get(field);
    kept.sort((a, b) => {
      const x = a[field], y = b[field];
      if (isEmpty(x) || isEmpty(y)) return isEmpty(x) === isEmpty(y) ? 0 : isEmpty(x) ? 1 : -1; // empty last
      const d = type === "number" ? Number(x) - Number(y) : String(x).localeCompare(String(y), "ar");
      return desc ? -d : d;
    });
  }
  return kept;
}

/** A value as people read it in a table or a spreadsheet. */
export function shown(row: Row, f: ListField, isAr = false): string {
  const v = row[f.key];
  if (isEmpty(v)) return "";
  if (f.type === "bool") return v ? (isAr ? "نعم" : "Yes") : (isAr ? "لا" : "No");
  if (f.type === "date") return day(v);
  if (f.type === "choice") { const ch = f.choices?.find((x) => x.v === v); return ch ? (isAr ? ch.ar : ch.en) : String(v); }
  return String(v);
}

/** CSV with headers people can read (in English or Arabic), quoted where needed; a BOM so Excel reads Arabic. */
export function toCsv(rows: Row[], q: ListQuery, isAr = false): string {
  const fields = q.columns.map((k) => ENTITIES[q.entity].fields.find((f) => f.key === k)!).filter(Boolean);
  const cell = (s: string) => {
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s; // a spreadsheet would run a cell starting with = as a formula
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [fields.map((f) => cell(isAr ? f.ar : f.en)).join(",")];
  for (const r of rows) lines.push(fields.map((f) => cell(shown(r, f, isAr))).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** A list every library has from the start; opened like a saved one, and saved under a name to change it. */
export interface ReadyList { id: string; en: string; ar: string; noteEn: string; noteAr: string; query: ListQuery }
const ready = (id: string, en: string, ar: string, noteEn: string, noteAr: string, q: Omit<ListQuery, "columns"> & { columns?: string[] }): ReadyList =>
  ({ id, en, ar, noteEn, noteAr, query: { ...q, columns: q.columns || ENTITIES[q.entity].columns } });

export const READY_LISTS: ReadyList[] = [
  ready("overdue", "Overdue loans", "الإعارات المتأخرة", "Copies out past their due date, oldest first, with who has them",
    "النسخ المعارة بعد موعد إرجاعها، الأقدم أولًا، ومن معه كل منها",
    { entity: "loans", match: "all", conditions: [{ field: "overdue", op: "is", value: "true" }], columns: ["barcode", "record_title", "borrower_card", "borrower_name", "due_at", "renewals"], sort: { field: "due_at" } }),
  ready("hold-shelf", "Hold shelf to clear", "رف الحجز للتفريغ", "Copies on the hold shelf whose collection time has run out",
    "نسخ على رف الحجز انتهت مدة استلامها",
    { entity: "holds", match: "all", conditions: [{ field: "status", op: "is", value: "ready" }, { field: "expires_at", op: "before", value: "today" }], columns: ["barcode", "record_title", "borrower_name", "borrower_card", "expires_at"], sort: { field: "expires_at" } }),
  ready("orders-open", "Orders not received", "طلبات لم تصل", "Purchase orders still waiting, oldest first",
    "أوامر الشراء التي ما زالت بالانتظار، الأقدم أولًا",
    { entity: "orders", match: "all", conditions: [{ field: "status", op: "is", value: "ordered" }], columns: ["number", "title", "vendor", "fund", "quantity", "total", "ordered_at"], sort: { field: "ordered_at" } }),
  ready("subs-ending", "Subscriptions ending", "اشتراكات تنتهي", "Active subscriptions ending within two months",
    "الاشتراكات الفعّالة التي تنتهي خلال شهرين",
    { entity: "subscriptions", match: "all", conditions: [{ field: "active", op: "is", value: "true" }, { field: "end_date", op: "before", value: "today+61" }], columns: ["kind", "title", "vendor", "end_date", "cost", "currency"], sort: { field: "end_date" } }),
  ready("no-subjects", "Books without subjects", "كتب بلا موضوعات", "Records with no subject, so readers cannot find them by topic",
    "تسجيلات بلا موضوع، فلا يجدها القرّاء بالموضوع",
    { entity: "books", match: "all", conditions: [{ field: "subjects", op: "is", value: "0" }], columns: ["id", "title", "status", "cataloger", "updated_at"], sort: { field: "updated_at", desc: true } }),
  ready("one-script", "People without both scripts", "أشخاص بلا الكتابتين", "Names in the authority file missing an Arabic-script or a Latin-script form",
    "أسماء في الملف الاستنادي ينقصها شكل بالحرف العربي أو بالحرف اللاتيني",
    { entity: "people", match: "any", conditions: [{ field: "has_arabic", op: "is", value: "false" }, { field: "has_latin", op: "is", value: "false" }], sort: { field: "name" } }),
];

const asList = (v: unknown): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const typed = (n: any, name: string) => asList(n?.["@type"]).some((t) => typeof t === "string" && (t === `bf:${name}` || t === name || t.endsWith(`/${name}`)));

/** How many subjects a record's Works have (bf:subject), however the document nests them. */
export function subjectsIn(document: any): number {
  const nodes = Array.isArray(document?.["@graph"]) ? document["@graph"] : [document];
  return nodes.filter((n: any) => n && !typed(n, "Instance") && !typed(n, "Item"))
    .reduce((sum: number, n: any) => sum + asList(n?.["bf:subject"] ?? n?.["subject"]).filter((s) => s && (typeof s === "string" || Object.keys(s).length)).length, 0);
}

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LATIN = /[A-Za-zÀ-ɏḀ-ỿ]/;
/** Which scripts a name and its other forms are written in. */
export function scriptsOf(names: Array<string | null | undefined>): { has_arabic: boolean; has_latin: boolean } {
  const all = names.filter((n): n is string => typeof n === "string");
  return { has_arabic: all.some((n) => ARABIC.test(n)), has_latin: all.some((n) => LATIN.test(n)) };
}
