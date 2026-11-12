// 📊 OPAC insights: what readers do in the public catalogue, kept anonymous.
//
// What is kept, per visitor per day (the visitor is the same daily hashed key as the visit counter, which
// changes every day, so nobody can be followed from one day to the next; no cookie, no address, no browser id):
//   context — once a day: phone / tablet / computer, the page language, the browser's language, the country
//             (two letters, from the request), where they came from (the site's name only, never a page), and
//             the kind of page they started on.
//   search  — what they searched (cleaned: see cleanQuery), how many results it found, the script it was typed in,
//             whether it found nothing, and whether they opened a result and which place it was in the list.
// This file is shared: the OPAC cleans and describes with it before sending, and the server cleans again
// before keeping, so a changed page can never make the server keep more than this file allows.

export const DEVICES = ["phone", "tablet", "desktop"] as const;
export type Device = typeof DEVICES[number];
export const SCRIPTS = ["arabic", "latin", "mixed", "digits", "other"] as const;
export type Script = typeof SCRIPTS[number];
/** What a reader can do that is worth counting. Only a name from this list is kept, never anything the reader typed. */
export const ACTIONS = ["save", "cite", "copy_link", "marc", "export", "switch_lang", "ask_moon", "sign_in", "sign_up", "filter"] as const;
export type Action = typeof ACTIONS[number];
export const ENTRY_KINDS = ["home", "search", "work", "person", "subject", "hub", "place", "authors", "subjects"] as const;

/** Phone, tablet or computer, from the width of the window (not from the browser's name). */
export function deviceClass(width: number): Device {
  return width < 640 ? "phone" : width < 1024 ? "tablet" : "desktop";
}

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LATIN = /[A-Za-zÀ-ɏ]/;

/** The script a search was typed in. */
export function scriptOf(query: string): Script {
  const a = ARABIC.test(query), l = LATIN.test(query);
  if (a && l) return "mixed";
  if (a) return "arabic";
  if (l) return "latin";
  return /\d/.test(query) ? "digits" : "other";
}

/** An ISBN or ISSN typed as a search is kept only when its check digit is right, so a phone or card number is not. */
function isBookNumber(raw: string): boolean {
  const d = raw.replace(/[\s-]/g, '').toUpperCase();
  const v = (ch: string) => (ch === 'X' ? 10 : Number(ch));
  if (/^\d{13}$/.test(d)) return /^97[89]/.test(d) && [...d].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0;
  if (/^\d{9}[\dX]$/.test(d)) return [...d].reduce((n, c, i) => n + v(c) * (10 - i), 0) % 11 === 0;
  if (/^\d{7}[\dX]$/.test(d)) return [...d].reduce((n, c, i) => n + v(c) * (8 - i), 0) % 11 === 0;
  return false;
}

/**
 * The search text to keep, or "" when it should not be kept at all: anything with an email address or a web
 * address, a long number that is not an ISBN or ISSN (a phone or card number), or that is very short or long.
 * Case and spacing are made the same, so "  Ibn  Khaldun " and "ibn khaldun" count as one search.
 */
export function cleanQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const q = raw.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
  if (q.length < 2 || q.length > 120) return "";
  if (/@|https?:|www\.|\.(com|org|net|edu|gov|iq|sa|eg)\b/.test(q)) return "";
  if (/\d{6,}/.test(q.replace(/[\s-]/g, "")) && !isBookNumber(q)) return "";
  return q;
}

/** Where a visitor came from: the site's name only ("google", "bing", "duckduckgo", or the host), or "direct". */
export function sourceOf(referrer: unknown, ownHost: string): string {
  if (typeof referrer !== "string" || !referrer) return "direct";
  let host = "";
  try { host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, ""); } catch { return "direct"; }
  const own = ownHost.toLowerCase().replace(/^www\./, "");
  if (!host || host === own || host.endsWith(`.${own}`)) return "direct";
  const engine = host.match(/(?:^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|brave|startpage)\./);
  if (engine) return engine[1];
  if (host === "t.co" || /(?:^|\.)(twitter|x)\.com$/.test(host)) return "x";
  if (/(?:^|\.)(facebook|fb)\.com$/.test(host) || host === "l.facebook.com") return "facebook";
  if (/(?:^|\.)(whatsapp)\.com$/.test(host) || host === "wa.me") return "whatsapp";
  if (/(?:^|\.)(telegram)\.org$/.test(host) || host === "t.me") return "telegram";
  return /^[a-z0-9.-]{1,80}$/.test(host) ? host : "other";
}

const LANG = /^[a-z]{2,3}$/;
const COUNTRY = /^[A-Z]{2}$/;

/** What the server accepts, cleaned; null when the report is not one of these. */
export type InsightEvent =
  | { t: "context"; device: Device; lang: string; browserLang: string; source: string; entry: string; country: string }
  | { t: "action"; action: Action }
  | { t: "end"; pages: number; seconds: number }
  | { t: "search"; query: string; results: number; script: Script; lang: string; filters: number }
  | { t: "open"; query: string; rank: number };

export function parseEvent(body: unknown): InsightEvent | null {
  const b = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const lang = (v: unknown) => (typeof v === "string" && LANG.test(v.toLowerCase().slice(0, 3)) ? v.toLowerCase().slice(0, 3) : "");
  const count = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  if (b.t === "context") {
    const device = String(b.device ?? "") as Device;
    if (!DEVICES.includes(device)) return null;
    const entry = String(b.entry ?? "");
    const source = typeof b.source === "string" && /^[a-z0-9.-]{1,80}$/.test(b.source) ? b.source : "direct";
    const country = typeof b.country === "string" && COUNTRY.test(b.country) && b.country !== "XX" && b.country !== "T1" ? b.country : "";
    return { t: "context", device, lang: lang(b.lang) || "ar", browserLang: lang(b.browserLang) || "", source, entry: (ENTRY_KINDS as readonly string[]).includes(entry) ? entry : "home", country };
  }
  if (b.t === "action") {
    const action = String(b.action ?? "");
    return (ACTIONS as readonly string[]).includes(action) ? { t: "action", action: action as Action } : null;
  }
  if (b.t === "end") return { t: "end", pages: Math.max(1, count(b.pages, 500)), seconds: count(b.seconds, 14400) };
  if (b.t === "search") {
    const query = cleanQuery(b.query);
    if (!query) return null;
    return { t: "search", query, results: count(b.results, 1_000_000), script: scriptOf(query), lang: lang(b.lang) || "ar", filters: count(b.filters, 50) };
  }
  if (b.t === "open") {
    const query = cleanQuery(b.query);
    const rank = count(b.rank, 100_000);
    return query && rank >= 1 ? { t: "open", query, rank } : null;
  }
  return null;
}

/** The hour of the day (0-23) in Baghdad, where the library is: when readers come, for the "busiest hours" chart. */
export function baghdadHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Baghdad", hour: "2-digit", hourCycle: "h23" }).format(now)) % 24;
}

/** The country as the request says it: two capital letters, or "ZZ" when unknown (no country is guessed). */
export function countryFrom(header: string | undefined | null): string {
  const c = (header || "").trim().toUpperCase();
  return COUNTRY.test(c) && c !== "XX" && c !== "T1" ? c : "ZZ";
}

/** At most this many different searches are kept for one visitor in one day, so one visitor cannot flood the table. */
export const MAX_SEARCHES_PER_VISITOR_DAY = 60;
