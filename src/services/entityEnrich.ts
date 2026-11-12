/**
 * Filling Moon's entities from their outside links (OPAC plan, stage 1 step 2). An entity linked to LC or Wikidata
 * gets, from those records: its names in the other script and its other known forms (so "Ibn Khaldun" and
 * "ابن خلدون" are one person to the search), and, for a person, the birth and death dates when the entity has none.
 *
 * Nothing is replaced: a name the entity already has (in any spelling of accents, case or Arabic letter forms)
 * is not added again, and a date the entity already has is kept. A record of another kind (a subject for a
 * person) gives nothing, since that link is likely wrong. Pure, so it is tested; the panel fetches and saves.
 */
import { foldArabic, foldLatin } from './arabicNames';
import type { EntityDraft } from './entityImport';

const ARABIC = /[؀-ۿ]/;
/** At most this many names are added to one entity in one go (LC can list thirty romanizations). */
export const MAX_NEW_NAMES = 10;

export interface EnrichEntity {
  id: string; kind: string; label: string; variants?: string[]; sameAs?: string[];
  data?: Record<string, unknown>; note?: string | null; version?: number;
}

export interface Enrichment {
  id: string;
  names: string[];
  dates: { birthDate?: string; deathDate?: string };
  /** Whether the outside record's names look like the entity's (see namesAgree); only "same" is filled by default. */
  agree: 'same' | 'differs' | 'unknown';
  /** The entity had no name in this script before. */
  firstArabic: boolean;
  firstLatin: boolean;
  from: string[];
}

/** A name in one comparable form, whatever its accents, case, punctuation or Arabic letter forms. */
export const nameKey = (s: string) => (ARABIC.test(s) ? foldArabic(s) : foldLatin(s)).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Arabic or Latin letters only: LC also lists Hebrew, Cyrillic, Greek … forms, which Moon's readers do not search in. */
const ARABIC_OR_LATIN = /^[‌‍\p{Script=Arabic}\p{Script=Latin}\p{N}\p{P}\p{Zs}\p{M}\p{Sk}ʻʼ'’`~?]+$/u;
const usable = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 1 && s.length <= 150
  && !/^https?:\/\//.test(s.trim()) && ARABIC_OR_LATIN.test(s.trim());

/** Name parts that say nothing on their own ("al", "ibn", "abu", "ال" …). */
const PARTICLES = new Set(['al', 'el', 'ibn', 'bin', 'ben', 'abu', 'abi', 'umm', 'bint', 'de', 'van', 'von', 'the', 'of', 'and', 'ابن', 'بن', 'ابو', 'ابي', 'ام', 'بنت', 'عبد']);
const parts = (names: string[], arabic: boolean) => new Set(names.filter((n) => ARABIC.test(n) === arabic)
  .flatMap((n) => nameKey(n).replace(/\b\d+\b/g, ' ').split(' ').map((w) => (arabic ? w.replace(/^ال/, '') : w)))
  .filter((w) => w.length >= 3 && !PARTICLES.has(w)));

/**
 * Do the outside record's names look like the entity's? "same": they share a name part in Latin or in Arabic;
 * "differs": they could be compared (both have names in one script) and share none, so the link is likely wrong;
 * "unknown": no script in common (an Arabic-only entity and a Latin-only record), so a person must look.
 */
export function namesAgree(mine: string[], theirs: string[]): 'same' | 'differs' | 'unknown' {
  let comparable = false;
  for (const arabic of [false, true]) {
    const a = parts(mine, arabic), b = parts(theirs, arabic);
    if (!a.size || !b.size) continue;
    comparable = true;
    for (const w of a) if (b.has(w)) return 'same';
  }
  return comparable ? 'differs' : 'unknown';
}

/** What the outside records add to an entity, or null when they add nothing (or are of another kind). */
export function enrichmentOf(e: EnrichEntity, drafts: Array<EntityDraft | null>): Enrichment | null {
  const good = drafts.filter((d): d is EntityDraft => !!d && (!d.kind || d.kind === e.kind));
  if (!good.length) return null;
  const mine = [e.label, ...(e.variants || [])];
  const seen = new Set(mine.map(nameKey));
  const hadArabic = mine.some((n) => ARABIC.test(n));
  const hadLatin = mine.some((n) => !ARABIC.test(n));
  const offered: string[] = [];
  for (const d of good) for (const n of [d.label, ...(d.variants || [])]) {
    if (!usable(n)) continue;
    const name = n.trim();
    const k = nameKey(name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    offered.push(name);
  }
  // The other script first: that is what lets a search in one script find the other.
  const otherScript = (n: string) => (ARABIC.test(n) ? !hadArabic : !hadLatin);
  const names = [...offered.filter(otherScript), ...offered.filter((n) => !otherScript(n))].slice(0, MAX_NEW_NAMES);

  const dates: Enrichment['dates'] = {};
  if (e.kind === 'agent') {
    const pick = (key: 'birthDate' | 'deathDate') => good.map((d) => d.details?.[key]).find((v) => typeof v === 'string' && v.trim());
    if (!e.data?.birthDate && pick('birthDate')) dates.birthDate = pick('birthDate')!.trim();
    if (!e.data?.deathDate && pick('deathDate')) dates.deathDate = pick('deathDate')!.trim();
  }
  if (!names.length && !dates.birthDate && !dates.deathDate) return null;
  const theirs = good.flatMap((d) => [d.label, ...(d.variants || [])]).filter(usable);
  return {
    id: e.id, names, dates, agree: namesAgree(mine, theirs),
    firstArabic: !hadArabic && names.some((n) => ARABIC.test(n)),
    firstLatin: !hadLatin && names.some((n) => !ARABIC.test(n)),
    from: [...new Set(good.flatMap((d) => d.sources || []))],
  };
}

/**
 * The whole entity as the server's PUT /authorities/:id wants it (it replaces every field), with the new names
 * and dates added and everything else exactly as it was, including the note and the version it was read at.
 */
export function enrichedEntityBody(e: EnrichEntity, x: Enrichment): Record<string, unknown> {
  return {
    label: e.label,
    variants: [...(e.variants || []), ...x.names].slice(0, 50),
    sameAs: e.sameAs || [],
    data: { ...(e.data || {}), ...x.dates },
    note: e.note ?? null,
    ...(Number.isInteger(e.version) ? { version: e.version } : {}),
  };
}
