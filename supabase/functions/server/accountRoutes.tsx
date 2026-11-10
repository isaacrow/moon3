/**
 * Tester Account & Approval Routes
 *
 * Shared, server-side store for tester accounts so that a sign-up made in one
 * browser is visible to the Super Admin (isaac) in another, and approval status
 * is enforced by the server instead of each browser's localStorage.
 *
 * KV layout:
 *   moon:account:<username lowercased>  -> StoredAccount
 *   moon:session:<token>                -> Session
 *   moon:lastseen:<username lowercased> -> { username, at } (last activity, for the Super Admin)
 *
 * The Super Admin is not stored as an account; its password comes from the
 * MOON_ADMIN_PASSWORD secret.
 */
import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";

const accountRoutes = new Hono();

const ACCOUNT_PREFIX = "moon:account:";
const SESSION_PREFIX = "moon:session:";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const SUPER_ADMIN_USERNAME = "isaac";
const SUPER_ADMIN_EMAIL = "isaac@moon.local";
const RESERVED_USERNAMES = new Set([SUPER_ADMIN_USERNAME, "admin", "tester"]);
const VIP_CODES = new Set(["wolfmoonalqamiisaac", "moon2026", "vip"]);

// Set MOON_ADMIN_PASSWORD in the Supabase function secrets to change it.
// Trimmed so a space or line break pasted into the dashboard doesn't lock the admin out.
// No built-in fallback: without the secret, the Super Admin cannot sign in (better than a password in the code).
const ADMIN_PASSWORD = (Deno.env.get("MOON_ADMIN_PASSWORD") || "").trim();

type AccountStatus = "pending" | "approved" | "rejected";

interface StoredAccount {
  username: string;
  email: string;
  institution: string;
  // A reviewer can approve, return and comment on others' records, like the Super Admin.
  role: "tester" | "cataloger" | "reviewer";
  status: AccountStatus;
  registeredAt: string;
  approvedAt?: string;
  reviewedBy?: string;
  passwordHash: string;
  salt: string;
}

interface Session {
  username: string;
  role: "admin" | "tester" | "cataloger" | "reviewer";
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
  const { passwordHash: _h, salt: _s, ...rest } = a;
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

async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time-ish comparison so password checks don't leak timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
  await kv.set(SESSION_PREFIX + token, session);
  return token;
}

/** Resolve the X-Moon-Session header to a live session, or null. */
export async function getSession(c: any): Promise<Session | null> {
  const token = c.req.header("X-Moon-Session");
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const session = parse<Session>(await kv.get(SESSION_PREFIX + token));
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await kv.del(SESSION_PREFIX + token).catch(() => {});
    return null;
  }
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
    const inviteCode = String(body.inviteCode || "").trim().toLowerCase().replace(/[\s\-_]/g, "");

    if (!/^[\p{L}\p{N}._-]{2,40}$/u.test(username)) {
      return c.json({ success: false, message: "Username must be 2-40 letters, numbers, dots, dashes or underscores." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ success: false, message: "A valid email address is required." }, 400);
    }
    if (!institution) {
      return c.json({ success: false, message: "Institution or Organization is required." }, 400);
    }
    if (password.length < 6) {
      return c.json({ success: false, message: "Password must be at least 6 characters." }, 400);
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

    const isVip = VIP_CODES.has(inviteCode);
    const now = new Date().toISOString();
    const salt = randomToken(16);
    const account: StoredAccount = {
      username,
      email,
      institution,
      role: "tester",
      status: isVip ? "approved" : "pending",
      registeredAt: now,
      ...(isVip ? { approvedAt: now, reviewedBy: "invite-code" } : {}),
      passwordHash: await hashPassword(password, salt),
      salt,
    };
    await kv.set(ACCOUNT_PREFIX + username.toLowerCase(), account);

    console.log(`[ACCOUNTS] Registered ${username} (${account.status})`);
    return c.json({ success: true, status: account.status, user: toPublic(account) });
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

    if (identifier === SUPER_ADMIN_USERNAME || identifier === SUPER_ADMIN_EMAIL) {
      if (!ADMIN_PASSWORD) {
        console.error("[accounts] MOON_ADMIN_PASSWORD is not set; Super Admin sign-in is disabled.");
        return c.json({ success: false, status: "unknown", message: "Super Admin sign-in is not configured." }, 503);
      }
      if (!safeEqual(password, ADMIN_PASSWORD)) {
        return c.json({ success: false, status: "unknown", message: "Invalid password for Super Admin account." }, 401);
      }
      const token = await createSession(SUPER_ADMIN_USERNAME, "admin");
      await touchLastSeen(SUPER_ADMIN_USERNAME, true).catch(() => {});
      return c.json({ success: true, status: "approved", token, user: SUPER_ADMIN_PUBLIC });
    }

    const account = await findAccount(identifier);
    if (!account || !safeEqual(await hashPassword(password, account.salt), account.passwordHash)) {
      return c.json({ success: false, status: "unknown", message: "Invalid username or password." }, 401);
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
  if (token && /^[0-9a-f]{64}$/.test(token)) await kv.del(SESSION_PREFIX + token).catch(() => {});
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

// The Super Admin sets an account's role: tester, cataloger or reviewer.
accountRoutes.post("/api/accounts/role", async (c) => {
  const admin = await isAdminSession(c);
  if (!admin) return c.json({ success: false, message: "Super Admin session required." }, 403);
  const { username, role } = await c.req.json().catch(() => ({}));
  if (!["tester", "cataloger", "reviewer"].includes(role)) return c.json({ success: false, message: "Unknown role." }, 400);
  const account = await findAccount(String(username || ""));
  if (!account) return c.json({ success: false, message: "Account not found." }, 404);
  account.role = role;
  await kv.set(ACCOUNT_PREFIX + account.username.toLowerCase(), account);
  console.log(`[ACCOUNTS] ${admin.username} set ${account.username} role -> ${role}`);
  return c.json({ success: true, user: toPublic(account) });
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
