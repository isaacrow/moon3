/**
 * The loan desk's routes (circulation.tsx has the rules and checks; the tables are in the circulation
 * migration). Library staff only: the Super Admin, reviewers and cataloguers. Testers, and new accounts,
 * which start as testers, never see borrowers. Each library sees only its own borrowers and loans (the
 * library is the account's institution).
 *
 *   GET  /circulation/summary                 numbers for the Circulation page
 *   GET  /circulation/rules  PUT (reviewer)   loan periods, limits, renewals, fines, hold shelf days
 *   GET  /circulation/patrons?q=              find borrowers by card or name
 *   POST /circulation/patrons                 add; PUT /circulation/patrons/:id change; DELETE remove
 *   GET  /circulation/patrons/:id             a borrower with what they have out, owe and wait for
 *   GET  /circulation/copy/:barcode           a copy, its book, and whether it is out
 *   POST /circulation/checkout {barcode, card}
 *   POST /circulation/checkin  {barcode}      says when a hold is waiting for the book
 *   POST /circulation/renew    {loanId}
 *   POST /circulation/loans/:id/settle        a fine paid or waived
 *   GET  /circulation/loans?state=open|overdue|fines
 *   GET  /circulation/holds   POST {recordId, card}   DELETE /circulation/holds/:id
 *   GET  /circulation/external  PUT (reviewer) the library's own loan system (FOLIO or Koha), when it lends there
 *   GET  /circulation/availability/:recordId  public: which copies of a book are out, and until when
 */
import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { getClient } from "./db.tsx";
import { getSession, libraryOf } from "./accountRoutes.tsx";
import { hookUrlProblem } from "./webhooks.tsx";
import { historyRow } from "./readers.tsx";
import { makeResetCode, resetExpiry } from "./readerReset.tsx";
import { sha256Hex } from "./signInSafety.tsx";
import {
  parseRules, dueDate, fineFor, daysOverdue, cleanCode, readPatron, copiesIn, checkoutProblem, renewProblem,
  renewedDue, holdExpiry, type Rules, type PatronKind, type FoundCopy, type PatronInput,
} from "./circulation.tsx";

const circulationRoutes = new Hono();
const P = "/circulation";
const sb = (): any => getClient();
const RULES_KEY = (library: string) => `circulation-rules:${library}`;

interface Staff { username: string; role: string; library: string }

/** The signed-in member of staff and their library, or null. */
async function staffOf(c: any): Promise<Staff | null> {
  const s = await getSession(c);
  if (!s || !["admin", "reviewer", "cataloger"].includes(s.role)) return null;
  return { username: s.username, role: s.role, library: await libraryOf(s.username) };
}
const denied = (c: any) => c.json({ error: "Library staff only (cataloguers, reviewers and the Super Admin)" }, 403);
const failed = (c: any, what: string, e: unknown) => {
  console.error(`[circulation] ${what}:`, e instanceof Error ? e.message : e);
  return c.json({ error: `${what} failed` }, 500);
};

/**
 * The borrower's row as stored: the reader account is linked by its email (readers.tsx); an email no reader
 * has signed up with is refused, so a link always points at a real account.
 */
async function patronRow(p: PatronInput): Promise<{ row: Record<string, unknown> } | { error: string }> {
  const { readerEmail, ...rest } = p;
  if (!readerEmail) return { row: { ...rest, reader_id: null } };
  const { data } = await sb().from("readers").select("id").eq("email", readerEmail).maybeSingle();
  if (!data) return { error: "No reader account has this email; the reader signs up in the catalogue first" };
  return { row: { ...rest, reader_id: data.id } };
}

async function rulesFor(library: string): Promise<Rules> {
  return parseRules(await kv.get(RULES_KEY(library)).catch(() => null));
}

/** The copy with this barcode, and its record, or null. */
async function findCopy(barcode: string): Promise<{ copy: FoundCopy; recordId: string; title: string } | null> {
  const { data, error } = await sb().rpc("moon_records_with_barcode", { p_barcode: barcode });
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    const copy = copiesIn(row.document).find((x) => x.barcode === barcode);
    if (copy) return { copy, recordId: row.id, title: row.title };
  }
  return null;
}

/** What a borrower has out and owes, for the checks. */
async function patronState(patron: any) {
  const { data, error } = await sb().from("loans").select("id, due_at, returned_at, fine, fine_settled").eq("patron_id", patron.id);
  if (error) throw new Error(error.message);
  const now = Date.now();
  const open = (data || []).filter((l: any) => !l.returned_at);
  return {
    kind: patron.kind as PatronKind,
    blocked: !!patron.blocked,
    openLoans: open.length,
    overdue: open.filter((l: any) => new Date(l.due_at).getTime() < now).length,
    finesOwed: (data || []).filter((l: any) => l.returned_at && !l.fine_settled).reduce((s: number, l: any) => s + Number(l.fine || 0), 0),
  };
}

const withLate = (rules: Rules) => (l: any) => {
  const now = new Date();
  return { ...l, daysOverdue: l.returned_at ? 0 : daysOverdue(l.due_at, now), fineNow: l.returned_at ? Number(l.fine || 0) : fineFor(l.due_at, now, rules) };
};

// ─── Numbers and rules ───────────────────────────────────────

circulationRoutes.get(`${P}/summary`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  try {
    const now = new Date().toISOString();
    const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
    const count = async (q: any) => { const { count, error } = await q; if (error) throw new Error(error.message); return count || 0; };
    const head = (t: string) => sb().from(t).select("id", { count: "exact", head: true }).eq("library", st.library);
    const [patrons, open, overdue, ready, waiting, thisMonth] = await Promise.all([
      count(head("patrons")),
      count(head("loans").is("returned_at", null)),
      count(head("loans").is("returned_at", null).lt("due_at", now)),
      count(head("holds").eq("status", "ready")),
      count(head("holds").eq("status", "waiting")),
      count(head("loans").gte("loaned_at", month.toISOString())),
    ]);
    return c.json({ library: st.library, patrons, open, overdue, holdsReady: ready, holdsWaiting: waiting, loansThisMonth: thisMonth, rules: await rulesFor(st.library) });
  } catch (e) { return failed(c, "The numbers", e); }
});

circulationRoutes.get(`${P}/rules`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  return c.json({ library: st.library, rules: await rulesFor(st.library) });
});

circulationRoutes.put(`${P}/rules`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  if (st.role === "cataloger") return c.json({ error: "A reviewer or the Super Admin sets the loan rules" }, 403);
  const rules = parseRules(await c.req.json().catch(() => ({})));
  await kv.set(RULES_KEY(st.library), JSON.stringify(rules));
  return c.json({ library: st.library, rules });
});

// ─── Borrowers ───────────────────────────────────────────────

circulationRoutes.get(`${P}/patrons`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const q = (c.req.query("q") || "").trim().slice(0, 80);
  try {
    let query = sb().from("patrons").select("id, card, name, kind, blocked, email, phone").eq("library", st.library).order("name").limit(50);
    if (q) {
      const like = `%${q.replace(/[%_,()]/g, " ")}%`;
      query = cleanCode(q) ? query.or(`card.eq.${q},name.ilike.${like}`) : query.ilike("name", like);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return c.json({ patrons: data || [] });
  } catch (e) { return failed(c, "Finding borrowers", e); }
});

circulationRoutes.post(`${P}/patrons`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const read = readPatron(await c.req.json().catch(() => ({})));
  if ("error" in read) return c.json({ error: read.error }, 400);
  const row = await patronRow(read.patron);
  if ("error" in row) return c.json({ error: row.error }, 400);
  const { data, error } = await sb().from("patrons").insert({ ...row.row, library: st.library, created_by: st.username }).select().single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return c.json({ error: "A borrower already has this card number" }, 409);
    return failed(c, "Adding the borrower", error);
  }
  return c.json({ patron: data }, 201);
});

circulationRoutes.put(`${P}/patrons/:id`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const read = readPatron(await c.req.json().catch(() => ({})));
  if ("error" in read) return c.json({ error: read.error }, 400);
  const row = await patronRow(read.patron);
  if ("error" in row) return c.json({ error: row.error }, 400);
  const { data, error } = await sb().from("patrons").update({ ...row.row, updated_at: new Date().toISOString() })
    .eq("id", c.req.param("id")).eq("library", st.library).select().maybeSingle();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return c.json({ error: "A borrower already has this card number" }, 409);
    return failed(c, "Saving the borrower", error);
  }
  return data ? c.json({ patron: data }) : c.json({ error: "No such borrower" }, 404);
});

circulationRoutes.delete(`${P}/patrons/:id`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  try {
    const { data: patron } = await sb().from("patrons").select("*").eq("id", c.req.param("id")).eq("library", st.library).maybeSingle();
    if (!patron) return c.json({ error: "No such borrower" }, 404);
    const state = await patronState(patron);
    if (state.openLoans) return c.json({ error: "This borrower still has copies out" }, 409);
    if (state.finesOwed > 0) return c.json({ error: "This borrower still owes a fine; settle it first" }, 409);
    const { error } = await sb().from("patrons").delete().eq("id", patron.id);
    if (error) throw new Error(error.message);
    return c.json({ deleted: true });
  } catch (e) { return failed(c, "Removing the borrower", e); }
});

/**
 * A one-time code for the reader to set a new password in the catalogue (readerReset.tsx), for the reader account
 * linked to this borrower; staff give it after seeing the reader. Shown once; valid 24 hours.
 */
circulationRoutes.post(`${P}/patrons/:id/reader-reset`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  try {
    const { data: patron } = await sb().from("patrons").select("reader_id").eq("id", c.req.param("id")).eq("library", st.library).maybeSingle();
    if (!patron) return c.json({ error: "No such borrower" }, 404);
    if (!patron.reader_id) return c.json({ error: "This borrower has no reader account linked" }, 409);
    const code = makeResetCode();
    const expires = resetExpiry(new Date(), "desk");
    const { error } = await sb().from("reader_resets").insert({ code_hash: await sha256Hex(code), reader_id: patron.reader_id, via: "desk", made_by: st.username, expires_at: expires });
    if (error) throw new Error(error.message);
    return c.json({ code, expires });
  } catch (e) { return failed(c, "The reset code", e); }
});

circulationRoutes.get(`${P}/patrons/:id`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  try {
    const { data: patron } = await sb().from("patrons").select("*, reader:readers(email)").eq("id", c.req.param("id")).eq("library", st.library).maybeSingle();
    if (!patron) return c.json({ error: "No such borrower" }, 404);
    patron.readerEmail = patron.reader?.email || null;
    delete patron.reader;
    const rules = await rulesFor(st.library);
    const [{ data: loans }, { data: holds }] = await Promise.all([
      sb().from("loans").select("*").eq("patron_id", patron.id).order("due_at"),
      sb().from("holds").select("*").eq("patron_id", patron.id).in("status", ["waiting", "ready"]).order("placed_at"),
    ]);
    return c.json({ patron, loans: (loans || []).map(withLate(rules)), holds: holds || [], state: await patronState(patron), rules });
  } catch (e) { return failed(c, "Opening the borrower", e); }
});

// ─── The desk ────────────────────────────────────────────────

circulationRoutes.get(`${P}/copy/:barcode`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const barcode = cleanCode(c.req.param("barcode"));
  if (!barcode) return c.json({ error: "Not a barcode" }, 400);
  try {
    const found = await findCopy(barcode);
    if (!found) return c.json({ error: "No copy has this barcode. Add it to the edition's copies in the editor." }, 404);
    const { data: loan } = await sb().from("loans").select("*, patron:patrons(id, name, card)").eq("library", st.library).eq("barcode", barcode).is("returned_at", null).maybeSingle();
    const { count } = await sb().from("holds").select("id", { count: "exact", head: true }).eq("record_id", found.recordId).in("status", ["waiting", "ready"]);
    return c.json({ ...found, loan: loan ? withLate(await rulesFor(st.library))(loan) : null, holds: count || 0 });
  } catch (e) { return failed(c, "Finding the copy", e); }
});

circulationRoutes.post(`${P}/checkout`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const body = await c.req.json().catch(() => ({}));
  const barcode = cleanCode(body.barcode);
  const card = cleanCode(body.card);
  if (!barcode || !card) return c.json({ error: "Scan the copy's barcode and the borrower's card" }, 400);
  try {
    const { data: patron } = await sb().from("patrons").select("*").eq("library", st.library).eq("card", card).maybeSingle();
    if (!patron) return c.json({ error: "No borrower has this card number" }, 404);
    const found = await findCopy(barcode);
    if (!found) return c.json({ error: "No copy has this barcode. Add it to the edition's copies in the editor." }, 404);
    const rules = await rulesFor(st.library);
    const { data: open } = await sb().from("loans").select("id").eq("library", st.library).eq("barcode", barcode).is("returned_at", null).maybeSingle();
    const { data: ready } = await sb().from("holds").select("id, patron_id").eq("barcode", barcode).eq("status", "ready");
    const heldForOther = (ready || []).some((h: any) => h.patron_id !== patron.id);
    const problem = checkoutProblem(await patronState(patron), { referenceOnly: found.copy.referenceOnly, onLoan: !!open, heldForOther }, rules);
    if (problem) return c.json({ error: problem }, 409);
    const now = new Date();
    const { data: loan, error } = await sb().from("loans").insert({
      library: st.library, barcode, item_id: found.copy.itemId || null, record_id: found.recordId, record_title: found.title,
      patron_id: patron.id, patron_kind: patron.kind, loaned_at: now.toISOString(), due_at: dueDate(now, patron.kind, rules), loaned_by: st.username,
    }).select().single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return c.json({ error: "This copy is already on loan; check it in first" }, 409);
      throw new Error(error.message);
    }
    // The borrower's own hold on this book is fulfilled.
    await sb().from("holds").update({ status: "done" }).eq("record_id", found.recordId).eq("patron_id", patron.id).in("status", ["waiting", "ready"]);
    return c.json({ loan, patron: { id: patron.id, name: patron.name, card: patron.card }, copy: found.copy, title: found.title }, 201);
  } catch (e) { return failed(c, "The loan", e); }
});

circulationRoutes.post(`${P}/checkin`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const barcode = cleanCode((await c.req.json().catch(() => ({}))).barcode);
  if (!barcode) return c.json({ error: "Scan the copy's barcode" }, 400);
  try {
    const { data: loan } = await sb().from("loans").select("*, patron:patrons(id, name, card, reader:readers(id, keep_history))").eq("library", st.library).eq("barcode", barcode).is("returned_at", null).maybeSingle();
    if (!loan) return c.json({ error: "This copy is not on loan" }, 404);
    const rules = await rulesFor(st.library);
    const now = new Date();
    const fine = fineFor(loan.due_at, now, rules);
    // No reading history: the borrower leaves the loan now, unless a fine on it is still to be paid.
    const { error } = await sb().from("loans").update({
      returned_at: now.toISOString(), returned_by: st.username, fine, fine_settled: fine === 0, patron_id: fine > 0 ? loan.patron_id : null,
    }).eq("id", loan.id);
    if (error) throw new Error(error.message);
    // The reader's own reading history, when their borrower card is linked to a reader account with history on.
    // It is the reader's, not the library's: staff never read it (readerRoutes.tsx).
    const history = historyRow(loan, loan.patron?.reader, now.toISOString());
    if (history) await sb().from("reading_history").insert(history).then(() => {}, (e: any) => console.error("[circulation] history:", e?.message));
    // The next borrower waiting for this book gets this copy on the hold shelf.
    let hold: any = null;
    if (loan.record_id) {
      const { data: next } = await sb().from("holds").select("id, patron:patrons(name, card)").eq("record_id", loan.record_id).eq("status", "waiting").order("placed_at").limit(1).maybeSingle();
      if (next) {
        await sb().from("holds").update({ status: "ready", barcode, ready_at: now.toISOString(), expires_at: holdExpiry(now, rules) }).eq("id", next.id);
        hold = { id: next.id, name: next.patron?.name, card: next.patron?.card, until: holdExpiry(now, rules) };
      }
    }
    return c.json({ returned: true, title: loan.record_title, borrower: loan.patron ? { name: loan.patron.name, card: loan.patron.card } : null, daysOverdue: daysOverdue(loan.due_at, now), fine, currency: rules.currency, hold });
  } catch (e) { return failed(c, "The return", e); }
});

circulationRoutes.post(`${P}/renew`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const id = Number((await c.req.json().catch(() => ({}))).loanId);
  if (!Number.isInteger(id)) return c.json({ error: "Which loan?" }, 400);
  try {
    const { data: loan } = await sb().from("loans").select("*").eq("id", id).eq("library", st.library).is("returned_at", null).maybeSingle();
    if (!loan) return c.json({ error: "No such loan out" }, 404);
    const rules = await rulesFor(st.library);
    const { count } = await sb().from("holds").select("id", { count: "exact", head: true }).eq("record_id", loan.record_id).eq("status", "waiting").neq("patron_id", loan.patron_id);
    const now = new Date();
    const problem = renewProblem(loan, rules, count || 0, now);
    if (problem) return c.json({ error: problem }, 409);
    const due = renewedDue(loan.due_at, (loan.patron_kind || "reader") as PatronKind, rules, now);
    const { data, error } = await sb().from("loans").update({ due_at: due, renewals: loan.renewals + 1 }).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return c.json({ loan: data });
  } catch (e) { return failed(c, "The renewal", e); }
});

circulationRoutes.post(`${P}/loans/:id/settle`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const { data, error } = await sb().from("loans").update({ fine_settled: true, patron_id: null })
    .eq("id", Number(c.req.param("id"))).eq("library", st.library).not("returned_at", "is", null).select("id").maybeSingle();
  if (error) return failed(c, "Settling the fine", error);
  return data ? c.json({ settled: true }) : c.json({ error: "No returned loan with a fine" }, 404);
});

circulationRoutes.get(`${P}/loans`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const state = c.req.query("state") || "open";
  try {
    let q = sb().from("loans").select("*, patron:patrons(id, name, card)").eq("library", st.library).limit(300);
    if (state === "fines") q = q.not("returned_at", "is", null).eq("fine_settled", false).order("returned_at", { ascending: false });
    else {
      q = q.is("returned_at", null).order("due_at");
      if (state === "overdue") q = q.lt("due_at", new Date().toISOString());
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return c.json({ loans: (data || []).map(withLate(await rulesFor(st.library))) });
  } catch (e) { return failed(c, "The loans", e); }
});

// ─── Holds ───────────────────────────────────────────────────

circulationRoutes.get(`${P}/holds`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  try {
    // A copy left on the hold shelf too long goes back to the shelves.
    await sb().from("holds").update({ status: "cancelled" }).eq("library", st.library).eq("status", "ready").lt("expires_at", new Date().toISOString());
    const { data, error } = await sb().from("holds").select("*, patron:patrons(id, name, card)").eq("library", st.library).in("status", ["waiting", "ready"]).order("placed_at").limit(300);
    if (error) throw new Error(error.message);
    return c.json({ holds: data || [] });
  } catch (e) { return failed(c, "The holds", e); }
});

circulationRoutes.post(`${P}/holds`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const body = await c.req.json().catch(() => ({}));
  const card = cleanCode(body.card);
  const recordId = typeof body.recordId === "string" && /^[A-Za-z0-9._:-]{1,120}$/.test(body.recordId) ? body.recordId : null;
  if (!card || !recordId) return c.json({ error: "The borrower's card and the book's record number" }, 400);
  try {
    const { data: patron } = await sb().from("patrons").select("id, blocked").eq("library", st.library).eq("card", card).maybeSingle();
    if (!patron) return c.json({ error: "No borrower has this card number" }, 404);
    if (patron.blocked) return c.json({ error: "This borrower is blocked" }, 409);
    const { data: rec } = await sb().from("records").select("id, title").eq("id", recordId).is("deleted_at", null).maybeSingle();
    if (!rec) return c.json({ error: "No record has this number" }, 404);
    const { data: dup } = await sb().from("holds").select("id").eq("record_id", recordId).eq("patron_id", patron.id).in("status", ["waiting", "ready"]).maybeSingle();
    if (dup) return c.json({ error: "This borrower is already waiting for this book" }, 409);
    const { data, error } = await sb().from("holds").insert({ library: st.library, record_id: recordId, record_title: rec.title, patron_id: patron.id, placed_by: st.username }).select().single();
    if (error) throw new Error(error.message);
    return c.json({ hold: data }, 201);
  } catch (e) { return failed(c, "The hold", e); }
});

circulationRoutes.delete(`${P}/holds/:id`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  const { data, error } = await sb().from("holds").update({ status: "cancelled" }).eq("id", Number(c.req.param("id"))).eq("library", st.library).in("status", ["waiting", "ready"]).select("id").maybeSingle();
  if (error) return failed(c, "Cancelling the hold", error);
  return data ? c.json({ cancelled: true }) : c.json({ error: "No such hold" }, 404);
});

// ─── An outside loan system ──────────────────────────────────
// A library that already lends from FOLIO or Koha keeps doing so: Moon links to it from the Circulation page
// and the loan desk, instead of keeping a second list of borrowers.

const EXTERNAL_KEY = (library: string) => `circulation-external:${library}`;
const EXTERNAL_KINDS = ["none", "folio", "koha"];

function readExternal(raw: unknown): { kind: string; url: string; label: string } {
  let r: any = raw;
  if (typeof r === "string") { try { r = JSON.parse(r); } catch { r = null; } }
  const kind = EXTERNAL_KINDS.includes(r?.kind) ? r.kind : "none";
  const url = typeof r?.url === "string" ? r.url.trim() : "";
  return { kind, url: kind === "none" ? "" : url, label: typeof r?.label === "string" ? r.label.trim().slice(0, 80) : "" };
}

circulationRoutes.get(`${P}/external`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  return c.json({ library: st.library, external: readExternal(await kv.get(EXTERNAL_KEY(st.library)).catch(() => null)) });
});

circulationRoutes.put(`${P}/external`, async (c) => {
  const st = await staffOf(c);
  if (!st) return denied(c);
  if (st.role === "cataloger") return c.json({ error: "A reviewer or the Super Admin sets the loan system" }, 403);
  const ext = readExternal(await c.req.json().catch(() => ({})));
  if (ext.kind !== "none") {
    const problem = hookUrlProblem(ext.url);
    if (problem) return c.json({ error: `The address: ${problem}` }, 400);
  }
  await kv.set(EXTERNAL_KEY(st.library), JSON.stringify(ext));
  return c.json({ library: st.library, external: ext });
});

// ─── For readers (the OPAC) ──────────────────────────────────

/** The same for a page of results: ?records=id1,id2,… (up to 60); copies out, by record. */
circulationRoutes.get(`${P}/availability`, async (c) => {
  const ids = [...new Set((c.req.query("records") || "").split(",").map((s) => s.trim()).filter((s) => /^[A-Za-z0-9._:-]{1,120}$/.test(s)))].slice(0, 60);
  if (!ids.length) return c.json({ inUse: false, out: {} });
  try {
    const [{ count }, { data }] = await Promise.all([
      sb().from("patrons").select("id", { count: "exact", head: true }),
      sb().from("loans").select("record_id, item_id, barcode, due_at").in("record_id", ids).is("returned_at", null),
    ]);
    const out: Record<string, Array<{ itemId: string | null; barcode: string; due: string }>> = {};
    for (const l of data || []) (out[l.record_id] ||= []).push({ itemId: l.item_id, barcode: l.barcode, due: l.due_at });
    c.header("Cache-Control", "public, max-age=60");
    return c.json({ inUse: (count || 0) > 0, out });
  } catch {
    return c.json({ inUse: false, out: {} });
  }
});

/** Which copies of a book are out and until when; nothing about who has them. */
circulationRoutes.get(`${P}/availability/:recordId`, async (c) => {
  const recordId = c.req.param("recordId");
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(recordId)) return c.json({ inUse: false, out: [] });
  try {
    const [{ count }, { data }] = await Promise.all([
      sb().from("patrons").select("id", { count: "exact", head: true }),
      sb().from("loans").select("item_id, barcode, due_at").eq("record_id", recordId).is("returned_at", null),
    ]);
    c.header("Cache-Control", "public, max-age=60");
    return c.json({ inUse: (count || 0) > 0, out: (data || []).map((l: any) => ({ itemId: l.item_id, barcode: l.barcode, due: l.due_at })) });
  } catch {
    return c.json({ inUse: false, out: [] });
  }
});

export default circulationRoutes;
