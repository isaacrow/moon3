/**
 * What the library's own systems tell the catalogue, for readers:
 *   - loans (Circulation in Moon Studio): which copies are out and until when, for a whole page of results in
 *     one request; nothing about who has them;
 *   - e-resources (Acquisitions): the databases and e-journals the library subscribes to, with their links.
 * The pure parts (the status line, matching e-resources to a search) are tested; the loaders are small.
 */
import { useEffect, useState } from 'react';
import { MOON_API, moonHeaders } from '../app/utils/moonApi';
import { allWordsIn } from './searchIndex';

export interface LoanOut { itemId?: string | null; barcode?: string; due: string }

/**
 * The status line of a result from its copies and the loans out: "Available", "2 of 3 available", or "On loan,
 * due back 4 Dec" when every copy is out. Null when the library does not lend from Moon (inUse false) or the book
 * has no copies, so the catalogue keeps its own line.
 */
export function loanLine(copies: number, out: LoanOut[] | undefined, inUse: boolean, lang: 'ar' | 'en'):
  { text: string; s: 'available' | 'checked_out' } | null {
  if (!inUse || copies <= 0) return null;
  const n = Math.min(out?.length || 0, copies);
  const ar = lang === 'ar';
  const num = (x: number) => x.toLocaleString(ar ? 'ar-EG' : 'en-GB');
  if (n === 0) return { text: ar ? 'متاح للإعارة' : 'Available to borrow', s: 'available' };
  if (n < copies) {
    const free = copies - n;
    return { text: ar ? `${num(free)} من ${num(copies)} متاحة` : `${free} of ${copies} available`, s: 'available' };
  }
  const first = [...out!].map((o) => o.due).sort()[0];
  const date = first ? new Date(first).toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
  return { text: ar ? `معار${date ? `، يعود ${date}` : ''}` : `On loan${date ? `, due back ${date}` : ''}`, s: 'checked_out' };
}

// ─── Loans, a page of results at a time ─────────────────────

const loanCache = new Map<string, LoanOut[]>();
let loansInUse: boolean | null = null;
const waiting = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const ids = [...waiting].slice(0, 60);
  ids.forEach((id) => waiting.delete(id));
  if (waiting.size) timer = setTimeout(flush, 0);
  if (!ids.length) return;
  fetch(`${MOON_API}/circulation/availability?records=${ids.map(encodeURIComponent).join(',')}`, { headers: moonHeaders() })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d) return;
      loansInUse = !!d.inUse;
      for (const id of ids) loanCache.set(id, d.out?.[id] || []);
      listeners.forEach((fn) => fn());
    })
    .catch(() => {});
}

/** The loans out on one record, loaded together with every other result on the page. */
export function useLoansOut(recordId: string | undefined): { inUse: boolean; out: LoanOut[] | undefined } {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!recordId) return;
    const fn = () => tick((x) => x + 1);
    listeners.add(fn);
    if (!loanCache.has(recordId)) {
      waiting.add(recordId);
      if (!timer) timer = setTimeout(flush, 30);
    }
    return () => { listeners.delete(fn); };
  }, [recordId]);
  return { inUse: !!loansInUse, out: recordId ? loanCache.get(recordId) : undefined };
}

// ─── E-resources ─────────────────────────────────────────────

export interface EResource { id: number; kind: 'journal' | 'database'; title: string; issn?: string | null; url: string; recordId?: string | null }

let resources: EResource[] | null = null;
let loading: Promise<EResource[]> | null = null;

function loadResources(): Promise<EResource[]> {
  if (resources) return Promise.resolve(resources);
  loading ||= fetch(`${MOON_API}/acq/eresources`, { headers: moonHeaders() })
    .then((r) => (r.ok ? r.json() : { resources: [] }))
    .then((d) => (resources = (d.resources || []).filter((x: EResource) => /^https?:\/\//i.test(x.url))))
    .catch(() => (resources = []));
  return loading;
}

export function useEResources(): EResource[] {
  const [list, setList] = useState<EResource[]>(resources || []);
  useEffect(() => { let live = true; loadResources().then((r) => live && setList(r)); return () => { live = false; }; }, []);
  return list;
}

/** The subscribed databases and e-journals that match what was typed (every word, in the title or ISSN). */
export function matchResources(query: string, list: EResource[], limit = 5): EResource[] {
  if (!query.trim()) return [];
  return list.filter((r) => allWordsIn(query, r.title, r.issn || '')).slice(0, limit);
}
