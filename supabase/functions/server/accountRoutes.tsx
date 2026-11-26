/**
 * Tester Account & Approval Routes
 *
 * Shared, server-side store for tester accounts so that a sign-up made in one
 * browser is visible to the Super Admin (isaac) in another, and approval status
 * is enforced by the server instead of each browser's localStorage.
 *
 * KV layout:
 *   moon:account:<username lowercased>  -> StoredAccount
 *   moon:session:h:<sha256 of token>    -> Session (older sessions: moon:session:<token>)
 *   moon:invite:<sha256 of code>        -> InviteCode (made by the Super Admin; see signInSafety.tsx)
 *   moon:tries:<scope>:<hash>           -> wrong sign-in tries (see signInSafety.tsx)
 *   moon:lastseen:<username lowercased> -> { username, at } (last activity, for the Super Admin)
 *
 * The Super Admin is not stored as an account; its password comes from the
 * MOON_ADMIN_PASSWORD secret.
 */
import { setActor } from "./db.tsx";
import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import {
  afterWrongTry, clientAddress, hashPassword, inviteKey, inviteProblem, invitePublic, LIMITS, lockedFor, lockMessage,
  newInviteCode, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, randomHex, safeEqual, sha256Hex, tryKeys, useInvite, verifyPassword,
  type InviteCode, type TryScope, type TryState,
} from "./signInSafety.tsx";

const accountRoutes = new Hono();

const ACCOUNT_PREFIX = "moon:account:";
const SESSION_PREFIX = "moon:session:";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const SUPER_ADMIN_USERNAME = "isaac";
const SUPER_ADMIN_EMAIL = "isaac@moon.local";
const RESERVED_USERNAMES = new Set([SUPER_ADMIN_USERNAME, "admin", "tester"]);
const INVITE_PREFIX = "moon:invite:";

// Set MOON_ADMIN_PASSWORD in the Supabase function secrets to change it.
// Trimmed so a space or line break pasted into the dashboard doesn't lock the admin out.
const ADMIN_PASSWORD = (Deno.env.get("MOON_ADMIN_PASSWORD") || "").trim() || "Eshak1996";

type AccountStatus = "pending" | "approved" | "rejected";
export const ACCOUNT_ROLES = ["tester", "cataloger", "reviewer", "manuscripts"] as const;
type AccountRole = typeof ACCOUNT_ROLES[number];

interface StoredAccount {
  username: string;
  email: string;
  institution: string;
  // A reviewer can approve, return and comment on others' records, like the Super Admin.
  // "manuscripts" opens the Al-Qamar manuscripts catalogue (manuscriptsRoutes.tsx); only the Super Admin gives it.
  role: AccountRole;
  status: AccountStatus;
  registeredAt: string;
  approvedAt?: string;
  reviewedBy?: string;
  passwordHash: string;
  salt: string;
  // How the password is stored (signInSafety.tsx). Missing on accounts saved before PBKDF2: they are
  // saved the new way the next time their owner signs in.
  kdf?: string;
  iterations?: number;
}

interface Session {
  username: string;
  role: "admin" | AccountRole;
  expiresAt: string;
}

const SUPER_ADMIN_PUBLIC = {
  username: SUPER_ADMIN_USERNAME,
  email: SUPER_ADMIN_EMAIL,
  institution: "Moon Library Architecture Core (Super Admin)",
  role: "admin" as const,
  status: "approved" as const,
  registeredAt: "2024-01-01T00:00:00.000Z",
  approvedAt: "2024-01-01T00:00:00.000Z",
};

function toPublic(a: StoredAccount) {
  const { passwordHash: _h, salt: _s, kdf: _k, iterations: _i, ...rest } = a;
  return rest;
}

function parse<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

const randomToken = randomHex;

// ─── Wrong tries (see signInSafety.tsx for the rules) ────────
type TryKeys = Record<TryScope, string>;

/** How long this caller is locked out (ms), looking at the given counters; 0 = not locked. */
async function lockedMs(keys: TryKeys, scopes: TryScope[]): Promise<number> {
  const now = Date.now();
  const states = await Promise.all(scopes.map((k) => kv.get(keys[k]).then((v: unknown) => parse<TryState>(v)).catch(() => null)));
  return Math.max(0, ...states.map((st) => lockedFor(st, now)));
}

async function countWrongTry(keys: TryKeys, scopes: TryScope[]): Promise<void> {
  const now = Date.now();
  await Promise.all(scopes.map(async (k) => {
    const state = parse<TryState>(await kv.get(keys[k]).catch(() => null));
    await kv.set(keys[k], afterWrongTry(state, LIMITS[k], now));
  })).catch((e) => console.error("[ACCOUNTS] Could not count a wrong try:", e));
}

function tooManyTries(c: any, ms: number, extra: Record<string, unknown> = {}) {
  c.header("Retry-After", String(Math.ceil(ms / 1000)));
  return c.json({ success: false, ...extra, message: lockMessage(ms) }, 429);
}

async function getAccount(username: string): Promise<StoredAccount | null> {
  return parse<StoredAccount>(await kv.get(ACCOUNT_PREFIX + username.trim().toLowerCase()));
}

async function listAccounts(): Promise<StoredAccount[]> {
  const rows = await kv.getByPrefix(ACCOUNT_PREFIX);
  return rows.map((r) => parse<StoredAccount>(r)).filter((a): a is StoredAccount => !!a);
}

async function findAccount(identifier: string): Promise<StoredAccount | null> {
  const id = identifier.trim().toLowerCase();
  const direct = await getAccount(id);
  if (direct) return direct;
  if (!id.includes("@")) return null;
  const all = await listAccounts();
  return all.find((a) => a.email.toLowerCase() === id) || null;
}

async function createSession(username: string, role: Session["role"]): Promise<string> {
  const token = randomToken();
  const session: Session = {
    username,
    role,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  // Kept under a hash of the token, so reading the store does not give anyone a working session.
  await kv.set(SESSION_PREFIX + "h:" + (await sha256Hex(token)), session);
  return token;
}

/** Resolve the X-Moon-Session header to a live session, or null. */
export async function getSession(c: any): Promise<Session | null> {
  const token = c.req.header("X-Moon-Session");
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  let key = SESSION_PREFIX + "h:" + (await sha256Hex(token));
  let session = parse<Session>(await kv.get(key));
  if (!session) {
    // A session from before tokens were hashed: still good until it runs out.
    key = SESSION_PREFIX + token;
    session = parse<Session>(await kv.get(key));
  }
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await kv.del(key).catch(() => {});
    return null;
  }
  setActor(session.username);
  if (session.role !== "admin") {
    // A tester who was later rejected or deleted loses access immediately.
    const account = await getAccount(session.username);
    if (!account || account.status !== "approved") return null;
    // The account's current role, so a role the Super Admin changes applies at once.
    return { ...session, role: account.role };
  }
  return session;
}

/** The library (institution) a cataloguer belongs to, as their account gives it (S18 protected values). */
export async function libraryOf(username: string): Promise<string> {
  if (username.toLowerCase() === SUPER_ADMIN_USERNAME) return SUPER_ADMIN_PUBLIC.institution;
  return (await getAccount(username))?.institution || username;
}

/** May review records: approve, return and comment on others' records. */
export function canReview(session: Session | null): boolean {
  return !!session && (session.role === "admin" || session.role === "reviewer");
}

/** Whether a username belongs to someone who may review (for assigning records). */
export async function isReviewer(username: string): Promise<boolean> {
  if (username.toLowerCase() === SUPER_ADMIN_USERNAME) return true;
  const account = await getAccount(username);
  return !!account && account.status === "approved" && account.role === "reviewer";
}

export async function isAdminSession(c: any): Promise<Session | null> {
  const session = await getSession(c);
  return session && session.role === "admin" ? session : null;
}

// ─── Last seen ───────────────────────────────────────────────
// The app sends a heartbeat about once a minute while a tab is open and visible. Writes are
// throttled to one per user every 30 s; someone seen within the last 2 minutes counts as online.
// Only the Super Admin's account list ever reads these.
const LAST_SEEN_PREFIX = "moon:lastseen:";
const LAST_SEEN_WRITE_MS = 30_000;
const ONLINE_WINDOW_MS = 2 * 60_000;
const lastSeenWritten = new Map<string, number>();

async function touchLastSeen(username: string, force = false): Promise<void> {
  const key = username.trim().toLowerCase();
  const now = Date.now();
  if (!force) {
    const cached = lastSeenWritten.get(key);
    if (cached && now - cached < LAST_SEEN_WRITE_MS) return;
    const stored = parse<{ at: string }>(await kv.get(LAST_SEEN_PREFIX + key));
    const at = stored ? Date.parse(stored.at) : NaN;
    if (Number.isFinite(at) && now - at < LAST_SEEN_WRITE_MS) {
      lastSeenWritten.set(key, at);
      return;
    }
  }
  lastSeenWritten.set(key, now);
  await kv.set(LAST_SEEN_PREFIX + key, { username: key, at: new Date(now).toISOString() });
}

async function lastSeenByUser(): Promise<Map<string, string>> {
  const rows = await kv.getByPrefix(LAST_SEEN_PREFIX).catch(() => []);
  const map = new Map<string, string>();
  for (const row of rows) {
    const v = parse<{ username: string; at: string }>(row);
    if (v?.username && v.at) map.set(v.username.toLowerCase(), v.at);
  }
  return map;
}

function withPresence<T extends { username: string }>(account: T, seen: Map<string, string>, now: number) {
  const lastSeenAt = seen.get(account.username.toLowerCase()) || null;
  const online = !!lastSeenAt && now - Date.parse(lastSeenAt) < ONLINE_WINDOW_MS;
  return { ...account, lastSeenAt, online };
}

// ─── Register ────────────────────────────────────────────────
accountRoutes.post("/api/accounts/register", async (c) => {
  try {
    const body = await c.req.json();
    const username = String(body.username || "").trim();
    const email = String(body.email || "").trim();
    const institution = String(body.institution || "").trim();
    const password = String(body.password || "");
    const inviteCode = String(body.inviteCode || "").trim();

    if (!/^[\p{L}\p{N}._-]{2,40}$/u.test(username)) {
      return c.json({ success: false, message: "Username must be 2-40 letters, numbers, dots, dashes or underscores." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ success: false, message: "A valid email address is required." }, 400);
    }
    if (!institution) {
      return c.json({ success: false, message: "Institution or Organization is required." }, 400);
    }
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      return c.json({ success: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` }, 400);
    }
    if (RESERVED_USERNAMES.has(username.toLowerCase())) {
      return c.json({ success: false, message: "This username is reserved. Please choose another." }, 409);
    }

    const all = await listAccounts();
    const taken = all.some(
      (a) => a.username.toLowerCase() === username.toLowerCase() || a.email.toLowerCase() === email.toLowerCase(),
    );
    if (taken || email.toLowerCase() === SUPER_ADMIN_EMAIL) {
      return c.json({ success: false, message: "A tester with this username or email already exists." }, 409);
    }

    // An invite code approves the account at once. Codes are made by the Super Admin and kept in the
    // database; wrong codes count as wrong tries for the caller's address, so codes cannot be guessed.
    let invite: InviteCode | null = null;
    let inviteStoreKey = "";
    if (inviteCode) {
      const keys = await tryKeys("invite", clientAddress(c.req.header("x-forwarded-for")));
      const locked = await lockedMs(keys, ["address"]);
      if (locked) return tooManyTries(c, locked);
      inviteStoreKey = await inviteKey(inviteCode);
      invite = parse<InviteCode>(await kv.get(inviteStoreKey));
      const problem = inviteProblem(invite, Date.now());
      if (problem) {
        await countWrongTry(keys, ["address"]);
        return c.json({ success: false, message: `${problem} Leave the code empty to ask for approval instead.` }, 400);
      }
    }

    // Every new account is approved at once and signed in. The Super Admin is told in the notification
    // bell and can still decline the account, which ends its access at once (see getSession).
    const now = new Date().toISOString();
    const account: StoredAccount = {
      username,
      email,
      institution,
      role: "tester",
      status: "approved",
      registeredAt: now,
      approvedAt: now,
      reviewedBy: invite ? `invite-code:${invite.id}` : "automatic",
      ...(await hashPassword(password)),
    };
    await kv.set(ACCOUNT_PREFIX + username.toLowerCase(), account);
    if (invite) await kv.set(inviteStoreKey, useInvite(invite, username));

    const { notify } = await import("./recordStore.tsx");
    await notify(SUPER_ADMIN_USERNAME, "signup", { title: username }, username, `${email} · ${institution}`).catch(() => {});

    const token = await createSession(account.username, account.role);
    await touchLastSeen(account.username, true).catch(() => {});
    console.log(`[ACCOUNTS] Registered ${username} (approved automatically)`);
    return c.json({ success: true, status: account.status, token, user: toPublic(account) });
  } catch (error) {
    console.error("[ACCOUNTS] Register error:", error);
    return c.json({ success: false, message: "Registration failed on the server. Please try again." }, 500);
  }
});

// ─── Login ───────────────────────────────────────────────────
accountRoutes.post("/api/accounts/login", async (c) => {
  try {
    const body = await c.req.json();
    const identifier = String(body.identifier || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!identifier || !password) {
      return c.json({ success: false, status: "unknown", message: "Username and password are required." }, 400);
    }

    // Wrong tries: this account from this address, this account from anywhere, this address for any account.
    const isAdminLogin = identifier === SUPER_ADMIN_USERNAME || identifier === SUPER_ADMIN_EMAIL;
    const scopes: TryScope[] = ["pair", "account", "address"];
    const tries = await tryKeys(isAdminLogin ? SUPER_ADMIN_USERNAME : identifier, clientAddress(c.req.header("x-forwarded-for")));
    const locked = await lockedMs(tries, scopes);
    if (locked) return tooManyTries(c, locked, { status: "unknown" });

    if (isAdminLogin) {
      if (password.length > PASSWORD_MAX_LENGTH || !safeEqual(password, ADMIN_PASSWORD)) {
        await countWrongTry(tries, scopes);
        return c.json({ success: false, status: "unknown", message: "Invalid password for Super Admin account." }, 401);
      }
      await kv.del(tries.pair).catch(() => {});
      const token = await createSession(SUPER_ADMIN_USERNAME, "admin");
      await touchLastSeen(SUPER_ADMIN_USERNAME, true).catch(() => {});
      return c.json({ success: true, status: "approved", token, user: SUPER_ADMIN_PUBLIC });
    }

    const account = password.length > PASSWORD_MAX_LENGTH ? null : await findAccount(identifier);
    const check = account ? await verifyPassword(password, account) : { ok: false, upgrade: false };
    if (!account || !check.ok) {
      await countWrongTry(tries, scopes);
      return c.json({ success: false, status: "unknown", message: "Invalid username or password." }, 401);
    }
    await kv.del(tries.pair).catch(() => {});
    if (check.upgrade) {
      // Stored the old way (one round of SHA-256): save it with PBKDF2 now that the password is known to be right.
      Object.assign(account, await hashPassword(password));
      await kv.set(ACCOUNT_PREFIX + account.username.toLowerCase(), account)
        .catch((e) => console.error("[ACCOUNTS] Could not upgrade a stored password:", e));
    }
    if (account.status === "pending") {
      return c.json({
        success: false,
        status: "pending",
        message: `Account "${account.username}" is still waiting for approval by Super Administrator Isaac Faleh.`,
      });
    }
    if (account.status === "rejected") {
      return c.json({
        success: false,
        status: "rejected",
        message: `Access request for "${account.username}" was declined by Super Administrator Isaac Faleh.`,
      });
    }

    const token = await createSession(account.username, account.role);
    await touchLastSeen(account.username, true).catch(() => {});
    return c.json({ success: true, status: "approved", token, user: toPublic(account) });
  } catch (error) {
    console.error("[ACCOUNTS] Login error:", error);
    return c.json({ success: false, status: "unknown", message: "Login failed on the server. Please try again." }, 500);
  }
});

// ─── Current session ─────────────────────────────────────────
accountRoutes.get("/api/accounts/me", async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ success: false }, 401);
  if (session.role === "admin") return c.json({ success: true, user: SUPER_ADMIN_PUBLIC });
  const account = await getAccount(session.username);
  return account ? c.json({ success: true, user: toPublic(account) }) : c.json({ success: false }, 401);
});

// Signed-in heartbeat: records when this user was last active (see "Last seen" above).
accountRoutes.post("/api/accounts/me/heartbeat", async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ success: false }, 401);
  await touchLastSeen(session.username).catch((e) => console.error("[ACCOUNTS] Heartbeat error:", e));
  return c.json({ success: true });
});

// ─── Profile pictures ────────────────────────────────────────
// Stored as a small image the browser has already shrunk (128×128), under moon:avatar:<username>.
// Read with fetch (the function needs its Authorization header, which an <img> cannot send).
const AVATAR_PREFIX = "moon:avatar:";
const AVATAR_DATA_URI = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const AVATAR_MAX_CHARS = 100_000; // about 75 KB of image

accountRoutes.get("/api/accounts/avatar/:username", async (c) => {
  const username = c.req.param("username").trim().toLowerCase();
  const stored = parse<{ image: string; updatedAt: string }>(await kv.get(AVATAR_PREFIX + username));
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ success: true, image: stored?.image || null, updatedAt: stored?.updatedAt || null });
});

accountRoutes.put("/api/accounts/me/avatar", async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ success: false, message: "Sign in to change your photo." }, 401);
  const { image } = await c.req.json().catch(() => ({ image: null }));
  if (typeof image !== "string" || image.length > AVATAR_MAX_CHARS || !AVATAR_DATA_URI.test(image)) {
    return c.json({ success: false, message: "The photo must be a PNG, JPEG or WebP image under 75 KB." }, 400);
  }
  const updatedAt = new Date().toISOString();
  await kv.set(AVATAR_PREFIX + session.username.toLowerCase(), { image, updatedAt });
  return c.json({ success: true, updatedAt });
});

accountRoutes.delete("/api/accounts/me/avatar", async (c) => {
  const session = await getSession(c);
  if (!session) return c.json({ success: false, message: "Sign in to change your photo." }, 401);
  await kv.del(AVATAR_PREFIX + session.username.toLowerCase());
  return c.json({ success: true });
});

accountRoutes.post("/api/accounts/logout", async (c) => {
  const token = c.req.header("X-Moon-Session");
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    await kv.del(SESSION_PREFIX + "h:" + (await sha256Hex(token))).catch(() => {});
    await kv.del(SESSION_PREFIX + token).catch(() => {});
  }
  return c.json({ success: true });
});

// ─── Admin: list & review ────────────────────────────────────
accountRoutes.get("/api/accounts", async (c) => {
  if (!(await isAdminSession(c))) return c.json({ success: false, message: "Super Admin session required." }, 403);
  const [stored, seen] = await Promise.all([listAccounts(), lastSeenByUser()]);
  const now = Date.now();
  const accounts = stored
    .map(toPublic)
    .sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime())
    .map((a) => withPresence(a, seen, now));
  return c.json({ success: true, accounts: [withPresence(SUPER_ADMIN_PUBLIC, seen, now), ...accounts] });
});

async function setStatus(c: any, status: AccountStatus) {
  const admin = await isAdminSession(c);
  if (!admin) return c.json({ success: false, message: "Super Admin session required." }, 403);
  const { username } = await c.req.json();
  const account = await findAccount(String(username || ""));
  if (!account) return c.json({ success: false, message: "Account not found." }, 404);

  account.status = status;
  account.reviewedBy = admin.username;
  if (status === "approved") account.approvedAt = new Date().toISOString();
  else delete account.approvedAt;
  await kv.set(ACCOUNT_PREFIX + account.username.toLowerCase(), account);

  console.log(`[ACCOUNTS] ${admin.username} set ${account.username} -> ${status}`);
  return c.json({ success: true, user: toPublic(account) });
}

accountRoutes.post("/api/accounts/approve", (c) => setStatus(c, "approved"));
accountRoutes.post("/api/accounts/reject", (c) => setStatus(c, "rejected"));

/** May open the manuscripts catalogue: the Super Admin and accounts the Super Admin put in "manuscripts". */
export function canSeeManuscripts(session: Session | null): boolean {
  return !!session && (session.role === "admin" || session.role === "manuscripts");
}

// The Super Admin sets an account's role: tester, cataloger, reviewer or manuscripts.
accountRoutes.post("/api/accounts/role", async (c) => {
  const admin = await isAdminSession(c);
  if (!admin) return c.json({ success: false, message: "Super Admin session required." }, 403);
  const { username, role } = await c.req.json().catch(() => ({}));
  if (!(ACCOUNT_ROLES as readonly string[]).includes(role)) return c.json({ success: false, message: "Unknown role." }, 400);
  const account = await findAccount(String(username || ""));
  if (!account) return c.json({ success: false, message: "Account not found." }, 404);
  account.role = role;
  await kv.set(ACCOUNT_PREFIX + account.username.toLowerCase(), account);
  console.log(`[ACCOUNTS] ${admin.username} set ${account.username} role -> ${role}`);
  return c.json({ success: true, user: toPublic(account) });
});

// ─── Admin: invite codes ─────────────────────────────────────
// A code approves a new account at once. The Super Admin makes one for a person or a group, with a number
// of uses and an end date. The code is shown once, when it is made; only its hash is kept, with the hash
// as its place in the store (storeKey), so a code can be cancelled by its short id.
interface StoredInvite extends InviteCode { storeKey: string }

async function listInvites(): Promise<StoredInvite[]> {
  const rows = await kv.getByPrefix(INVITE_PREFIX);
  return rows.map((r: unknown) => parse<StoredInvite>(r)).filter((i: StoredInvite | null): i is StoredInvite => !!i && !!i.id);
}

accountRoutes.get("/api/accounts/invites", async (c) => {
  if (!(await isAdminSession(c))) return c.json({ success: false, message: "Super Admin session required." }, 403);
  const now = Date.now();
  const invites = (await listInvites()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ storeKey: _k, ...i }) => invitePublic(i, now));
  return c.json({ success: true, invites });
});

accountRoutes.post("/api/accounts/invites", async (c) => {
  const admin = await isAdminSession(c);
  if (!admin) return c.json({ success: false, message: "Super Admin session required." }, 403);
  const body = await c.req.json().catch(() => ({}));
  const label = String(body.label || "").trim().slice(0, 80);
  const maxUses = Math.floor(Number(body.maxUses) || 1);
  const days = Math.floor(Number(body.days) || 0);
  if (!label) return c.json({ success: false, message: "Say who the code is for." }, 400);
  if (maxUses < 1 || maxUses > 500) return c.json({ success: false, message: "Uses must be between 1 and 500." }, 400);
  if (days < 0 || days > 365) return c.json({ success: false, message: "Days must be between 0 and 365." }, 400);
  const code = newInviteCode();
  const storeKey = await inviteKey(code);
  const now = Date.now();
  const invite: StoredInvite = {
    id: randomToken(4),
    label,
    createdBy: admin.username,
    createdAt: new Date(now).toISOString(),
    ...(days ? { expiresAt: new Date(now + days * 86_400_000).toISOString() } : {}),
    maxUses,
    uses: 0,
    usedBy: [],
    storeKey,
  };
  await kv.set(storeKey, invite);
  console.log(`[ACCOUNTS] ${admin.username} made invite code ${invite.id} (${label}, ${maxUses} uses)`);
  const { storeKey: _k, ...shown } = invite;
  return c.json({ success: true, code, invite: invitePublic(shown, now) });
});

accountRoutes.post("/api/accounts/invites/revoke", async (c) => {
  const admin = await isAdminSession(c);
  if (!admin) return c.json({ success: false, message: "Super Admin session required." }, 403);
  const { id } = await c.req.json().catch(() => ({}));
  const invite = (await listInvites()).find((i) => i.id === id);
  if (!invite) return c.json({ success: false, message: "Invite code not found." }, 404);
  await kv.set(invite.storeKey, { ...invite, revoked: true });
  console.log(`[ACCOUNTS] ${admin.username} cancelled invite code ${invite.id}`);
  return c.json({ success: true });
});

accountRoutes.post("/api/accounts/delete", async (c) => {
  if (!(await isAdminSession(c))) return c.json({ success: false, message: "Super Admin session required." }, 403);
  const { username } = await c.req.json();
  const account = await findAccount(String(username || ""));
  if (!account) return c.json({ success: false, message: "Account not found." }, 404);
  await kv.del(ACCOUNT_PREFIX + account.username.toLowerCase());
  await kv.del(LAST_SEEN_PREFIX + account.username.toLowerCase()).catch(() => {});
  lastSeenWritten.delete(account.username.toLowerCase());
  console.log(`[ACCOUNTS] Deleted ${account.username}`);
  return c.json({ success: true });
});

export default accountRoutes;
