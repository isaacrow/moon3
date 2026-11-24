/**
 * The reader's account in the catalogue (server: readerRoutes.tsx): the session token kept in this browser, the
 * calls, and one shared state every part of the page reads (signed in or not, the account, loans, holds,
 * history, saved books). Staff sign in to Moon Studio, not here.
 */
import { useEffect, useState } from 'react';
import { MOON_API, moonHeaders } from '../app/utils/moonApi';
import { t } from './i18n';

const TOKEN_KEY = 'moon-reader-session';

export interface ReaderMe {
  reader: { email: string; name: string; keepHistory: boolean; since: string };
  libraries: Array<{ library: string; card: string }>;
  saved: string[];
  history: Array<{ id: number; record_id: string | null; title: string | null; library: string | null; borrowed_at: string | null; returned_at: string }>;
  loans: Array<{ id: number; record_id: string | null; record_title: string | null; library: string; loaned_at: string; due_at: string; renewals: number }>;
  holds: Array<{ id: number; record_id: string; record_title: string | null; library: string; status: 'waiting' | 'ready'; placed_at: string; expires_at: string | null }>;
}

const token = (): string | null => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = (v: string | null) => { try { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); } catch { /* private window */ } };

/** A call to the reader routes with the session; the answer's JSON and status. */
export async function readerApi<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const headers: Record<string, string> = moonHeaders(init.body !== undefined ? { 'Content-Type': 'application/json' } : {});
  // Only the reader's own token goes to the reader routes (a staff session in the same browser stays out).
  delete headers['X-Moon-Session'];
  const tk = token();
  if (tk) headers['X-Moon-Reader'] = tk;
  try {
    const res = await fetch(`${MOON_API}/reader${path}`, { method: init.method || (init.body !== undefined ? 'POST' : 'GET'), headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'network' } as any };
  }
}

/** What an error code from the server means, in the reader's language. */
export function readerError(code: string | undefined, message?: string): string {
  switch (code) {
    case 'email': return t('اكتب بريدًا إلكترونيًا صحيحًا.', 'Type a valid email address.');
    case 'name': return t('اكتب اسمك.', 'Type your name.');
    case 'password': return t('كلمة المرور ٨ أحرف على الأقل.', 'The password needs at least 8 characters.');
    case 'taken': return t('يوجد حساب بهذا البريد. سجّل الدخول.', 'There is already an account with this email. Sign in instead.');
    case 'wrong': return t('البريد أو كلمة المرور غير صحيحة.', 'The email or the password is wrong.');
    case 'locked': return message || t('محاولات خاطئة كثيرة. حاول بعد قليل.', 'Too many wrong tries. Try again later.');
    case 'signin': return t('انتهت جلستك. سجّل الدخول من جديد.', 'Your session ended. Sign in again.');
    case 'no-card': return t('للحجز، اطلب من المكتبة ربط بطاقتك بهذا الحساب.', 'To place holds, ask the library to link your card to this account.');
    case 'blocked': return t('بطاقتك موقوفة. راجع المكتبة.', 'Your card is blocked. Please ask the library.');
    case 'already': return t('حجزت هذا الكتاب من قبل.', 'You have already placed a hold on this book.');
    case 'record': return t('لم يُعثر على هذا الكتاب.', 'This book was not found.');
    case 'code': return t('الرمز غير صحيح أو انتهت صلاحيته أو استُخدم. اطلب رمزًا جديدًا.', 'The code is wrong, has run out or was already used. Ask for a new one.');
    case 'no-email': return t('إعادة التعيين بالبريد غير مفعّلة بعد. اطلب رمزًا من مكتب الإعارة.', 'Reset by email is not set up yet. Ask the loan desk for a reset code.');
    case 'network': return t('تعذّر الاتصال. حاول مرة أخرى.', 'Could not connect. Try again.');
    default: return t('حدث خطأ. حاول مرة أخرى.', 'Something went wrong. Try again.');
  }
}

// ─── One shared state ────────────────────────────────────────

let me: ReaderMe | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((fn) => fn());

export async function refreshReader(): Promise<ReaderMe | null> {
  if (!token()) { me = null; loaded = true; publish(); return null; }
  const r = await readerApi<ReaderMe>('/me');
  if (r.ok) me = r.data;
  else if (r.status === 401) { setToken(null); me = null; }
  loaded = true;
  publish();
  return me;
}

export function useReader(): { me: ReaderMe | null; loaded: boolean } {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick((x) => x + 1);
    listeners.add(fn);
    if (!loaded) refreshReader();
    return () => { listeners.delete(fn); };
  }, []);
  return { me, loaded };
}

/** Sign up or sign in; on success the session is kept and the account loaded. */
export async function enter(kind: 'login' | 'register', body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await readerApi<{ token?: string; error?: string; message?: string }>(`/${kind}`, { body });
  if (!r.ok || !r.data.token) return { ok: false, error: readerError(r.data.error, r.data.message) };
  setToken(r.data.token);
  await refreshReader();
  return { ok: true };
}

/** Whether the catalogue can email a reset link (the library has set up email). */
export async function emailResetAvailable(): Promise<boolean> {
  const r = await readerApi<{ email?: boolean }>('/forgot');
  return !!r.data?.email;
}

/** Asks for a reset link by email; the answer is the same whether or not an account has this email. */
export async function askReset(email: string, lang: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await readerApi<{ error?: string; message?: string }>('/forgot', { body: { email, lang } });
  return r.ok ? { ok: true } : { ok: false, error: readerError(r.data.error, r.data.message) };
}

/** Sets a new password with a reset code; on success the reader is signed in here (and out everywhere else). */
export async function resetPassword(code: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await readerApi<{ token?: string; error?: string; message?: string }>('/reset', { body: { code, password } });
  if (!r.ok || !r.data.token) return { ok: false, error: readerError(r.data.error, r.data.message) };
  setToken(r.data.token);
  await refreshReader();
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await readerApi('/logout', { body: {} });
  setToken(null);
  me = null;
  publish();
}

/** The account was deleted: forget it here too. */
export function forget(): void {
  setToken(null);
  me = null;
  publish();
}

export const signedIn = () => !!token();

/** Saves the whole list of saved books to the account (when signed in). */
export async function pushSaved(ids: string[]): Promise<void> {
  if (!token()) return;
  await readerApi('/saved', { method: 'PUT', body: { ids } });
}
