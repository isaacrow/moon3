// What the public catalogue tells Moon about how it is used, anonymously. The rules for what may be kept are
// in supabase/functions/server/opacInsights.tsx (shared with the server, which cleans again before keeping).
// Nothing here uses a cookie, local storage or any id: the server makes a daily hashed key of its own. Staff
// signed in to Moon are not counted (their session header makes the server skip the report).
import { MOON_API, moonHeaders } from '../app/utils/moonApi';
import { cleanQuery, deviceClass, scriptOf, sourceOf, type Action } from '../../supabase/functions/server/opacInsights.tsx';

function send(body: Record<string, unknown>): void {
  try {
    fetch(`${MOON_API}/opac/event`, {
      method: 'POST',
      keepalive: true,
      headers: moonHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch { /* no network: nothing to report */ }
}

let contextSent = false;

/**
 * The country this reader is in, as Cloudflare (which serves mooon.site) says it: two letters, or "" when it cannot be
 * told in a second. It is asked of our own site, so nothing about the reader goes to anyone else.
 */
async function countryOfReader(): Promise<string> {
  try {
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), 1500);
    const text = await fetch('/cdn-cgi/trace', { signal: ctl.signal, cache: 'no-store' }).then(r => (r.ok ? r.text() : ''));
    window.clearTimeout(timer);
    return (text.match(/^loc=([A-Z]{2})$/m) || [])[1] || '';
  } catch { return ''; }
}

/** Once per page load: the device, the page language, the browser language, the country, where they came from and what they opened first. */
export function reportContext(entry: string, lang: string): void {
  if (contextSent) return;
  contextSent = true;
  const base = {
    t: 'context',
    device: deviceClass(window.innerWidth),
    lang,
    browserLang: (navigator.language || '').slice(0, 2).toLowerCase(),
    source: sourceOf(document.referrer, window.location.hostname),
    entry,
  };
  countryOfReader().then(country => send({ ...base, country }));
}

/** A reader did one of the things worth counting (see ACTIONS). Only the name is sent. */
export function reportAction(action: Action): void {
  send({ t: 'action', action });
}

// How deep the visit went: pages viewed and seconds the page was in front of the reader. Sent when the page is
// hidden or closed; the server only ever keeps the larger numbers, so sending it again is harmless.
let pagesViewed = 0;
let seconds = 0;
let visibleSince: number | null = typeof document !== 'undefined' && document.visibilityState === 'visible' ? Date.now() : null;
export function countPage(): void { pagesViewed += 1; }
function flushVisit(): void {
  if (visibleSince !== null) { seconds += Math.round((Date.now() - visibleSince) / 1000); visibleSince = null; }
  if (pagesViewed > 0 && contextSent) send({ t: 'end', pages: pagesViewed, seconds });
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushVisit();
    else visibleSince = Date.now();
  });
}

const searchesSent = new Set<string>();

/** A search and how many results it found (0 = it found nothing). Once per search per page load. */
export function reportSearch(query: string, results: number, lang: string, filters: number): void {
  const q = cleanQuery(query);
  if (!q || searchesSent.has(q)) return;
  searchesSent.add(q);
  send({ t: 'search', query: q, results, script: scriptOf(q), lang, filters });
}

/** A reader opened a result of this search; rank is its place in the list (1 = first). */
export function reportOpen(query: string, rank: number): void {
  const q = cleanQuery(query);
  if (!q || rank < 1) return;
  send({ t: 'open', query: q, rank });
}
