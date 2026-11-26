/**
 * Finds a person's Wikidata item, for their real photo (P18) and their VIAF / LC / ISNI links, from what the
 * catalogue knows about them, best evidence first:
 *   1. a Wikidata link on the person or their Moon entity;
 *   2. their LC or VIAF authority link (Wikidata's P244 / P214 point back to it);
 *   3. their name, when exactly one person on Wikidata has that name (and their dates, if the catalogue has
 *      them, agree).
 * Whatever is found must also carry the person's name (in Arabic or English, or as another form): a record
 * that links the wrong authority never shows a stranger's face.
 */

export interface PersonClues {
  name: string;
  otherNames?: string[];
  wikidata?: string;
  links?: string[];
  birthYear?: string;
  deathYear?: string;
}

// Name matching lives with the server (nameTokens.tsx): the record reader there uses it too.
import { namesAgree } from '../../supabase/functions/server/nameTokens.tsx';
export { nameTokens, namesAgree } from '../../supabase/functions/server/nameTokens.tsx';

/** "درويش، محمود، 1941-2008" → the years; "Darwish, Mahmoud" → "Mahmoud Darwish" for searching. */
export function splitHeading(heading: string): { name: string; birthYear?: string; deathYear?: string } {
  const years = heading.match(/(\d{3,4})\s*[-–]\s*(\d{3,4})?/);
  const bare = heading.replace(/[,،]?\s*(?:ca\.\s*)?\d{3,4}\s*[-–]\s*(\d{3,4})?\.?\s*$/, '').replace(/[,،.\s]+$/, '').trim();
  const parts = bare.split(/\s*[,،]\s*/);
  const name = parts.length === 2 && parts[1] ? `${parts[1]} ${parts[0]}` : bare;
  return { name, ...(years ? { birthYear: years[1], ...(years[2] ? { deathYear: years[2] } : {}) } : {}) };
}

export function qidFrom(u: string | undefined): string | undefined {
  const m = String(u || '').match(/(?:^|wikidata\.org\/(?:wiki|entity)\/)(Q\d+)$/);
  return m?.[1];
}

/** The Wikidata search ("haswbstatement") that finds the item holding this LC or VIAF link, if it is one. */
export function authorityStatement(u: string): string | undefined {
  const lc = u.match(/id\.loc\.gov\/(?:authorities\/names|rwo\/agents)\/(n[a-z]?\d+)/);
  if (lc) return `P244=${lc[1]}`;
  const viaf = u.match(/viaf\.org\/viaf\/(\d+)/);
  if (viaf) return `P214=${viaf[1]}`;
  return undefined;
}

const yearOf = (claim: any): string | undefined => String(claim?.mainsnak?.datavalue?.value?.time || '').match(/^[+-]0*(\d+)-/)?.[1];

/** Does this Wikidata item fit the person: a human, with their name, and (when known) their years? */
export function itemFits(entity: any, clues: PersonClues): boolean {
  if (!entity || entity.missing !== undefined) return false;
  const isHuman = (entity.claims?.P31 || []).some((c: any) => c?.mainsnak?.datavalue?.value?.id === 'Q5');
  if (!isHuman) return false;
  const names = [
    ...Object.values(entity.labels || {}).map((l: any) => l?.value),
    ...Object.values(entity.aliases || {}).flatMap((a: any) => (Array.isArray(a) ? a.map((x: any) => x?.value) : [])),
  ].filter((x): x is string => typeof x === 'string');
  const ours = [clues.name, ...(clues.otherNames || [])];
  if (!ours.some((o) => names.some((n) => namesAgree(o, n)))) return false;
  const born = yearOf(entity.claims?.P569?.[0]);
  const died = yearOf(entity.claims?.P570?.[0]);
  if (clues.birthYear && born && Math.abs(Number(born) - Number(clues.birthYear)) > 1) return false;
  if (clues.deathYear && died && Math.abs(Number(died) - Number(clues.deathYear)) > 1) return false;
  return true;
}

// ── Looking it up (cached for the visit, and for a week in the browser) ───────────────────────────────

const API = 'https://www.wikidata.org/w/api.php';
const CACHE_KEY = 'moon_person_qids_v1';
const WEEK = 7 * 24 * 3600 * 1000;
const memory = new Map<string, Promise<string | null>>();

function stored(): Record<string, { q: string | null; at: number }> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
}
function remember(key: string, q: string | null) {
  try {
    const all = stored();
    all[key] = { q, at: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch { /* private window: the memory cache still works */ }
}

// Two requests at a time at most, so a page of authors stays within Wikidata's limits. A failed request
// throws, so a busy moment is never remembered as "this person has no item".
let running = 0;
const waiting: Array<() => void> = [];
async function getJson(params: Record<string, string>): Promise<any> {
  if (running >= 2) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    const r = await fetch(`${API}?${new URLSearchParams({ format: 'json', origin: '*', maxlag: '5', ...params })}`);
    if (!r.ok) throw new Error(`Wikidata ${r.status}`);
    const j = await r.json();
    if (j?.error) throw new Error(`Wikidata ${j.error.code}`);
    return j;
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** "د. علي الوردي" → "علي الوردي": titles are not part of the name Wikidata knows. */
export const withoutTitles = (name: string) => name.replace(/^\s*(?:د\s*\.|الدكتور|الشيخ|Dr\.?|Prof\.?)\s*/i, '').trim();

async function entities(ids: string[]): Promise<Record<string, any>> {
  if (!ids.length) return {};
  const j = await getJson({ action: 'wbgetentities', ids: ids.slice(0, 20).join('|'), props: 'labels|aliases|claims', languages: 'ar|en' });
  return j?.entities || {};
}

async function find(clues: PersonClues): Promise<string | null> {
  const direct = qidFrom(clues.wikidata) || clues.links?.map(qidFrom).find(Boolean);
  if (direct) return direct; // a Wikidata link the cataloguer chose is trusted as it is
  // An LC or VIAF link: the Wikidata item that holds it, if it is the same person.
  for (const u of clues.links || []) {
    const st = authorityStatement(u);
    if (!st) continue;
    const s = await getJson({ action: 'query', list: 'search', srsearch: `haswbstatement:${st}`, srlimit: '3' });
    const ids = (s?.query?.search || []).map((x: any) => x.title).filter((t: string) => /^Q\d+$/.test(t));
    const es = await entities(ids);
    const hit = ids.find((id: string) => itemFits(es[id], clues));
    if (hit) return hit;
  }
  // By name: only when exactly one person fits.
  const lang = /[؀-ۿ]/.test(clues.name) ? 'ar' : 'en';
  const s = await getJson({ action: 'wbsearchentities', search: withoutTitles(clues.name), language: lang, uselang: lang, type: 'item', limit: '7' });
  const ids = (s?.search || []).map((x: any) => x.id);
  const es = await entities(ids);
  const fits = ids.filter((id: string) => itemFits(es[id], clues));
  if (fits.length === 1) return fits[0];
  // Several people with this name: the one who writes (these are a catalogue's authors), if only one does.
  const writers = fits.filter((id: string) => isWriter(es[id]));
  return writers.length === 1 ? writers[0] : null;
}

/** Writer, poet, novelist, author, translator, historian, philosopher, journalist, scholar … (Wikidata P106). */
const WRITING_OCCUPATIONS = new Set(['Q36180', 'Q49757', 'Q6625963', 'Q482980', 'Q333634', 'Q201788', 'Q4964182', 'Q1930187', 'Q1622272', 'Q2306091', 'Q11774202', 'Q4853732', 'Q214917']);
export function isWriter(entity: any): boolean {
  return (entity?.claims?.P106 || []).some((c: any) => WRITING_OCCUPATIONS.has(c?.mainsnak?.datavalue?.value?.id));
}

/** The person's Wikidata QID, or null when none can be found with confidence. */
export function findPersonQid(clues: PersonClues): Promise<string | null> {
  const key = JSON.stringify([clues.name, clues.wikidata || '', (clues.links || []).slice().sort(), clues.birthYear || '', clues.deathYear || '']);
  const cached = stored()[key];
  if (cached && Date.now() - cached.at < WEEK) return Promise.resolve(cached.q);
  if (!memory.has(key)) {
    memory.set(key, find(clues).then((q) => { remember(key, q); return q; }).catch(() => { memory.delete(key); return null; }));
  }
  return memory.get(key)!;
}
