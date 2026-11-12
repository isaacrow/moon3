/**
 * Linked-data helpers for the OPAC's entity pages (Phase 6):
 * - places: "بغداد، العراق" and "Baghdad, Iraq :" name the same city page;
 * - info cards: a short Wikidata summary (description, image, dates, coordinates) for people and places,
 *   as Primo's info cards do, always shown with its source;
 * - related Works: BIBFRAME relationships (translationOf, relatedTo …) resolved to catalogue Works.
 * No React and no network here, so the logic is tested on saved data.
 */
import { normalizeArabic } from '../services/wolfMoonOpacService';
import { workUri } from './schemaOrg';
import type { OpacWorkEntity, OpacBibframeRelation } from '../services/wolfMoonOpacService';
import { clusterPipeline, type WorkDecision } from '../services/workClustering';

/** The city part of a publication place, without ISBD punctuation or the country. */
export function placeName(raw: string | undefined): string {
  return String(raw || '')
    .replace(/[\[\]]/g, '')
    .split(/\s[:;]\s?|\s*[:;]\s*$|[،,]/)[0]
    .replace(/\s+/g, ' ')
    .trim();
}

export const placeKey = (raw: string | undefined) => normalizeArabic(placeName(raw)).toLowerCase();

/** Every place in the catalogue (publication places), with how many Works were published there. */
export function placesOf(works: OpacWorkEntity[]): { name: string; count: number }[] {
  const byKey = new Map<string, { name: string; ids: Set<string> }>();
  for (const w of works) {
    for (const i of w.instances || []) {
      const name = placeName(i.publicationPlace);
      const k = placeKey(name);
      if (!k || /^(s\.?\s?l\.?|م\.?\s?د\.?|مكان غير معروف)$/i.test(k)) continue; // "[S.l.]": place unknown
      if (!byKey.has(k)) byKey.set(k, { name, ids: new Set() });
      byKey.get(k)!.ids.add(w.id);
    }
  }
  return [...byKey.values()].map(p => ({ name: p.name, count: p.ids.size })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function worksAtPlace(works: OpacWorkEntity[], place: string): OpacWorkEntity[] {
  const k = placeKey(place);
  return k ? works.filter(w => (w.instances || []).some(i => placeKey(i.publicationPlace) === k)) : [];
}

/** The Wikidata item id (Q…) among an entity's sameAs links, if any. */
export function wikidataQid(urls: (string | undefined)[]): string | undefined {
  for (const u of urls) {
    const m = String(u || '').match(/(?:^|wikidata\.org\/(?:wiki|entity)\/)(Q\d+)$/);
    if (m) return m[1];
  }
  return undefined;
}

export interface InfoCard {
  qid: string;
  url: string;
  label?: string;
  description?: string;
  image?: string;
  born?: string;
  died?: string;
  coordinates?: { lat: number; lon: number };
  /** The same person in other authority files, as Wikidata records them (VIAF P214, LC P244, ISNI P213). */
  sameAs?: string[];
}

export const wikidataApiUrl = (qid: string) =>
  `https://www.wikidata.org/w/api.php?${new URLSearchParams({
    action: 'wbgetentities', ids: qid, props: 'labels|descriptions|claims', languages: 'ar|en', format: 'json', origin: '*',
  })}`;

const claim = (e: any, p: string) => e?.claims?.[p]?.find((c: any) => c.rank !== 'deprecated')?.mainsnak?.datavalue?.value;

/** "+1941-00-00T00:00:00Z" → "1941"; a full date keeps day and month. */
function year(v: any): string | undefined {
  const m = String(v?.time || '').match(/^([+-])0*(\d+)-(\d\d)-(\d\d)/);
  if (!m) return undefined;
  const y = `${m[1] === '-' ? '-' : ''}${m[2]}`;
  return v.precision >= 11 && m[3] !== '00' ? `${y}-${m[3]}-${m[4]}` : y;
}

/**
 * The card from a wbgetentities response, in the reader's language with the other as a fallback.
 * A card is shown only when the item is the right kind of thing: a human (P31 = Q5) for a person, an item
 * with coordinates for a place. A wrong Q-number in a record then shows nothing instead of someone else.
 */
export function parseInfoCard(json: any, qid: string, lang: 'ar' | 'en', kind?: 'person' | 'place'): InfoCard | null {
  const e = json?.entities?.[qid];
  if (!e || e.missing !== undefined) return null;
  const instanceOf = (e.claims?.P31 || []).map((c: any) => c?.mainsnak?.datavalue?.value?.id);
  if (kind === 'person' && !instanceOf.includes('Q5')) return null;
  if (kind === 'place' && !claim(e, 'P625')) return null;
  const pick = (m: any) => m?.[lang]?.value || m?.[lang === 'ar' ? 'en' : 'ar']?.value;
  const file = claim(e, 'P18');
  const coords = claim(e, 'P625');
  const viaf = claim(e, 'P214'), lc = claim(e, 'P244'), isni = claim(e, 'P213');
  const sameAs = [
    typeof viaf === 'string' && /^\d+$/.test(viaf) ? `https://viaf.org/viaf/${viaf}` : '',
    typeof lc === 'string' && /^n[a-z]?\d+$/.test(lc) ? `http://id.loc.gov/authorities/names/${lc}` : '',
    typeof isni === 'string' && /^[\d ]{15,19}[\dX]$/.test(isni) ? `https://isni.org/isni/${isni.replace(/ /g, '')}` : '',
  ].filter(Boolean);
  return {
    qid,
    url: `https://www.wikidata.org/wiki/${qid}`,
    label: pick(e.labels),
    description: pick(e.descriptions),
    ...(typeof file === 'string' ? { image: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=320` } : {}),
    ...(year(claim(e, 'P569')) ? { born: year(claim(e, 'P569')) } : {}),
    ...(year(claim(e, 'P570')) ? { died: year(claim(e, 'P570')) } : {}),
    ...(coords && typeof coords.latitude === 'number' ? { coordinates: { lat: coords.latitude, lon: coords.longitude } } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export interface WorkCluster { key: string; lead: OpacWorkEntity; members: OpacWorkEntity[]; confidence?: number; evidence?: string[] }

/**
 * Libris-style Work-first results: records that describe the same Work become one result, by Moon's
 * Work clustering (src/services/workClustering.ts, Phase 13 S11): a shared hub, a translation link, or the
 * same title (Arabic-aware) by the same creator. Manuscripts and generic serial titles are never joined alone,
 * nor records with no creator on a title alone; a cataloguer's decisions win. Order is kept.
 */
export function clusterWorks(works: OpacWorkEntity[], decisions: WorkDecision[] = []): WorkCluster[] {
  return clusterPipeline(works, decisions).groups;
}

export interface ResolvedRelation extends OpacBibframeRelation { workId?: string }

/**
 * A Work's BIBFRAME relationships, each pointing at the catalogue Work it names when Moon holds it
 * (by URI, else by exact title), plus the reverse: other Works that point at this one.
 */
export function relationsOf(work: OpacWorkEntity, all: OpacWorkEntity[]): { outgoing: ResolvedRelation[]; incoming: { work: OpacWorkEntity; relation: OpacBibframeRelation }[] } {
  // A work's addresses: the catalogue's own, and its BIBFRAME Work address (mooon.site/resource/work/…), which is
  // what a link from another record names.
  const uris = (w: OpacWorkEntity) => [w.uri, w.canonicalMoonUri, w.document ? workUri(w) : undefined].filter(Boolean);
  const title = (s: string | undefined) => normalizeArabic(String(s || '')).toLowerCase().trim();
  const find = (r: OpacBibframeRelation) =>
    (r.targetUri && all.find(w => uris(w).includes(r.targetUri!))) || all.find(w => title(w.title) && title(w.title) === title(r.targetTitle));
  const outgoing = (work.relatedWorks || []).map((r): ResolvedRelation => {
    const target = find(r);
    return target && target.id !== work.id ? { ...r, workId: target.id } : { ...r };
  });
  const mine = new Set(uris(work));
  const incoming = all
    .filter(w => w.id !== work.id)
    .flatMap(w => (w.relatedWorks || [])
      .filter(r => (r.targetUri && mine.has(r.targetUri)) || (!r.targetUri && title(r.targetTitle) === title(work.title)))
      .map(relation => ({ work: w, relation })))
    .filter(x => !outgoing.some(o => o.workId === x.work.id));
  return { outgoing, incoming };
}
