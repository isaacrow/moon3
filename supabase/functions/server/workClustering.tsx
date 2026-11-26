/**
 * Work clustering, Arabic-aware (Phase 13 S11). Which catalogue records describe the same Work — its
 * editions, reprints and translations — so the OPAC shows one result per Work ("N editions").
 *
 * Six steps, as OCLC, Libris and Trove describe theirs:
 *   1. interpret  — read each record's title, creators, language, kind and links;
 *   2. normalise  — fold Arabic (hamza, tāʾ marbūṭa, diacritics) and drop the article "ال" / "al-" from each
 *                   title word; compare names with the Arabic name engine (ابن خلدون = Ibn Khaldūn's chain);
 *   3. gate       — manuscripts, serials with a generic title ("مجلة", "Bulletin") and travel guides are never
 *                   joined automatically: each copy or issue is its own thing until a person says otherwise;
 *   4. score      — title, creator, a shared Hub, a BIBFRAME translation link;
 *   5. resolve    — same (≥ 0.9), not sure (0.6–0.9: goes to the review queue), different;
 *   6. publish    — each group carries its evidence and how sure Moon is.
 * A cataloguer's decision (same / different) always wins; "different" is how a group is taken apart.
 * No imports from the OPAC service, so the editor, the OPAC and the tests all use it.
 */
import { foldArabic, foldLatin, sameNameScore } from './arabicNames';

export interface ClusterWork {
  id: string;
  uri?: string;
  canonicalMoonUri?: string;
  title: string;
  language?: string;
  genreForm?: string[];
  primaryCreator?: { name?: string; nameArabic?: string; nameEnglish?: string };
  contributors?: Array<{ name?: string; nameArabic?: string; nameEnglish?: string; role?: string }>;
  instances?: Array<{ carrierType?: string; mediaType?: string; issuance?: string }>;
  expressionOfHub?: { uri: string; label?: string };
  relatedWorks?: Array<{ predicate: string; targetTitle?: string; targetUri?: string }>;
  incipit?: string;
}

export type Verdict = 'same' | 'unsure' | 'different';
/** A cataloguer's decision on two records. */
export interface WorkDecision { a: string; b: string; verdict: 'same' | 'different'; by?: string; at?: string }
export interface PairScore { a: string; b: string; score: number; verdict: Verdict; evidence: string[]; gate?: string }
export interface WorkGroup<W> { key: string; lead: W; members: W[]; confidence: number; evidence: string[] }

export const SAME = 0.9;
export const UNSURE = 0.6;

// ---- 1. interpret, 2. normalise ----

const ARABIC = /[؀-ۿ]/;
const HONORIFIC = /^\s*(د\.|الدكتور|الشيخ|السيد|الإمام|الامام|dr\.?|prof\.?|shaykh|sheikh)\s*/i;

/** A title as a comparison key: folded, without subtitle, punctuation, leading article or "ال" on each word. */
export function titleKey(raw: string | undefined): string {
  const main = String(raw || '').split(/\s[:;=/]\s|\s?:\s|\s\/\s/)[0];
  const arabic = ARABIC.test(main);
  const folded = (arabic ? foldArabic(main) : foldLatin(main))
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .toLowerCase();
  const words = folded.split(/[\s-]+/).filter(Boolean)
    .map((w) => (arabic ? w.replace(/^(و|ف|ب|ل)?ال(?=..)/, '$1') : w))
    .filter((w, i) => !(i === 0 && /^(the|a|an|al|el|le|la|les|der|die|das)$/.test(w)))
    .filter((w) => !(!arabic && /^(al|el)$/.test(w)));
  return words.join(' ');
}

const tokens = (key: string) => new Set(key.split(' ').filter((w) => w.length > 1));
function overlap(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let n = 0;
  ta.forEach((w) => { if (tb.has(w)) n++; });
  return n / Math.max(ta.size, tb.size);
}

const personNames = (p?: { name?: string; nameArabic?: string; nameEnglish?: string }) =>
  [p?.nameArabic, p?.name, p?.nameEnglish].map((s) => String(s || '').replace(HONORIFIC, '').trim())
    .filter((s) => s && !/^(unknown|غير معروف|مجهول)/i.test(s));

/** The records' creators: the primary creator, else authors among the contributors. */
function creatorsOf(w: ClusterWork): string[] {
  const own = personNames(w.primaryCreator);
  if (own.length) return own;
  return (w.contributors || []).filter((c) => !c.role || /author|creator|مؤلف/i.test(c.role)).flatMap(personNames);
}

const GENERIC_SERIAL = /^(مجله|نشره|حوليه|دوريه|journal|bulletin|newsletter|review|proceedings|annual report|report|magazine|transactions|سلسله|series)( [\p{L}]+)?$/u;

/** Why a record must not be joined automatically, if it must not. */
export function gateOf(w: ClusterWork): string | undefined {
  const carriers = (w.instances || []).map((i) => `${i.carrierType || ''} ${i.mediaType || ''}`).join(' ');
  const genres = (w.genreForm || []).join(' ');
  if (/manuscript|مخطوط/i.test(`${carriers} ${genres}`) || w.incipit) return 'manuscript';
  const serial = (w.instances || []).some((i) => /serial|periodical|continuing|دوري/i.test(i.issuance || '')) || /periodical|journal|دوريات|مجلات/i.test(genres);
  if (serial && GENERIC_SERIAL.test(titleKey(w.title))) return 'generic-serial';
  if (/guidebook|travel guide|دليل سياحي|أدلة سياحية|ادله سياحيه/i.test(genres)) return 'travel-guide';
  return undefined;
}

const GATE_TEXT: Record<string, string> = {
  manuscript: 'a manuscript is never joined automatically',
  'generic-serial': 'a serial with a generic title is never joined automatically',
  'travel-guide': 'a travel guide is never joined automatically',
};

const uris = (w: ClusterWork) => [w.uri, w.canonicalMoonUri, `work/${w.id}`].filter(Boolean) as string[];
const TRANSLATION = /translation|expressionOf|hasExpression|originalVersion|otherEdition|hasEdition|editionOf/i;

// ---- 4. score, 5. resolve ----

/** How surely two records describe the same Work, with the reasons. */
export function scorePair(a: ClusterWork, b: ClusterWork): PairScore {
  const evidence: string[] = [];
  const linked = (x: ClusterWork, y: ClusterWork) => (x.relatedWorks || []).some((r) =>
    TRANSLATION.test(r.predicate) && !!r.targetUri && uris(y).some((u) => r.targetUri === u || r.targetUri!.endsWith(`/${u}`)));
  if (a.expressionOfHub?.uri && a.expressionOfHub.uri === b.expressionOfHub?.uri) {
    return { a: a.id, b: b.id, score: 1, verdict: 'same', evidence: [`Same hub (${a.expressionOfHub.label || a.expressionOfHub.uri})`] };
  }
  if (linked(a, b) || linked(b, a)) {
    return { a: a.id, b: b.id, score: 1, verdict: 'same', evidence: ['Linked as a translation or edition of the other'] };
  }

  const ta = titleKey(a.title), tb = titleKey(b.title);
  let score = 0;
  if (ta && ta === tb) { score += 0.6; evidence.push('Same title'); }
  else {
    const o = overlap(ta, tb);
    if (o >= 0.8) { score += 0.45; evidence.push('Nearly the same title'); }
    else return { a: a.id, b: b.id, score: 0, verdict: 'different', evidence: [] };
  }

  const ca = creatorsOf(a), cb = creatorsOf(b);
  if (ca.length && cb.length) {
    let best = 0;
    for (const x of ca) for (const y of cb) {
      if (ARABIC.test(x) !== ARABIC.test(y)) continue;
      const same = (ARABIC.test(x) ? foldArabic(x) : foldLatin(x)).replace(/\s+/g, ' ') === (ARABIC.test(y) ? foldArabic(y) : foldLatin(y)).replace(/\s+/g, ' ');
      best = Math.max(best, same ? 1 : sameNameScore(x, y));
    }
    if (best >= 0.85) { score += 0.4; evidence.push(`Same creator (${ca[0]})`); }
    else if (best >= 0.7) { score += 0.25; evidence.push(`Probably the same creator (${ca[0]} / ${cb[0]})`); }
    else if (best === 0 && ca.some((x) => cb.some((y) => ARABIC.test(x) === ARABIC.test(y)))) { score -= 0.5; evidence.push('Different creators'); }
    else evidence.push('Creators written in different scripts');
  } else if (ca.length || cb.length) {
    evidence.push('Only one record names a creator');
  } else {
    evidence.push('Neither record names a creator');
  }

  score = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  const gate = gateOf(a) || gateOf(b);
  let verdict: Verdict = score >= SAME ? 'same' : score >= UNSURE ? 'unsure' : 'different';
  if (gate && verdict === 'same') { verdict = 'unsure'; evidence.push(GATE_TEXT[gate]); }
  return { a: a.id, b: b.id, score, verdict, evidence, ...(gate ? { gate } : {}) };
}

// ---- 6. publish ----

/**
 * Groups the records into Works. Order is kept: a group sits where its first record was, and that record
 * leads it. `unsure` lists the pairs Moon will not decide alone, for the review queue.
 */
export function clusterPipeline<W extends ClusterWork>(works: W[], decisions: WorkDecision[] = []): { groups: WorkGroup<W>[]; unsure: PairScore[] } {
  const ids = new Set(works.map((w) => w.id));
  const parent = new Map<string, string>(works.map((w) => [w.id, w.id]));
  const root = (id: string): string => { let r = id; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(id, r); return r; };
  const apart = new Map<string, Set<string>>();
  const addApart = (x: string, y: string) => { (apart.get(x) || apart.set(x, new Set()).get(x)!).add(y); };
  const decided = new Map<string, WorkDecision>();
  const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  for (const d of decisions) if (ids.has(d.a) && ids.has(d.b) && d.a !== d.b) decided.set(pairKey(d.a, d.b), d);
  decided.forEach((d) => { if (d.verdict === 'different') { addApart(d.a, d.b); addApart(d.b, d.a); } });

  // Members of each group, to check "kept apart" before two groups join.
  const members = new Map<string, string[]>(works.map((w) => [w.id, [w.id]]));
  const evidence = new Map<string, Set<string>>();
  const sureness = new Map<string, number>();
  const join = (x: string, y: string, why: string[], score: number): boolean => {
    const rx = root(x), ry = root(y);
    if (rx === ry) return true;
    const mx = members.get(rx)!, my = members.get(ry)!;
    if (mx.some((m) => my.some((n) => apart.get(m)?.has(n)))) return false;
    parent.set(ry, rx);
    members.set(rx, [...mx, ...my]);
    members.delete(ry);
    const ev = evidence.get(rx) || new Set<string>();
    (evidence.get(ry) || new Set<string>()).forEach((e) => ev.add(e));
    why.forEach((e) => ev.add(e));
    evidence.set(rx, ev);
    sureness.set(rx, Math.min(sureness.get(rx) ?? 1, sureness.get(ry) ?? 1, score));
    return true;
  };

  // A person's "same" first.
  decided.forEach((d) => { if (d.verdict === 'same') join(d.a, d.b, [`Joined by a cataloguer${d.by ? ` (${d.by})` : ''}`], 1); });

  // Candidate pairs: records sharing a title word, a hub or a link (blocking, so 10,000 records stay fast).
  const byWord = new Map<string, number[]>();
  const keyed = works.map((w) => ({ w, key: titleKey(w.title) }));
  keyed.forEach(({ w, key }, i) => {
    const words = [...tokens(key)].sort((x, y) => y.length - x.length).slice(0, 2);
    if (w.expressionOfHub?.uri) words.push(`hub:${w.expressionOfHub.uri}`);
    words.forEach((t) => (byWord.get(t) || byWord.set(t, []).get(t)!).push(i));
  });
  const seen = new Set<string>();
  const pairs: PairScore[] = [];
  const consider = (i: number, j: number) => {
    const k = pairKey(works[i].id, works[j].id);
    if (i === j || seen.has(k)) return;
    seen.add(k);
    if (decided.has(k)) return;
    const p = scorePair(works[i], works[j]);
    if (p.verdict !== 'different') pairs.push(p);
  };
  byWord.forEach((list) => { if (list.length <= 400) for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) consider(list[x], list[y]); });
  // Links point at records whose titles differ (a translation): check every linked pair.
  const byUri = new Map<string, number>();
  works.forEach((w, i) => uris(w).forEach((u) => byUri.set(u, i)));
  works.forEach((w, i) => (w.relatedWorks || []).forEach((r) => {
    if (!r.targetUri || !TRANSLATION.test(r.predicate)) return;
    const j = byUri.get(r.targetUri) ?? byUri.get(`work/${r.targetUri.split('/').pop()}`);
    if (j !== undefined) consider(i, j);
  }));

  pairs.sort((x, y) => y.score - x.score);
  const unsure: PairScore[] = [];
  for (const p of pairs) {
    if (p.verdict === 'same') { if (!join(p.a, p.b, p.evidence, p.score)) unsure.push({ ...p, verdict: 'unsure', evidence: [...p.evidence, 'kept apart by a cataloguer'] }); }
    else if (root(p.a) !== root(p.b)) unsure.push(p);
  }

  const groups = new Map<string, WorkGroup<W>>();
  for (const w of works) {
    const r = root(w.id);
    if (!groups.has(r)) groups.set(r, { key: r, lead: w, members: [], confidence: sureness.get(r) ?? 1, evidence: [...(evidence.get(r) || [])] });
    groups.get(r)!.members.push(w);
  }
  return { groups: [...groups.values()], unsure: unsure.filter((p) => root(p.a) !== root(p.b)) };
}
