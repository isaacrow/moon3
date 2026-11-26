/**
 * The public catalogue's search results, in one place for the page and the server (plan step B3): the published
 * records read into works as the page reads them, the words searched with the page's rules, then the filters, the
 * order, the Work groups (editions and translations under one result) and one page of them, with every filter's
 * counts. The page runs it on the whole catalogue once that has arrived; until then the server runs the same code on
 * the same records and sends only the page, so a reader sees results (and their filters) without loading every book.
 */
import { matchWork, fuzzyMatchWork, wordsFound, type SearchableWork } from './searchCore.tsx';
import { applyFacets, facetCounts, sortWorks, type FacetKey, type FacetLang, type FacetValue, type Selection, type SortKey } from './opacFacets.tsx';
import { clusterPipeline, type WorkDecision } from './workClustering.tsx';
import { isSameRecord } from './sameRecord.tsx';
import { fromServerRecord } from './catalogueRecord.tsx';
import { normalizeArabic, workFromRecord, type OpacWorkEntity } from './opacWork.tsx';

export const RESULTS_PAGE_SIZE = 20;

/** Adds a work to the catalogue's list unless the list already has the same book (sameRecord.tsx). */
export function addUnlessSame<W extends OpacWorkEntity>(list: W[], work: W): void {
  if (!list.some((w) => isSameRecord(w, work))) list.push(work);
}

/** An instance with copies is available; one without copies shows "no copies recorded". Copies are never made up. */
export function settleHoldings(works: OpacWorkEntity[]): void {
  for (const w of works) {
    for (const inst of w.instances) {
      const hasCopies = (inst.items && inst.items.length > 0) ||
        (w.holdingItems || []).some(it => !it.instanceId || it.instanceId === inst.id);
      if (!hasCopies) {
        inst.holdingStatus = 'not_connected';
      } else if (!inst.holdingStatus || inst.holdingStatus === 'not_connected') {
        inst.holdingStatus = 'available';
      }
    }
  }
}

/**
 * The catalogue's works from the published records as GET /records lists them (catalogueList): each in the app's
 * form (fromServerRecord), read by the catalogue's reader, one per book, with its holdings settled — what the page's
 * service builds when the catalogue arrives. `base` is the address entity URIs are made on (the page's origin + /entity).
 */
export function catalogueWorks(list: any[], base: string): OpacWorkEntity[] {
  const works: OpacWorkEntity[] = [];
  for (const entry of list) {
    let work: OpacWorkEntity | null = null;
    try { work = workFromRecord(fromServerRecord(entry), { base }); } catch { /* a record with no Work or Instance */ }
    if (work) addUnlessSame(works, work);
  }
  settleHoldings(works);
  return works;
}

export interface Hit<W> { work: W; score: number; reason: string }

/**
 * The works that have every word (matchWork); when none has them all, the ones with each word a typing slip away
 * (fuzzyMatchWork). In the catalogue's order.
 */
export function searchHits<W extends SearchableWork>(works: W[], text: string): Array<Hit<W>> {
  const run = (fn: typeof matchWork) => works.flatMap((work) => { const m = fn(work, text); return m ? [{ work, score: m.score, reason: m.reason }] : []; });
  const hits = run(matchWork);
  return hits.length ? hits : run(fuzzyMatchWork);
}

/**
 * What a plain search of the catalogue finds (the page's searchWorks for words with no field:value parts): every
 * work when nothing is typed, else the hits best first (the catalogue's order among equals), with why each matched.
 */
export function foundWorks<W extends SearchableWork & { id: string }>(works: W[], text: string): { works: W[]; reasons: Record<string, string> } {
  if (!normalizeArabic(text)) return { works: [...works], reasons: {} };
  const hits = searchHits(works, text).sort((a, b) => b.score - a.score);
  return { works: hits.map((h) => h.work), reasons: Object.fromEntries(hits.map((h) => [h.work.id, h.reason])) };
}

/** When nothing has every word typed: the works that have some of them, the ones with most words first (two or more words). */
export function partialMatches<W extends SearchableWork>(works: W[], query: string, limit = 6): W[] {
  return works
    .map(w => ({ w, ...wordsFound(w, query) }))
    .filter(x => x.total >= 2 && x.found >= 1 && x.found < x.total)
    .sort((a, b) => b.found - a.found)
    .slice(0, limit)
    .map(x => x.w);
}

export interface ResultGroup<W> { key: string; lead: W; members: W[]; confidence?: number; evidence: string[] }
export interface ResultsPage<W> {
  /** This page's results: one per Work when grouped, each with the records inside it. */
  groups: Array<ResultGroup<W>>;
  /** Results (Works when grouped) and records after the filters. */
  groupCount: number;
  recordCount: number;
  pages: number;
  counts: Record<FacetKey, FacetValue[]>;
  /** Every record after the filters, in order (for "previous / next result"). */
  ids: string[];
  /** The first 100 results as the ids of the records inside each (for "which place did they open"). */
  order: string[][];
}

/** The filters, the order, the Work groups and one page of the works a search found, with each filter's counts. */
export function resultsPage<W extends OpacWorkEntity>(
  matched: W[],
  o: { sel: Selection; sort: SortKey; page: number; grouped: boolean; decisions?: WorkDecision[]; lang: FacetLang; pageSize?: number },
): ResultsPage<W> {
  const filtered = sortWorks(applyFacets(matched, o.sel), o.sort);
  const counts = facetCounts(matched, o.sel, o.lang);
  const groups: Array<ResultGroup<W>> = o.grouped
    ? clusterPipeline(filtered, o.decisions || []).groups
    : filtered.map((w) => ({ key: w.id, lead: w, members: [w], confidence: 1, evidence: [] }));
  const size = o.pageSize || RESULTS_PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(groups.length / size));
  const at = Math.min(Math.max(1, o.page), pages);
  return {
    groups: groups.slice((at - 1) * size, at * size),
    groupCount: groups.length,
    recordCount: filtered.length,
    pages,
    counts,
    ids: filtered.map((w) => w.id),
    order: groups.slice(0, 100).map((g) => g.members.map((m) => m.id)),
  };
}
