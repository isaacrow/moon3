// What the public catalogue tells Moon about how it is used, anonymously. The rules for what may be kept are
// in supabase/functions/server/opacInsights.tsx (shared with the server, which cleans again before keeping).
// Nothing here uses a cookie, local storage or any id: the server makes a daily hashed key of its own. Staff
// signed in to Moon are not counted (their session header makes the server skip the report).
import { MOON_API, moonHeaders } from '../app/utils/moonApi';
import { cleanQuery, deviceClass, scriptOf, sourceOf } from '../../supabase/functions/server/opacInsights.tsx';

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

/** Once per page load: the device, the page language, the browser language, where they came from and what they opened first. */
export function reportContext(entry: string, lang: string): void {
  if (contextSent) return;
  contextSent = true;
  send({
    t: 'context',
    device: deviceClass(window.innerWidth),
    lang,
    browserLang: (navigator.language || '').slice(0, 2).toLowerCase(),
    source: sourceOf(document.referrer, window.location.hostname),
    entry,
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
