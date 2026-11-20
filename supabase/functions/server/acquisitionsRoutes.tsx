/**
 * Acquisitions routes (acquisitions.tsx has the checks; the tables are in the acquisitions migration).
 * Library staff only: the Super Admin, reviewers and cataloguers; funds and budgets are set by a reviewer or the
 * Super Admin. Each library sees only its own entries (the library is the account's institution).
 *
 *   GET    /acq/summary                     numbers for the Acquisitions page, late issues, subscriptions ending
 *   GET    /acq/:kind  POST /acq/:kind      vendors | funds | orders | invoices | subscriptions
 *   PUT    /acq/:kind/:id  DELETE /acq/:kind/:id
 *   POST   /acq/orders/:id/receive {recordId?}   POST /acq/orders/:id/cancel
 *   POST   /acq/invoices/:id/pay
 *   GET    /acq/issues?subscription=ID      POST /acq/issues {subscriptionId, label, receivedOn?}
 */
import { Hono } from "npm:hono";
import { getClient } from "./db.tsx";
import { getSession, libraryOf } from "./accountRoutes.tsx";
import { ACQ_KINDS, readEntry, nextOrderNumber, fundStatus, lateIssues, endingSoon, type AcqKind } from "./acquisitions.tsx";

const acquisitionsRoutes = new Hono();
const P = "/acq";
const sb = (): any => getClient();
const TABLE: Record<AcqKind, string> = {
  vendors: "acq_vendors", funds: "acq_funds", orders: "acq_orders", invoices: "acq_invoices", subscriptions: "acq_subscriptions",
};
const ORDER_BY: Record<AcqKind, [string, boolean]> = {
  vendors: ["name", true], funds: ["year", false], orders: ["ordered_at", false], invoices: ["invoice_date", false], subscriptions: ["end_date", true],
};

interface Staff { username: string; role: string; library: string }
async function staffOf(c: any): Promise<Staff | null> {
  const s = await getSession(c);
  if (!s || !["admin", "reviewer", "cataloger"].includes(s.role)) return null;
  return { username: s.username, role: s.role, library: await libraryOf(s.username) };
}
const denied = (c: any) => c.json({ error: "Library staff only (cataloguers, reviewers and the Super Admin)" }, 403);
const failed = (c: any, what: string, e: any) => {
  const msg = e?.message || String(e);
  console.error(`[acquisitions] ${what}:`, msg);
  if (/duplicate|unique/i.test(msg)) return c.json({ error: "There is already an entry with this number or code" }, 409);
  if (/foreign key|violates/i.test(msg)) return c.json({ error: "Other entries still use this one; make it inactive instead" }, 409);
  return c.json({ error: `${what} failed` }, 500);
};
const kindOf = (k: string): AcqKind | null => (ACQ_KINDS.includes(k as AcqKind) ? (k as AcqKind) : null);
const canBudget = (st: Staff) => st.role !== "cataloger";

/** Vendors and funds named on an entry must be this library's own. */
async function refsProblem(row: Record<string, unknown>, library: string): Promise<string | null> {
  for (const [key, table] of [["vendor_id", "acq_vendors"], ["fund_id", "acq_funds"]] as const) {
    const id = row[key];
    if (!id) continue;
    const { data } = await sb().from(table).select("id").eq("id", id).eq("library", library).maybeSingle();
    if (!data) return `${key === "vendor_id" ? "The vendor" : "The fund"} is not one of this library's`;
  }
  return null;
}

acquisitionsRoutes.get(`${P}/summary`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  try {
    const now = new Date();
    const [orders, subs, funds, invoices] = await Promise.all([
      sb().from("acq_orders").select("id, status, fund_id, quantity, unit_price").eq("library", st.library),
      sb().from("acq_subscriptions").select("id, kind, title, active, issues_per_year, start_date, end_date, fund_id, cost").eq("library", st.library),
      sb().from("acq_funds").select("id, code, name, year, budget, currency").eq("library", st.library).eq("year", now.getUTCFullYear()),
      sb().from("acq_invoices").select("id", { count: "exact", head: true }).eq("library", st.library).eq("status", "unpaid"),
    ]);
    for (const r of [orders, subs, funds, invoices]) if (r.error) throw r.error;
    const subRows = subs.data || [];
    const ids = subRows.map((s: any) => s.id);
    const last = new Map<number, string>();
    if (ids.length) {
      const { data: issues } = await sb().from("acq_issues").select("subscription_id, received_on").in("subscription_id", ids).order("received_on", { ascending: false });
      for (const i of issues || []) if (!last.has(i.subscription_id)) last.set(i.subscription_id, i.received_on);
    }
    const orderRows = orders.data || [];
    return c.json({
      library: st.library,
      openOrders: orderRows.filter((o: any) => o.status === "ordered").length,
      unpaidInvoices: invoices.count || 0,
      subscriptions: subRows.filter((s: any) => s.active !== false).length,
      lateIssues: lateIssues(subRows, last, now),
      endingSoon: endingSoon(subRows, now).map((s: any) => ({ id: s.id, title: s.title, kind: s.kind, end_date: s.end_date })),
      funds: (funds.data || []).map((f: any) => ({ ...f, ...fundStatus(f, orderRows, subRows) })),
    });
  } catch (e) { return failed(c, "The numbers", e); }
});

// ─── Journal issues ──────────────────────────────────────────
// (before /acq/:kind so "issues" is not read as a kind)

acquisitionsRoutes.get(`${P}/issues`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const sub = Number(c.req.query("subscription"));
  if (!Number.isInteger(sub)) return c.json({ error: "Which subscription?" }, 400);
  const { data, error } = await sb().from("acq_issues").select("*").eq("library", st.library).eq("subscription_id", sub).order("received_on", { ascending: false }).limit(200);
  if (error) return failed(c, "The issues", error);
  return c.json({ issues: data || [] });
});

acquisitionsRoutes.post(`${P}/issues`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const body = await c.req.json().catch(() => ({}));
  const sub = Number(body.subscriptionId);
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : "";
  const on = typeof body.receivedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.receivedOn) ? body.receivedOn : new Date().toISOString().slice(0, 10);
  if (!Number.isInteger(sub) || !label) return c.json({ error: "The subscription and the issue (for example: vol. 12, no. 3)" }, 400);
  try {
    const { data: s } = await sb().from("acq_subscriptions").select("id, kind").eq("id", sub).eq("library", st.library).maybeSingle();
    if (!s) return c.json({ error: "No such subscription" }, 404);
    const { data, error } = await sb().from("acq_issues").insert({ library: st.library, subscription_id: sub, label, received_on: on, received_by: st.username }).select().single();
    if (error) throw error;
    return c.json({ issue: data }, 201);
  } catch (e) { return failed(c, "Checking in the issue", e); }
});

acquisitionsRoutes.delete(`${P}/issues/:id`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const { data, error } = await sb().from("acq_issues").delete().eq("id", Number(c.req.param("id"))).eq("library", st.library).select("id").maybeSingle();
  if (error) return failed(c, "Removing the issue", error);
  return data ? c.json({ deleted: true }) : c.json({ error: "No such issue" }, 404);
});

// ─── Order and invoice actions ───────────────────────────────

acquisitionsRoutes.post(`${P}/orders/:id/receive`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const body = await c.req.json().catch(() => ({}));
  const recordId = typeof body.recordId === "string" && /^[A-Za-z0-9._:-]{1,120}$/.test(body.recordId) ? body.recordId : null;
  const { data, error } = await sb().from("acq_orders")
    .update({ status: "received", received_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(recordId ? { record_id: recordId } : {}) })
    .eq("id", Number(c.req.param("id"))).eq("library", st.library).neq("status", "cancelled").select().maybeSingle();
  if (error) return failed(c, "Receiving the order", error);
  return data ? c.json({ order: data }) : c.json({ error: "No such open order" }, 404);
});

acquisitionsRoutes.post(`${P}/orders/:id/cancel`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const { data, error } = await sb().from("acq_orders").update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", Number(c.req.param("id"))).eq("library", st.library).eq("status", "ordered").select().maybeSingle();
  if (error) return failed(c, "Cancelling the order", error);
  return data ? c.json({ order: data }) : c.json({ error: "Only an order not yet received can be cancelled" }, 409);
});

acquisitionsRoutes.post(`${P}/invoices/:id/pay`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  if (!canBudget(st)) return c.json({ error: "A reviewer or the Super Admin marks invoices paid" }, 403);
  const { data, error } = await sb().from("acq_invoices").update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", Number(c.req.param("id"))).eq("library", st.library).eq("status", "unpaid").select().maybeSingle();
  if (error) return failed(c, "Paying the invoice", error);
  return data ? c.json({ invoice: data }) : c.json({ error: "No such unpaid invoice" }, 404);
});

// ─── Every kind: list, add, change, remove ───────────────────

acquisitionsRoutes.get(`${P}/:kind`, async (c) => {
  const kind = kindOf(c.req.param("kind"));
  if (!kind) return c.notFound();
  const st = await staffOf(c);
  if (!st) return denied(c);
  const [col, asc] = ORDER_BY[kind];
  let q = sb().from(TABLE[kind]).select("*").eq("library", st.library).order(col, { ascending: asc }).limit(500);
  const status = c.req.query("status");
  if (kind === "orders" && status && ["ordered", "received", "cancelled"].includes(status)) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return failed(c, "The list", error);
  return c.json({ items: data || [] });
});

acquisitionsRoutes.post(`${P}/:kind`, async (c) => {
  const kind = kindOf(c.req.param("kind"));
  if (!kind) return c.notFound();
  const st = await staffOf(c);
  if (!st) return denied(c);
  if (kind === "funds" && !canBudget(st)) return c.json({ error: "A reviewer or the Super Admin sets funds and budgets" }, 403);
  const read = readEntry(kind, await c.req.json().catch(() => ({})));
  if ("error" in read) return c.json({ error: read.error }, 400);
  const refs = await refsProblem(read.row, st.library);
  if (refs) return c.json({ error: refs }, 400);
  try {
    const row: Record<string, unknown> = { ...read.row, library: st.library, created_by: st.username };
    if (kind === "orders") {
      const year = new Date().getUTCFullYear();
      const { data: used } = await sb().from("acq_orders").select("number").eq("library", st.library).like("number", `PO-${year}-%`);
      row.number = nextOrderNumber(year, (used || []).map((u: any) => u.number));
    }
    const { data, error } = await sb().from(TABLE[kind]).insert(row).select().single();
    if (error) throw error;
    return c.json({ item: data }, 201);
  } catch (e) { return failed(c, "Saving", e); }
});

acquisitionsRoutes.put(`${P}/:kind/:id`, async (c) => {
  const kind = kindOf(c.req.param("kind"));
  if (!kind) return c.notFound();
  const st = await staffOf(c);
  if (!st) return denied(c);
  if (kind === "funds" && !canBudget(st)) return c.json({ error: "A reviewer or the Super Admin sets funds and budgets" }, 403);
  const read = readEntry(kind, await c.req.json().catch(() => ({})));
  if ("error" in read) return c.json({ error: read.error }, 400);
  const refs = await refsProblem(read.row, st.library);
  if (refs) return c.json({ error: refs }, 400);
  const id = c.req.param("id");
  const { data, error } = await sb().from(TABLE[kind]).update({ ...read.row, updated_at: new Date().toISOString() })
    .eq("id", kind === "vendors" || kind === "funds" ? id : Number(id)).eq("library", st.library).select().maybeSingle();
  if (error) return failed(c, "Saving", error);
  return data ? c.json({ item: data }) : c.json({ error: "No such entry" }, 404);
});

acquisitionsRoutes.delete(`${P}/:kind/:id`, async (c) => {
  const kind = kindOf(c.req.param("kind"));
  if (!kind) return c.notFound();
  const st = await staffOf(c);
  if (!st) return denied(c);
  if ((kind === "funds" || kind === "invoices") && !canBudget(st)) return c.json({ error: "A reviewer or the Super Admin removes funds and invoices" }, 403);
  const id = c.req.param("id");
  const { data, error } = await sb().from(TABLE[kind]).delete().eq("id", kind === "vendors" || kind === "funds" ? id : Number(id)).eq("library", st.library).select("id").maybeSingle();
  if (error) return failed(c, "Removing", error);
  return data ? c.json({ deleted: true }) : c.json({ error: "No such entry" }, 404);
});

export default acquisitionsRoutes;
