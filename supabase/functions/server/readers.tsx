/**
 * Reader accounts in the public catalogue: the pure part (what a sign-up may hold, when history is written,
 * how long things are kept). The routes are in readerRoutes.tsx and the tables in the reader_accounts migration.
 *
 * What Moon keeps about a reader (the owner's choice, 24 November 2026: keep reading history):
 *   - the account: email, name and a password hash (PBKDF2, as staff passwords);
 *   - the books they saved;
 *   - the books they borrowed and returned (reading history), only while "keep my history" is on. It is on by
 *     default and the reader sees that when signing up; turning it off stops it, "clear" deletes it;
 *   - nothing of this is shown to library staff; the loan desk keeps no history of its own (circulation.tsx);
 *   - deleting the account deletes all of it; an account unused for two years is deleted the same way.
 * No imports: the tests run it in Node.
 */

export const SESSION_DAYS = 30;
export const INACTIVE_DAYS = 730;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;
const DAY = 86_400_000;

export function cleanEmail(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return s.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

export interface Registration { email: string; name: string; password: string; keepHistory: boolean }

/** A sign-up as sent from the catalogue, checked, or the reason it cannot be made. */
export function readRegistration(raw: any): { reg: Registration } | { error: string } {
  const email = cleanEmail(raw?.email);
  if (!email) return { error: "email" };
  const name = typeof raw?.name === "string" ? raw.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 120) return { error: "name" };
  const password = typeof raw?.password === "string" ? raw.password : "";
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return { error: "password" };
  // History is kept unless the reader unticks it when signing up.
  return { reg: { email, name, password, keepHistory: raw?.keepHistory !== false } };
}

export const sessionExpiry = (now: Date) => new Date(now.getTime() + SESSION_DAYS * DAY).toISOString();
/** Accounts not seen since this moment are deleted. */
export const inactiveBefore = (now: Date) => new Date(now.getTime() - INACTIVE_DAYS * DAY).toISOString();

/**
 * The reading-history row a returned loan makes, or null: only for a borrower linked to a reader account whose
 * history is on.
 */
export function historyRow(
  loan: { record_id?: string | null; record_title?: string | null; library?: string | null; loaned_at?: string | null },
  reader: { id: string; keep_history: boolean } | null | undefined,
  returnedAt: string,
): { reader_id: string; record_id: string | null; title: string | null; library: string | null; borrowed_at: string | null; returned_at: string } | null {
  if (!reader || !reader.keep_history) return null;
  return {
    reader_id: reader.id,
    record_id: loan.record_id ?? null,
    title: loan.record_title ?? null,
    library: loan.library ?? null,
    borrowed_at: loan.loaned_at ?? null,
    returned_at: returnedAt,
  };
}

/** A record id the catalogue saves (its work id): any short text without spaces. */
export function cleanRecordId(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s && s.length <= 300 && !/\s/.test(s) ? s : null;
}

/** The saved books after signing in: the account's, then the ones saved in this browser before (each once). */
export function mergeSaved(account: string[], browser: string[], max = 1000): string[] {
  return [...new Set([...account, ...browser.map((x) => cleanRecordId(x)).filter((x): x is string => !!x)])].slice(0, max);
}
