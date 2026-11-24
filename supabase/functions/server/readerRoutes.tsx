/**
 * Reader accounts in the public catalogue (readers.tsx has the rules; tables in the reader_accounts migration).
 * A reader signs in with an email and a password, apart from staff accounts; the session token travels in the
 * X-Moon-Reader header. Errors answer with a short code ({ error: "taken" }) that the catalogue words in Arabic or
 * English.
 *
 *   POST   /reader/register {email, name, password, keepHistory}   POST /reader/login {email, password}
 *   POST   /reader/logout
 *   GET    /reader/me            the account, saved books, loans and holds at the library, reading history
 *   PUT    /reader/me {name?, keepHistory?}      DELETE /reader/me {password}  (deletes everything)
 *   DELETE /reader/history       clears the reading history
 *   PUT    /reader/saved {ids}   the saved books (the whole list)
 *   POST   /reader/holds {recordId}   DELETE /reader/holds/:id
 */
import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { getClient } from "./db.tsx";
import {
  hashPassword, verifyPassword, sha256Hex, randomHex, tryKeys, lockedFor, afterWrongTry, LIMITS, clientAddress, lockMessage,
  type TryState, type TryScope,
} from "./signInSafety.tsx";
import { readRegistration, cleanEmail, sessionExpiry, inactiveBefore, cleanRecordId, PASSWORD_MAX } from "./readers.tsx";

const readerRoutes = new Hono();
const P = "/reader";
const sb = (): any => getClient();
const parse = <T,>(v: unknown): T | null => { if (!v) return null; if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } } return v as T; };

async function startSession(readerId: string): Promise<string> {
  const token = randomHex(32);
  const { error } = await sb().from("reader_sessions").insert({ token_hash: await sha256Hex(token), reader_id: readerId, expires_at: sessionExpiry(new Date()) });
  if (error) throw error;
  await sb().from("readers").update({ last_seen_at: new Date().toISOString() }).eq("id", readerId);
  return token;
}

/** The signed-in reader, or null. */
async function readerOf(c: any): Promise<any | null> {
  const token = c.req.header("X-Moon-Reader");
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await sb().from("reader_sessions").select("expires_at, reader:readers(id, email, name, keep_history, created_at, last_seen_at)")
    .eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!data?.reader || new Date(data.expires_at).getTime() < Date.now()) return null;
  // Seen today: keeps the account from being deleted as unused (one write a day at most).
  if (Date.now() - new Date(data.reader.last_seen_at).getTime() > 86_400_000) {
    await sb().from("readers").update({ last_seen_at: new Date().toISOString() }).eq("id", data.reader.id);
  }
  return data.reader;
}
const signedOut = (c: any) => c.json({ error: "signin" }, 401);

/** Accounts unused for two years go, with their history and saved books (run on sign-up and sign-in). */
async function deleteUnused() {
  await sb().from("readers").delete().lt("last_seen_at", inactiveBefore(new Date())).then(() => {}, () => {});
  await sb().from("reader_sessions").delete().lt("expires_at", new Date().toISOString()).then(() => {}, () => {});
}

async function lockedMs(keys: Record<TryScope, string>): Promise<number> {
  const now = Date.now();
  const states = await Promise.all((Object.keys(LIMITS) as TryScope[]).map((k) => kv.get(keys[k]).then((v: unknown) => parse<TryState>(v)).catch(() => null)));
  return Math.max(0, ...states.map((s) => lockedFor(s, now)));
}
async function countWrong(keys: Record<TryScope, string>) {
  const now = Date.now();
  await Promise.all((Object.keys(LIMITS) as TryScope[]).map(async (k) => {
    await kv.set(keys[k], afterWrongTry(parse<TryState>(await kv.get(keys[k]).catch(() => null)), LIMITS[k], now));
  })).catch(() => {});
}
const locked = (c: any, ms: number) => { c.header("Retry-After", String(Math.ceil(ms / 1000))); return c.json({ error: "locked", message: lockMessage(ms) }, 429); };

// ─── Sign up, sign in, sign out ──────────────────────────────

readerRoutes.post(`${P}/register`, async (c) => {
  const read = readRegistration(await c.req.json().catch(() => ({})));
  if ("error" in read) return c.json({ error: read.error }, 400);
  const { reg } = read;
  try {
    // At most 10 new accounts from one address in 15 minutes.
    const key = `moon:reader-signups:${await sha256Hex(clientAddress(c.req.header("x-forwarded-for")))}`;
    const state = parse<TryState>(await kv.get(key).catch(() => null));
    const wait = lockedFor(state, Date.now());
    if (wait) return locked(c, wait);
    await kv.set(key, afterWrongTry(state, 10, Date.now()));
    await deleteUnused();
    const pw = await hashPassword(reg.password);
    const { data, error } = await sb().from("readers").insert({
      email: reg.email, name: reg.name, keep_history: reg.keepHistory,
      password_hash: pw.passwordHash, salt: pw.salt, kdf: pw.kdf, iterations: pw.iterations,
    }).select("id").single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return c.json({ error: "taken" }, 409);
      throw error;
    }
    return c.json({ token: await startSession(data.id) }, 201);
  } catch (e: any) {
    console.error("[readers] register:", e?.message || e);
    return c.json({ error: "failed" }, 500);
  }
});

readerRoutes.post(`${P}/login`, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  const password = typeof body.password === "string" ? body.password.slice(0, PASSWORD_MAX) : "";
  if (!email || !password) return c.json({ error: "wrong" }, 401);
  const keys = await tryKeys(`reader:${email}`, clientAddress(c.req.header("x-forwarded-for")));
  const wait = await lockedMs(keys);
  if (wait) return locked(c, wait);
  try {
    await deleteUnused();
    const { data: r } = await sb().from("readers").select("id, password_hash, salt, kdf, iterations").eq("email", email).maybeSingle();
    const check = r ? await verifyPassword(password, { passwordHash: r.password_hash, salt: r.salt, kdf: r.kdf, iterations: r.iterations }) : { ok: false, upgrade: false };
    if (!r || !check.ok) { await countWrong(keys); return c.json({ error: "wrong" }, 401); }
    if (check.upgrade) {
      const pw = await hashPassword(password);
      await sb().from("readers").update({ password_hash: pw.passwordHash, salt: pw.salt, kdf: pw.kdf, iterations: pw.iterations }).eq("id", r.id);
    }
    return c.json({ token: await startSession(r.id) });
  } catch (e: any) {
    console.error("[readers] login:", e?.message || e);
    return c.json({ error: "failed" }, 500);
  }
});

readerRoutes.post(`${P}/logout`, async (c) => {
  const token = c.req.header("X-Moon-Reader");
  if (token && /^[0-9a-f]{64}$/.test(token)) await sb().from("reader_sessions").delete().eq("token_hash", await sha256Hex(token));
  return c.json({ ok: true });
});

// ─── The account ─────────────────────────────────────────────

readerRoutes.get(`${P}/me`, async (c) => {
  const me = await readerOf(c);
  if (!me) return signedOut(c);
  try {
    const { data: patrons } = await sb().from("patrons").select("id, library, card").eq("reader_id", me.id);
    const ids = (patrons || []).map((p: any) => p.id);
    const [saved, history, loans, holds] = await Promise.all([
      sb().from("reader_saved").select("record_id, added_at").eq("reader_id", me.id).order("added_at", { ascending: false }),
      sb().from("reading_history").select("id, record_id, title, library, borrowed_at, returned_at").eq("reader_id", me.id).order("returned_at", { ascending: false }).limit(500),
      ids.length ? sb().from("loans").select("id, record_id, record_title, library, loaned_at, due_at, renewals").in("patron_id", ids).is("returned_at", null).order("due_at") : { data: [] },
      ids.length ? sb().from("holds").select("id, record_id, record_title, library, status, placed_at, expires_at").in("patron_id", ids).in("status", ["waiting", "ready"]).order("placed_at") : { data: [] },
    ]);
    return c.json({
      reader: { email: me.email, name: me.name, keepHistory: me.keep_history, since: me.created_at },
      libraries: (patrons || []).map((p: any) => ({ library: p.library, card: p.card })),
      saved: (saved.data || []).map((s: any) => s.record_id),
      history: history.data || [],
      loans: loans.data || [],
      holds: holds.data || [],
    });
  } catch (e: any) {
    console.error("[readers] me:", e?.message || e);
    return c.json({ error: "failed" }, 500);
  }
});

readerRoutes.put(`${P}/me`, async (c) => {
  const me = await readerOf(c);
  if (!me) return signedOut(c);
  const body = await c.req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > 120) return c.json({ error: "name" }, 400);
    patch.name = name;
  }
  if (typeof body.keepHistory === "boolean") patch.keep_history = body.keepHistory;
  if (!Object.keys(patch).length) return c.json({ error: "nothing" }, 400);
  const { error } = await sb().from("readers").update(patch).eq("id", me.id);
  return error ? c.json({ error: "failed" }, 500) : c.json({ ok: true });
});

readerRoutes.delete(`${P}/history`, async (c) => {
  const me = await readerOf(c);
  if (!me) return signedOut(c);
  const { error } = await sb().from("reading_history").delete().eq("reader_id", me.id);
  return error ? c.json({ error: "failed" }, 500) : c.json({ cleared: true });
});

/** Deletes the account and everything in it (history, saved books, sessions); asks for the password again. */
readerRoutes.delete(`${P}/me`, async (c) => {
  const me = await readerOf(c);
  if (!me) return signedOut(c);
  const body = await c.req.json().catch(() => ({}));
  const { data: r } = await sb().from("readers").select("password_hash, salt, kdf, iterations").eq("id", me.id).single();
  const check = await verifyPassword(String(body.password || "").slice(0, PASSWORD_MAX), { passwordHash: r.password_hash, salt: r.salt, kdf: r.kdf, iterations: r.iterations });
  if (!check.ok) return c.json({ error: "wrong" }, 401);
  const { error } = await sb().from("readers").delete().eq("id", me.id);
  return error ? c.json({ error: "failed" }, 500) : c.json({ deleted: true });
});

readerRoutes.put(`${P}/saved`, async (c) => {
  const me = await readerOf(c);
  if (!me) return signedOut(c);
  const body = await c.req.json().catch(() => ({}));
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(cleanRecordId).filter(Boolean) as string[])].slice(0, 1000);
  // The whole list, as the catalogue holds it: what was taken off goes, what was added comes, old dates stay.
  const { data: had } = await sb().from("reader_saved").select("record_id").eq("reader_id", me.id);
  const gone = (had || []).map((h: any) => h.record_id).filter((id: string) => !ids.includes(id));
  if (gone.length) {
    const { error } = await sb().from("reader_saved").delete().eq("reader_id", me.id).in("record_id", gone);
    if (error) return c.json({ error: "failed" }, 500);
  }
  if (ids.length) {
    const { error } = await sb().from("reader_saved").upsert(ids.map((record_id) => ({ reader_id: me.id, record_id })), { onConflict: "reader_id,record_id", ignoreDuplicates: true });
    if (error) return c.json({ error: "failed" }, 500);
  }
  return c.json({ saved: ids });
});

// ─── Holds from the catalogue ────────────────────────────────

readerRoutes.post(`${P}/holds`, async (c) => {
  const me = await readerOf(c);
  if (!me) return signedOut(c);
  const recordId = cleanRecordId((await c.req.json().catch(() => ({}))).recordId);
  if (!recordId || !/^[A-Za-z0-9._:-]{1,120}$/.test(recordId)) return c.json({ error: "record" }, 400);
  try {
    const { data: patrons } = await sb().from("patrons").select("id, library, blocked").eq("reader_id", me.id);
    if (!patrons?.length) return c.json({ error: "no-card" }, 409);
    const patron = patrons.find((p: any) => !p.blocked);
    if (!patron) return c.json({ error: "blocked" }, 409);
    const { data: rec } = await sb().from("records").select("id, title").eq("id", recordId).is("deleted_at", null).maybeSingle();
    if (!rec) return c.json({ error: "record" }, 404);
    const { data: dup } = await sb().from("holds").select("id").eq("record_id", recordId).eq("patron_id", patron.id).in("status", ["waiting", "ready"]).maybeSingle();
    if (dup) return c.json({ error: "already" }, 409);
    const { data, error } = await sb().from("holds").insert({ library: patron.library, record_id: recordId, record_title: rec.title, patron_id: patron.id, placed_by: "reader" }).select().single();
    if (error) throw error;
    return c.json({ hold: data }, 201);
  } catch (e: any) {
    console.error("[readers] hold:", e?.message || e);
    return c.json({ error: "failed" }, 500);
  }
});

readerRoutes.delete(`${P}/holds/:id`, async (c) => {
  const me = await readerOf(c);
  if (!me) return signedOut(c);
  const { data: patrons } = await sb().from("patrons").select("id").eq("reader_id", me.id);
  const ids = (patrons || []).map((p: any) => p.id);
  if (!ids.length) return c.json({ error: "no-card" }, 409);
  const { data, error } = await sb().from("holds").update({ status: "cancelled" }).eq("id", Number(c.req.param("id"))).in("patron_id", ids).in("status", ["waiting", "ready"]).select("id").maybeSingle();
  if (error) return c.json({ error: "failed" }, 500);
  return data ? c.json({ cancelled: true }) : c.json({ error: "record" }, 404);
});

export default readerRoutes;
