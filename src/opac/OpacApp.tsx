/**
 * Moon OPAC — the public catalog, redesigned.
 *
 * One material (white glass) over a quiet grey page. Readers see books, authors and
 * subjects in plain Arabic or English (./i18n.ts); the linked-data formats live behind one disclosure on the
 * book page for the people who need them.
 *
 * Data comes from wolfMoonOpacService, the same service the previous OPAC used, so the
 * published records, authors and subjects are the live ones.
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import {
  Search, Bookmark, BookmarkCheck, Quote, Link2, X, Menu, Download, Copy, Check, ArrowUpRight,
} from 'lucide-react';
import {
  wolfMoonOpacService,
  OpacWorkEntity,
  OpacPersonEntity,
  OpacSubjectEntity,
  resolveWorkCover,
  normalizeArabic,
} from '../services/wolfMoonOpacService';
import { bookJsonLd, metaDescription, pageUrl, workUri } from './schemaOrg';
import {
  FACETS, SORTS as SORT_OPTIONS, applyFacets, facetCounts, sortWorks, readState, writeState, toggle, valueLabel, valuesOf,
  workYearOf, realCopies, libraryOf, languageName, languageDisplay, type FacetKey, type FacetValue, type Selection, type SortKey,
} from './facets';
import { MOON_API, moonHeaders } from '../app/utils/moonApi';
import { relationWords } from '../../supabase/functions/server/workRelations.tsx';
import { setEntityNames } from './searchIndex';
import { t, opacLang, setOpacLang, type OpacLang } from './i18n';
import { IiifViewer } from './IiifViewer';
import { readDate, bothCalendars } from '../services/hijri';
import { summary as eventSummary, EVENT_KINDS, ROLES, type TransmissionEvent } from '../services/transmission';
import { findPersonQid, splitHeading, type PersonClues } from './personPhoto';
import { groupsOf, seriesParts, worksOfGroup } from './groupPages';
import { placeName, placesOf, worksAtPlace, wikidataQid, wikidataApiUrl, parseInfoCard, relationsOf, clusterWorks, type InfoCard as InfoCardData } from './linkedEntities';
import type { WorkDecision } from '../services/workClustering';
import { whatItIs, formatChips, editionLines, exactMatch, alphaIndex, letterOf, filingKey } from './plainWords';
import { usePreferredForms } from '../app/utils/preferredNames';
import { bookScript } from '../services/nameForms';
import { MARK_KINDS, ITEM_ACTIONS, maqamOf } from '../services/specialVocab';
import { addedOn, recentShelf } from './recent';
import { countPage, reportAction, reportContext, reportOpen, reportSearch } from './insights';
import { canonical as canonicalOutside, sourceOf as outsideSource, pickLabel, type Label as OutsideLabel } from '../../supabase/functions/server/labelCache.tsx';
import { whoOf, aboutPerson, teachersAndStudents, personPlaces, shelfNeighbours, subjectsAlongside, type Link as KnowledgeLink } from './knowledge';
import './opac.css';

type View =
  | { mode: 'home' }
  | { mode: 'search'; query: string; params?: string }
  | { mode: 'work'; id: string }
  | { mode: 'person'; key: string }
  | { mode: 'subject'; key: string }
  | { mode: 'hub'; key: string }
  | { mode: 'place'; key: string }
  | { mode: 'publisher'; key: string }
  | { mode: 'series'; key: string }
  | { mode: 'genre'; key: string }
  | { mode: 'authors' }
  | { mode: 'subjects' };

/**
 * Tells the server a reader opened this page, for the dashboard's visitor count. The server keeps no address;
 * robots and signed-in staff are not counted. Never in the way of the reader: errors are ignored.
 */
/** Cataloguers' Work-group decisions (S11), fetched once per page load; the OPAC groups without them meanwhile. */
let workDecisionsCache: WorkDecision[] | null = null;
let workDecisionsLoad: Promise<WorkDecision[]> | null = null;
function useWorkDecisions(): WorkDecision[] {
  const [list, setList] = useState<WorkDecision[]>(workDecisionsCache || []);
  useEffect(() => {
    if (workDecisionsCache) return;
    workDecisionsLoad = workDecisionsLoad || fetch(`${MOON_API}/work-clusters/decisions`, { headers: moonHeaders() })
      .then(r => (r.ok ? r.json() : { decisions: [] })).then(j => (workDecisionsCache = Array.isArray(j?.decisions) ? j.decisions : []))
      .catch(() => (workDecisionsCache = []));
    let live = true;
    workDecisionsLoad.then(d => { if (live) setList(d); });
    return () => { live = false; };
  }, []);
  return list;
}

function reportVisit(v: View) {
  const ref = v.mode === 'search' ? v.query : v.mode === 'work' ? v.id : 'key' in v ? v.key : '';
  if (v.mode === 'search' && !ref.trim()) return;
  try {
    fetch(`${MOON_API}/opac/visit`, {
      method: 'POST',
      keepalive: true,
      headers: moonHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ kind: v.mode, ref }),
    }).catch(() => {});
  } catch { /* no network: nothing to count */ }
}

function viewFromUrl(): View {
  const p = new URLSearchParams(window.location.search);
  if (p.get('work')) return { mode: 'work', id: p.get('work')! };
  if (p.get('person')) return { mode: 'person', key: p.get('person')! };
  if (p.get('subject')) return { mode: 'subject', key: p.get('subject')! };
  if (p.get('hub')) return { mode: 'hub', key: p.get('hub')! };
  if (p.get('place')) return { mode: 'place', key: p.get('place')! };
  if (p.get('publisher')) return { mode: 'publisher', key: p.get('publisher')! };
  if (p.get('series')) return { mode: 'series', key: p.get('series')! };
  if (p.get('genre')) return { mode: 'genre', key: p.get('genre')! };
  if (p.get('dir') === 'persons') return { mode: 'authors' };
  if (p.get('dir') === 'subjects') return { mode: 'subjects' };
  if (p.has('q')) return { mode: 'search', query: p.get('q') || '' };
  return { mode: 'home' };
}

function urlFor(v: View): string {
  const u = new URL(window.location.href);
  ['work', 'person', 'subject', 'hub', 'place', 'publisher', 'series', 'genre', 'dir', 'q', 'view', 'sort', 'page'].forEach(k => u.searchParams.delete(k));
  [...u.searchParams.keys()].filter(k => k.startsWith('f_')).forEach(k => u.searchParams.delete(k));
  if (v.mode === 'work') u.searchParams.set('work', v.id);
  if (v.mode === 'person') u.searchParams.set('person', v.key);
  if (v.mode === 'subject') u.searchParams.set('subject', v.key);
  if (v.mode === 'hub') u.searchParams.set('hub', v.key);
  if (v.mode === 'place') u.searchParams.set('place', v.key);
  if (v.mode === 'publisher' || v.mode === 'series' || v.mode === 'genre') u.searchParams.set(v.mode, v.key);
  if (v.mode === 'authors') u.searchParams.set('dir', 'persons');
  if (v.mode === 'subjects') u.searchParams.set('dir', 'subjects');
  if (v.mode === 'search') {
    u.searchParams.set('q', v.query);
    // Back to a filtered list: its filters, sort and page come along.
    new URLSearchParams(v.params || '').forEach((val, k) => { if (k.startsWith('f_') || k === 'sort' || k === 'page') u.searchParams.append(k, val); });
  }
  return u.toString();
}

const STATUS_LABEL = (): Record<string, string> => ({
  available: t('متاح للإعارة', 'Available to borrow'),
  checked_out: t('معار حالياً', 'On loan'),
  paged: t('قيد التجهيز', 'Being processed'),
  reference_only: t('للاطلاع داخل المكتبة', 'Library use only'),
  digital_access: t('نسخة رقمية', 'Digital copy'),
  not_connected: t('لا توجد نسخ بعد', 'No copies yet'),
});

function personName(p?: OpacPersonEntity): string {
  if (!p) return '';
  return p.nameArabic || p.name || p.nameEnglish || '';
}

function workYear(w: OpacWorkEntity): string {
  const y = w.instances.find(i => i.publicationYear)?.publicationYear || w.originDate || '';
  return String(y).replace(/[^\d٠-٩\-–/ ]/g, '').trim() || String(y);
}

/** Some imported subjects carry only an authority id (sh96010368) as their label; keep those off the browse surfaces. */
function isReadableLabel(label: string): boolean {
  const t = (label || '').trim();
  return t.length > 1 && !/^[a-z]{0,4}\d{4,}$/i.test(t) && !/^https?:/i.test(t);
}

/** "Author (مؤلف)" → "مؤلف" for Arabic readers, "Author" for English readers. */
function roleLabel(role?: string): string {
  if (!role) return '';
  if (opacLang() === 'en') {
    const latin = role.replace(/\([^)]*\)/g, '').trim();
    return /[A-Za-z]/.test(latin) ? latin.replace(/^./, (c) => c.toUpperCase()) : role.trim();
  }
  const inParens = role.match(/\(([^)]*[؀-ۿ][^)]*)\)/);
  if (inParens) return inParens[1].trim();
  return /[؀-ۿ]/.test(role) ? role.trim() : '';
}

const AUTHOR_ROLE = () => t('مؤلف', 'Author');

function initial(s: string) {
  const t = s.replace(/^(د\.|الدكتور|الشيخ|السيد)\s*/, '').trim();
  return t.charAt(0) || '؟';
}

/**
 * Moves between views with the browser's View Transitions: the old page fades and blurs out,
 * the new one rises in, and anything sharing a view-transition-name (a book's cover, an
 * author's photo, the header, the current-section pill) glides from its old place to its new one.
 * Browsers without the API, and people who ask for reduced motion, get the plain update
 * (plus a short CSS fade-in where the API is missing).
 */
function withTransition(update: () => void) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const run = () => {
    flushSync(update);
    uniqueTransitionNames();
    window.scrollTo({ top: 0 });
  };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (reduce || !doc.startViewTransition) { run(); return; }
  uniqueTransitionNames();
  doc.startViewTransition(run);
}

/**
 * A view-transition-name used twice on a page makes the browser skip the whole transition (no glide at
 * all). The same book can sit on two shelves of the home page, so only the first of each name keeps it.
 */
function uniqueTransitionNames() {
  const seen = new Set<string>();
  document.querySelectorAll<HTMLElement>('[style*="view-transition-name"]').forEach((el) => {
    const name = el.style.viewTransitionName;
    if (!name || name === 'none') return;
    if (seen.has(name)) el.style.viewTransitionName = 'none';
    else seen.add(name);
  });
}

/** Pages render as one keyed block so the fallback fade and the card stagger replay on each visit. */
function viewKey(v: View): string {
  return v.mode + ':' + ('id' in v ? v.id : 'key' in v ? v.key : 'query' in v ? v.query : '');
}

/**
 * A manuscript's chain of transmission: what its copies' notes record (ijāzāt, samāʿāt, copying, ownership,
 * waqf), oldest first, each with its people and roles, place and date in both calendars.
 */
function TransmissionChain({ copies }: { copies: Array<{ id: string; heldBy?: string; events?: TransmissionEvent[] }> }) {
  const ar = opacLang() === 'ar';
  const events = copies.flatMap((c) => (c.events || []).map((e) => ({ e, copy: c })));
  if (!events.length) return null;
  const when = (e: TransmissionEvent) => (e.date ? readDate(e.date).from : undefined) ?? Number.POSITIVE_INFINITY;
  const sorted = [...events].sort((a, b) => when(a.e) - when(b.e));
  return (
    <section className="panel glass rise" aria-labelledby="h-chain-t" id="h-chain">
      <h2 id="h-chain-t">{t('سلسلة الرواية والتملّك', 'Chain of transmission and ownership')}</h2>
      <p className="muted">{t('ما تسجّله قيود هذه النسخ وهوامشها: الإجازات والسماعات والنسخ والتملّك والوقف، من الأقدم.', 'What the notes in these copies record: licences, auditions, copying, ownership and endowment, oldest first.')}</p>
      <ol className="chain">
        {sorted.map(({ e }) => {
          const r = e.date ? readDate(e.date) : null;
          return (
            <li key={e.id} className="chain-step">
              <div className="chain-kind">{ar ? EVENT_KINDS[e.kind].ar : EVENT_KINDS[e.kind].en}</div>
              <div className="chain-what" dir="auto">{eventSummary(e, ar)}</div>
              {e.participants.length > 0 && (
                <div className="chain-people">
                  {e.participants.map((p, i) => (
                    <span key={i} className="chain-person" dir="auto">
                      <span className="role">{ar ? ROLES[p.role].ar : ROLES[p.role].en}: </span>
                      {p.uri ? <a href={p.uri} target="_blank" rel="noreferrer">{p.label}</a> : p.label}
                    </span>
                  ))}
                </div>
              )}
              {r?.from !== undefined && <div className="chain-date muted" dir="auto">{bothCalendars(r, ar)}</div>}
              {e.text && <blockquote className="chain-text" dir="auto">{e.text}</blockquote>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------

export function OpacApp({ onOpenEditor }: { onOpenEditor?: () => void }) {
  const [view, setView] = useState<View>(() => viewFromUrl());
  const [ready, setReady] = useState(false);
  const [rev, setRev] = useState(0);
  const [saved, setSaved] = useState<string[]>(() => wolfMoonOpacService.getBookbagIds());
  const [savedOpen, setSavedOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [lang, setLang] = useState<OpacLang>(opacLang);
  const switchLang = useCallback(() => {
    reportAction('switch_lang');
    const next: OpacLang = lang === 'ar' ? 'en' : 'ar';
    setOpacLang(next);
    // A ?lang= in the address would win on reload; keep it in step with the choice.
    const u = new URL(window.location.href);
    if (u.searchParams.has('lang')) {
      u.searchParams.set('lang', next);
      window.history.replaceState(window.history.state, '', u.toString());
    }
    withTransition(() => setLang(next));
  }, [lang]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    let alive = true;
    wolfMoonOpacService.initDatabase().then(() => { if (alive) { setReady(true); setRev(r => r + 1); } });
    const off = wolfMoonOpacService.subscribe(() => { setReady(true); setRev(r => r + 1); });
    // Every entity's names, so a search in one script finds books whose people and subjects carry the other
    // ("Ibn Khaldun" = "ابن خلدون"). The search works without them; when they arrive, results are made again.
    fetch(`${MOON_API}/resource/names.json`, { headers: moonHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d?.forms) { setEntityNames(d.forms); setRev(r => r + 1); } })
      .catch(() => {});
    const onPop = () => withTransition(() => setView(viewFromUrl()));
    window.addEventListener('popstate', onPop);
    if (!(document as any).startViewTransition) document.documentElement.classList.add('no-vt');
    return () => { alive = false; off(); window.removeEventListener('popstate', onPop); };
  }, []);

  // One visit per page opened (a link, Back or Forward, or the first load). The first one also says what kind of
  // device, language and source the reader has; a result opened from a search says which place it was in the list.
  const previousView = useRef<View | null>(null);
  useEffect(() => {
    reportVisit(view);
    countPage();
    reportContext(view.mode, lang);
    const before = previousView.current;
    if (before && before.mode === 'search' && view.mode === 'work') {
      // Its place among the results the reader saw (editions folded under one result count as that one place).
      const place = readDisplayedOrder().findIndex(group => group.includes(view.id));
      if (place >= 0) reportOpen(before.query, place + 1);
    }
    previousView.current = view;
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((v: View) => {
    window.history.pushState({}, '', urlFor(v));
    withTransition(() => {
      setView(v);
      setNavOpen(false);
    });
  }, []);

  const say = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout((say as any)._t);
    (say as any)._t = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const toggleSave = useCallback((id: string) => {
    const r = wolfMoonOpacService.toggleBookbag(id);
    setSaved(r.items);
    say(r.added ? t('أُضيف إلى قائمتك', 'Added to your list') : t('أُزيل من قائمتك', 'Removed from your list'));
  }, [say]);

  useEffect(() => {
    const name = t('فهرس مون', 'Moon Catalogue');
    const titles: Record<View['mode'], string> = {
      home: name, search: `${t('نتائج البحث', 'Search results')} — ${name}`, work: name, person: name,
      subject: name, hub: name, place: view.mode === 'place' ? `${view.key} — ${name}` : name,
      publisher: 'key' in view ? `${view.key} — ${name}` : name, series: 'key' in view ? `${view.key} — ${name}` : name, genre: 'key' in view ? `${view.key} — ${name}` : name, authors: `${t('المؤلفون', 'Authors')} — ${name}`, subjects: `${t('الموضوعات', 'Subjects')} — ${name}`,
    };
    // A record page sets its own title (the book's), with its schema.org data.
    if (view.mode !== 'work') document.title = titles[view.mode];
  }, [view, lang]);

  const ctx: Ctx = { go, saved, toggleSave, say, rev };

  return (
    <div className="app" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} key={lang}>
      <div className="ambient" aria-hidden="true" />
      <header className="topbar wrap">
        <div className="topbar-inner glass">
          <button className="brand" onClick={() => { go({ mode: 'home' }); window.dispatchEvent(new CustomEvent('moon-replay-entrance')); }} aria-label={t('فهرس مون، الصفحة الرئيسية', 'Moon Catalogue, home')}>
            <img className="brand-logo" src="/opac-logo.png" alt={t('مون', 'Moon')} width={230} height={120} />
          </button>
          <nav className={`nav ${navOpen ? 'open glass' : ''}`} aria-label={t('الأقسام', 'Sections')}>
            {([
              [t('الرئيسية', 'Home'), { mode: 'home' }, view.mode === 'home'],
              [t('الكتب', 'Books'), { mode: 'search', query: '' }, view.mode === 'search' || view.mode === 'work'],
              [t('المؤلفون', 'Authors'), { mode: 'authors' }, view.mode === 'authors' || view.mode === 'person'],
              [t('الموضوعات', 'Subjects'), { mode: 'subjects' }, view.mode === 'subjects' || view.mode === 'subject'],
            ] as [string, View, boolean][]).map(([label, target, current]) => (
              <button key={label} aria-current={current ? 'page' : undefined} onClick={() => go(target)}>
                {current && <span className="nav-pill" aria-hidden="true" />}
                <span className="nav-label">{label}</span>
              </button>
            ))}
          </nav>
          <div className="top-actions">
            <button className="icon-btn" onClick={() => setSavedOpen(true)} aria-label={t(`قائمتي، ${saved.length} كتاب`, `My list, ${saved.length} books`)}>
              <Bookmark size={20} strokeWidth={1.8} />
              {saved.length > 0 && <span className="badge">{saved.length}</span>}
            </button>
            <button className="btn-ghost lang-switch" onClick={switchLang} lang={lang === 'ar' ? 'en' : 'ar'}
              aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}>{lang === 'ar' ? 'English' : 'العربية'}</button>
            <button className="btn-ghost sign-in" onClick={() => { reportAction('sign_in'); onOpenEditor?.(); }}>{t('دخول', 'Sign in')}</button>
            <button className="btn-black" onClick={() => { reportAction('sign_up'); window.location.href = '/moon/?signup=1'; }}>{t('إنشاء حساب', 'Sign up')}</button>
            <button className="icon-btn menu-toggle" onClick={() => setNavOpen(o => !o)} aria-expanded={navOpen} aria-label={t('القائمة', 'Menu')}>
              {navOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      <main>
        {!ready ? <Loading /> : (
          <div className="view" key={viewKey(view)}>
            {view.mode === 'home' && <Home ctx={ctx} />}
            {view.mode === 'search' && <Results key={view.query} ctx={ctx} query={view.query} />}
            {view.mode === 'work' && <WorkPage key={view.id} ctx={ctx} id={view.id} />}
            {view.mode === 'person' && <PersonPage key={view.key} ctx={ctx} k={view.key} />}
            {view.mode === 'subject' && <SubjectPage key={view.key} ctx={ctx} k={view.key} />}
            {view.mode === 'hub' && <HubPage key={view.key} ctx={ctx} k={view.key} />}
            {view.mode === 'place' && <PlacePage key={view.key} ctx={ctx} k={view.key} />}
            {(view.mode === 'publisher' || view.mode === 'series' || view.mode === 'genre') && <GroupPage key={`${view.mode}:${view.key}`} ctx={ctx} kind={view.mode} k={view.key} />}
            {view.mode === 'authors' && <AuthorsPage ctx={ctx} />}
            {view.mode === 'subjects' && <SubjectsPage ctx={ctx} />}
          </div>
        )}
      </main>

      <footer className="footer wrap">
        <div className="footer-inner glass">
          <span className="footer-brand"><img src="/opac-logo.png" alt={t('مون', 'Moon')} width={230} height={120} /> {t('الفهرس العام للمكتبة', 'The library’s public catalogue')}</span>
          <span>{ready ? t(`${wolfMoonOpacService.getAllWorks().length} كتاب منشور`, `${wolfMoonOpacService.getAllWorks().length} published books`) : ''}</span>
        </div>
      </footer>

      {savedOpen && <SavedSheet ctx={ctx} onClose={() => setSavedOpen(false)} />}
      {toast && <div className="toast glass" role="status">{toast}</div>}
    </div>
  );
}

type Ctx = {
  go: (v: View) => void;
  saved: string[];
  toggleSave: (id: string) => void;
  say: (m: string) => void;
  rev: number;
};

// ---------------------------------------------------------------------------
// Shared pieces

function coverUrlOf(work: OpacWorkEntity): string | undefined {
  return work.coverUrl || resolveWorkCover(work) || work.instances.find(i => i.coverUrl)?.coverUrl || undefined;
}

/** A record without a cover image gets a typographic jacket (title + author); tiny thumbnails get a plain moon. */
function Cover({ work, big, jacket = true, morph = true }: { work: OpacWorkEntity; big?: boolean; jacket?: boolean; morph?: boolean }) {
  const url = coverUrlOf(work);
  const [broken, setBroken] = useState(false);
  return (
    <div className={`cover ${big ? 'big' : ''}`} style={morph ? { viewTransitionName: vtName('cover', work.id) } as React.CSSProperties : undefined}>
      {url && !broken ? (
        <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <div className={`cover-blank ${jacket ? 'with-title' : ''}`} aria-hidden="true">
          {jacket ? (
            <>
              <span className="ct" dir="auto">{work.title}</span>
              {big ? <span className="ca" dir="auto">{personName(work.primaryCreator)}</span> : <span className="cover-moon small" />}
            </>
          ) : <span className="cover-moon" />}
        </div>
      )}
    </div>
  );
}

/** A view-transition-name must be a CSS identifier and unique on the page; record ids are neither guaranteed to be. */
function vtName(kind: string, id: string): string {
  return `${kind}-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

const stagger = (i = 0) => ({ '--i': Math.min(i, 12) } as React.CSSProperties);

function BookCard({ work, ctx, i, showAdded }: { work: OpacWorkEntity; ctx: Ctx; i?: number; showAdded?: boolean }) {
  return (
    <button className="book glass rise" style={stagger(i)} onClick={() => ctx.go({ mode: 'work', id: work.id })}>
      <Cover work={work} />
      <div className="book-meta">
        {coverUrlOf(work) && <div className="t" dir="auto">{work.title}</div>}
        <div className="a" dir="auto">{personName(work.primaryCreator)}</div>
        {workYear(work) && <div className="y">{workYear(work)}</div>}
        {showAdded && addedOn(work.createdAt, opacLang()) && <div className="y">{t('أُضيف', 'Added')} {addedOn(work.createdAt, opacLang())}</div>}
      </div>
    </button>
  );
}

/** What the catalogue knows about a person, for finding their Wikidata item. */
function personClues(p: OpacPersonEntity): PersonClues {
  const headings = [p.name, p.nameArabic, p.nameEnglish, ...(p.otherNames || [])].filter((x): x is string => !!x);
  const dated = headings.map(splitHeading).find((h) => h.birthYear);
  const base = splitHeading(personName(p));
  return {
    name: base.name,
    otherNames: headings.map((h) => splitHeading(h).name),
    wikidata: p.wikidataId,
    links: p.authorityLinks,
    birthYear: p.birthDate?.match(/\d{3,4}/)?.[0] || dated?.birthYear,
    deathYear: p.deathDate?.match(/\d{3,4}/)?.[0] || dated?.deathYear,
  };
}

/** The person's Wikidata item as a link (found from their links, or their name and dates), or undefined. */
function usePersonWikidata(p: OpacPersonEntity | undefined): string | undefined {
  const clues = p ? personClues(p) : undefined;
  const key = clues ? JSON.stringify(clues) : '';
  const [qid, setQid] = useState<string | null>(null);
  useEffect(() => {
    if (!clues) { setQid(null); return; }
    let live = true;
    findPersonQid(clues).then((q) => { if (live) setQid(q); });
    return () => { live = false; };
  }, [key]);
  return qid ? `https://www.wikidata.org/wiki/${qid}` : undefined;
}

function Avatar({ p, cls = '', morph, image }: { p: OpacPersonEntity; cls?: string; morph?: boolean; image?: string }) {
  const [broken, setBroken] = useState(false);
  const wikidata = usePersonWikidata(image ? undefined : p);
  const card = useWikidataCard(wikidata ? [wikidata] : [], 'person');
  const src = image || card?.image || p.avatarUrl;
  useEffect(() => setBroken(false), [src]);
  return (
    <span className={`avatar ${cls}`} aria-hidden="true" style={morph ? { viewTransitionName: vtName('avatar', p.id) } as React.CSSProperties : undefined}>
      {src && !broken ? <img src={src} alt="" onError={() => setBroken(true)} /> : initial(personName(p))}
    </span>
  );
}

function PersonCard({ p, ctx, i }: { p: OpacPersonEntity; ctx: Ctx; i?: number }) {
  return (
    <button className="person glass rise" style={stagger(i)} onClick={() => ctx.go({ mode: 'person', key: p.id })}>
      <Avatar p={p} morph />
      <span>
        <span className="t" dir="auto" style={{ display: 'block' }}>{personName(p)}</span>
        <span className="s">{p.lifespan ? `${p.lifespan} · ` : ''}{p.worksCount} {p.worksCount === 1 ? t('كتاب', 'book') : t('كتب', 'books')}</span>
      </span>
    </button>
  );
}

function SearchBox({ ctx, initial = '', autoFocus, compact }: { ctx: Ctx; initial?: string; autoFocus?: boolean; compact?: boolean }) {
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); inputRef.current?.focus(); }
    };
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, []);

  const s = useMemo(() => (q.trim() ? wolfMoonOpacService.deepCategorizedSearch(q) : null), [q, ctx.rev]);
  const items = useMemo(() => {
    if (!s) return [] as { kind: string; label: string; sub: string; view: View }[];
    return [
      ...s.works.slice(0, 5).map(w => ({ kind: t('الكتب', 'Books'), label: w.title, sub: personName(w.primaryCreator), view: { mode: 'work', id: w.id } as View })),
      ...s.persons.slice(0, 3).map(p => ({ kind: t('المؤلفون', 'Authors'), label: personName(p), sub: t(`${p.worksCount} كتب`, `${p.worksCount} books`), view: { mode: 'person', key: p.id } as View })),
      ...s.subjects.slice(0, 4).map(x => ({ kind: t('الموضوعات', 'Subjects'), label: x.label, sub: t(`${x.worksCount} كتب`, `${x.worksCount} books`), view: { mode: 'subject', key: x.id } as View })),
    ];
  }, [s]);

  const submit = () => { setOpen(false); ctx.go({ mode: 'search', query: q.trim() }); };

  let lastKind = '';
  return (
    <div className="search" ref={ref} role="search">
      <form className={`search-field glass ${compact ? 'compact' : ''}`} onSubmit={e => { e.preventDefault(); active >= 0 && items[active] ? ctx.go(items[active].view) : submit(); }}>
        <Search size={22} strokeWidth={1.8} aria-hidden="true" />
        <label className="sr-only" htmlFor="opac-q">{t('ابحث في الفهرس', 'Search the catalogue')}</label>
        <input
          id="opac-q" ref={inputRef} value={q} autoFocus={autoFocus} autoComplete="off"
          placeholder={t('عنوان، مؤلف، موضوع، أو رقم ISBN', 'Title, author, subject or ISBN')}
          onChange={e => { setQ(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, -1)); }
            if (e.key === 'Escape') setOpen(false);
          }}
          role="combobox" aria-expanded={open && items.length > 0} aria-controls="opac-suggest"
        />
        <span className="kbd" aria-hidden="true">/</span>
        <button type="submit" className="btn-black">{t('بحث', 'Search')}</button>
      </form>
      {open && s && (
        <div className="suggest glass" id="opac-suggest" role="listbox">
          {items.length === 0 && <div className="suggest-head">{t(`لا نتائج لـ «${q}». جرّب كلمة أقصر أو اسم المؤلف.`, `No results for “${q}”. Try a shorter word or the author's name.`)}</div>}
          {items.map((it, i) => {
            const head = it.kind !== lastKind ? it.kind : null;
            lastKind = it.kind;
            return (
              <React.Fragment key={i}>
                {head && <div className="suggest-head">{head}</div>}
                <button type="button" role="option" aria-selected={i === active} data-active={i === active} className="suggest-item" onMouseEnter={() => setActive(i)} onClick={() => { setOpen(false); ctx.go(it.view); }}>
                  <span className="t">{it.label}</span>
                  <span className="s">{it.sub}</span>
                </button>
              </React.Fragment>
            );
          })}
          {items.length > 0 && <button type="button" className="suggest-all" onClick={submit}>{t(`كل النتائج لـ «${q.trim()}»`, `All results for “${q.trim()}”`)}</button>}
        </div>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label={t('جارٍ تحميل الفهرس', 'Loading the catalogue')}>
      <div className="hero">
        <div className="skeleton" style={{ height: 64, maxWidth: 520, margin: '0 auto' }} />
        <div className="skeleton" style={{ height: 68, maxWidth: 720, margin: '40px auto 0' }} />
      </div>
      <div className="shelf">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ aspectRatio: '2/3.6' }} />)}
      </div>
    </div>
  );
}

function Crumbs({ ctx, items }: { ctx: Ctx; items: { label: string; view?: View }[] }) {
  return (
    <nav className="crumbs" aria-label={t('المسار', 'Breadcrumbs')}>
      <button onClick={() => ctx.go({ mode: 'home' })}>{t('الرئيسية', 'Home')}</button>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          <span aria-hidden="true">/</span>
          {it.view ? <button onClick={() => ctx.go(it.view!)}>{it.label}</button> : <span aria-current="page">{it.label}</span>}
        </React.Fragment>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Home

function Shelf({ title, works, ctx, more, showAdded }: { title: string; works: OpacWorkEntity[]; ctx: Ctx; more?: { label: string; view: View }; showAdded?: boolean }) {
  if (!works.length) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {more && <button className="link-btn" onClick={() => ctx.go(more.view)}>{more.label}</button>}
      </div>
      <div className="shelf">{works.map((w, i) => <BookCard key={w.id} work={w} ctx={ctx} i={i} showAdded={showAdded} />)}</div>
    </section>
  );
}

interface AskReply { answer: string; sources: Array<{ id: string; title: string; url: string }>; searched: string[]; noSource: boolean }

/**
 * Ask Moon (S15): a reader asks in their own words; Moon answers only from its own records, with links to
 * them and a line saying how it searched. Shown only when the server has it switched on.
 */
function AskMoon({ ctx }: { ctx: Ctx }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<AskReply | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch(`${MOON_API}/ask`, { headers: moonHeaders() }).then(r => (r.ok ? r.json() : null)).then(j => setEnabled(!!j?.enabled)).catch(() => {});
  }, []);
  if (!enabled) return null;
  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 3 || busy) return;
    setBusy(true); setError(''); setReply(null);
    try {
      const r = await fetch(`${MOON_API}/ask`, { method: 'POST', headers: moonHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ question: q.trim() }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) setError(j?.error || t('تعذّر الجواب الآن.', 'Could not answer just now.'));
      else setReply(j);
    } catch { setError(t('تعذّر الاتصال.', 'Could not connect.')); }
    setBusy(false);
  };
  // The answer cites records as [id]: each becomes a link to that record in the catalogue.
  const withLinks = (text: string) => text.split(/(\[[^\]]+\])/).map((part, i) => {
    const id = part.match(/^\[([^\]]+)\]$/)?.[1];
    const src = id && reply?.sources.find(s => s.id === id);
    return src ? <button key={i} className="inline-link" onClick={() => ctx.go({ mode: 'work', id: src.id })}>[{src.title}]</button> : <React.Fragment key={i}>{part}</React.Fragment>;
  });
  if (!open) {
    return (
      <div className="quick">
        <button className="chip" onClick={() => { reportAction('ask_moon'); setOpen(true); }}>✦ {t('اسأل مون بكلماتك', 'Ask Moon in your own words')}</button>
      </div>
    );
  }
  return (
    <section className="glass" style={{ marginTop: 14, padding: '14px 16px', borderRadius: 16, textAlign: 'start' }} aria-label={t('اسأل مون', 'Ask Moon')}>
      <form onSubmit={ask} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} maxLength={500} dir="auto" autoFocus
          placeholder={t('مثال: ما الكتب التي عندكم عن تاريخ بغداد؟', 'e.g. What books do you have on the history of Baghdad?')}
          aria-label={t('سؤالك', 'Your question')}
          style={{ flex: 1, minWidth: 220, font: 'inherit', padding: '8px 12px', borderRadius: 12, border: '1px solid #fff', background: 'rgba(255,255,255,.85)' }} />
        <button className="btn-black" type="submit" disabled={busy || q.trim().length < 3}>{busy ? t('أبحث…', 'Searching…') : t('اسأل', 'Ask')}</button>
      </form>
      <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>{t('يجيب مون من تسجيلات فهرسه وحدها، بمساعدة Claude، ويذكر مصادره. تحقق دائماً من التسجيلة نفسها.', "Moon answers from its own catalogue records only, with Claude's help, and names its sources. Always check the record itself.")}</p>
      {error && <p className="muted" role="alert" style={{ marginTop: 8 }}>{error}</p>}
      {reply && (
        <div style={{ marginTop: 10 }} aria-live="polite">
          <p dir="auto" style={{ margin: 0 }}>{withLinks(reply.answer)}</p>
          {reply.sources.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingInlineStart: 18 }}>
              {reply.sources.map(s => <li key={s.id}><button className="inline-link" dir="auto" onClick={() => ctx.go({ mode: 'work', id: s.id })}>{s.title}</button></li>)}
            </ul>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }} dir="auto">{t('كيف بحثت: ', 'How I searched: ')}{reply.searched.map(x => `«${x}»`).join(t('، ', ', '))}</p>
        </div>
      )}
    </section>
  );
}

function Home({ ctx }: { ctx: Ctx }) {
  const works = useMemo(() => wolfMoonOpacService.getAllWorks(), [ctx.rev]);
  const recent = useMemo(() => recentShelf(works, w => !!coverUrlOf(w), 12), [works]);
  const authors = useMemo(() => wolfMoonOpacService.getAllPersons().filter(p => p.worksCount > 0).slice(0, 8), [ctx.rev]);
  const subjects = useMemo(() => wolfMoonOpacService.getAllSubjects().filter(s => s.worksCount > 0 && isReadableLabel(s.label)).slice(0, 14), [ctx.rev]);
  // Libris's home: categories to start from, then shelves.
  const categories = useMemo(() => facetCounts(works, {}).category.slice(0, 8), [works]);
  const manuscripts = useMemo(() => works.filter(w => /مخطوط|manuscript/i.test([...(w.genreForm || []), ...valuesOf(w, 'format')].join(' '))).slice(0, 12), [works]);
  const withCopies = useMemo(() => works.filter(w => realCopies(w).length > 0).slice(0, 12), [works]);
  const featured = useMemo(() => {
    const top = [...wolfMoonOpacService.getAllPersons()].filter(p => p.worksCount > 1).sort((a, b) => b.worksCount - a.worksCount)[0];
    return top ? { person: top, works: wolfMoonOpacService.getPersonByNameOrUri(top.id)?.works.slice(0, 12) || [] } : null;
  }, [ctx.rev]);
  const languages = useMemo(() => facetCounts(works, {}).lang.slice(0, 6), [works]);

  return (
    <>
      <section className="hero wrap">
        <h1>{t('اعثر على كتابك التالي', 'Find your next book')}</h1>
        <p className="hero-sub">{t(`ابحث في ${works.length} كتاباً بالعنوان أو المؤلف أو الموضوع، واعرف أين تجده في المكتبة.`, `Search ${works.length} books by title, author or subject, and find where they are in the library.`)}</p>
        <SearchBox ctx={ctx} />
        <AskMoon ctx={ctx} />
        {categories.length > 0 && (
          <div className="quick" aria-label={t('الفئات', 'Categories')}>
            <span className="quick-lbl">{t('الفئات', 'Categories')}</span>
            {categories.map(c => (
              <button key={c.value} className="chip" onClick={() => ctx.go({ mode: 'search', query: '', params: `f_category=${encodeURIComponent(c.value)}` })}>
                {c.label} <span className="n">{c.count}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="wrap">
        <Shelf title={t('أُضيف حديثاً', 'Recently added')} works={recent} ctx={ctx} showAdded more={{ label: t('كل الكتب', 'All books'), view: { mode: 'search', query: '', params: 'sort=date-desc' } }} />
        {featured && featured.works.length > 1 && (
          <Shelf title={t(`من أعمال ${personName(featured.person)}`, `By ${personName(featured.person)}`)} works={featured.works} ctx={ctx} more={{ label: t('صفحة المؤلف', 'Author page'), view: { mode: 'person', key: featured.person.id } }} />
        )}
        <Shelf title={t('مخطوطات', 'Manuscripts')} works={manuscripts} ctx={ctx} />
        <Shelf title={t('على رفوف المكتبة', 'On the library shelves')} works={withCopies} ctx={ctx} more={{ label: t('كل ما له نسخ', 'Everything with copies'), view: { mode: 'search', query: '', params: 'f_avail=physical' } }} />

        {languages.length > 1 && (
          <section className="section">
            <div className="section-head"><h2>{t('حسب اللغة', 'By language')}</h2></div>
            <div className="subjects">
              {languages.map(l => (
                <button key={l.value} className="chip" onClick={() => ctx.go({ mode: 'search', query: '', params: `f_lang=${encodeURIComponent(l.value)}` })}>
                  {l.label} <span className="n">{l.count}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {authors.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>{t('مؤلفون في الفهرس', 'Authors in the catalogue')}</h2>
              <button className="link-btn" onClick={() => ctx.go({ mode: 'authors' })}>{t('كل المؤلفين', 'All authors')}</button>
            </div>
            <div className="people">{authors.map((p, i) => <PersonCard key={p.id} p={p} ctx={ctx} i={i} />)}</div>
          </section>
        )}

        {subjects.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>{t('تصفّح حسب الموضوع', 'Browse by subject')}</h2>
              <button className="link-btn" onClick={() => ctx.go({ mode: 'subjects' })}>{t('كل الموضوعات', 'All subjects')}</button>
            </div>
            <div className="subjects">
              {subjects.map(s => (
                <button key={s.id} className="chip" onClick={() => ctx.go({ mode: 'subject', key: s.id })}>
                  {s.label} <span className="n">{s.worksCount}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="section">
          <div className="linked-strip glass">
            <div>
              <h2>{t('الفهرس كبيانات مترابطة', 'The catalogue as linked data')}</h2>
              <p className="muted">{t('كل كتاب وشخص وموضوع هنا له عنوان دائم على mooon.site بصيغة BIBFRAME، يمكن للمكتبات والباحثين ربطه وإعادة استخدامه.', 'Every book, person and subject here has a permanent address on mooon.site in BIBFRAME, for libraries and researchers to link to and reuse.')}</p>
            </div>
            <div className="dl-links">
              <a href="/resource/">{t('قائمة السجلات', 'Record list')}</a>
              <a href="/resource/sparql">SPARQL</a>
              <a href="/resource/dump.jsonld">{t('تنزيل الفهرس (JSON-LD)', 'Download the catalogue (JSON-LD)')}</a>
              <a href="/resource/dump.nt">N-Triples</a>
              <a href="/api.html">واجهة البرمجة (API)</a>
              <a href="/learn.html">{t('تعلّم الفهرسة في مون', 'Learn cataloguing in Moon')}</a>
              <a href="/marc.html">{t('أين حقل مارك؟', 'Where is my MARC field?')}</a>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Search results

const PAGE_SIZE = 20;
const RESULTS_KEY = 'moon-opac:last-results';

// The first 100 results as the reader saw them, each as the ids of the records inside it, so a result
// that is opened can be reported with its place in the list (see insights.ts).
const ORDER_KEY = 'moon-opac:displayed-order';
function readDisplayedOrder(): string[][] {
  try { const v = JSON.parse(sessionStorage.getItem(ORDER_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** The result list a record page was opened from, so it can offer "previous / next result". */
export function lastResults(): { ids: string[]; url: string; query: string } | null {
  try { return JSON.parse(sessionStorage.getItem(RESULTS_KEY) || 'null'); } catch { return null; }
}

function holdingsSummary(w: OpacWorkEntity): { text: string; s: string } {
  const copies = realCopies(w);
  const libs = new Set(copies.map(c => libraryOf(c.heldBy)).filter(Boolean)).size;
  if (valuesOf(w, 'avail').includes('online')) return { text: t('متاح على الإنترنت', 'Available online'), s: 'digital_access' };
  if (copies.length) {
    const c = copies.length === 1 ? t('نسخة واحدة', '1 copy') : copies.length === 2 ? t('نسختان', '2 copies') : t(`${copies.length} نسخ`, `${copies.length} copies`);
    return { text: libs > 1 ? `${c} · ${t(`${libs} مكتبات`, `${libs} libraries`)}` : c, s: 'available' };
  }
  return { text: t('لا نسخ مسجلة', 'No copies recorded'), s: 'not_connected' };
}

function contributorsLine(w: OpacWorkEntity): React.ReactNode[] {
  const main = personName(w.primaryCreator);
  const others = (w.contributors || []).filter(c => c !== w.primaryCreator && personName(c) && personName(c) !== main);
  const parts: React.ReactNode[] = [];
  if (main) parts.push(<span key="m" className="who">{main}</span>);
  others.slice(0, 2).forEach((c, i) => parts.push(
    <span key={i} className="who">{personName(c)}{c.role && roleLabel(c.role) ? <span className="role"> ({roleLabel(c.role)})</span> : null}</span>,
  ));
  if (others.length > 2) parts.push(<span key="more" className="more">+{others.length - 2}</span>);
  return parts;
}

/** One result, as Libris shows it: category · language, the title, who made it (with roles), format · year, holdings. */
function ResultCard({ w, ctx, i }: { w: OpacWorkEntity; ctx: Ctx; i: number }) {
  const meta = whatItIs(w);
  const year = workYearOf(w);
  const h = holdingsSummary(w);
  const who = contributorsLine(w);
  return (
    <button className="row result glass rise" style={stagger(i)} onClick={() => ctx.go({ mode: 'work', id: w.id })}>
      <Cover work={w} jacket={false} />
      <div style={{ minWidth: 0 }}>
        {meta && <div className="kicker">{meta}</div>}
        <div className="t" dir="auto">{w.title}{w.subtitle ? <span className="sub"> : {w.subtitle}</span> : null}</div>
        {w.expressionOfHub?.label && <div className="hub" dir="auto">{t('من العمل:', 'From the work:')} <span className="inline-link" role="link" tabIndex={0} onClick={(e) => { e.stopPropagation(); ctx.go({ mode: 'hub', key: w.expressionOfHub!.uri }); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); ctx.go({ mode: 'hub', key: w.expressionOfHub!.uri }); } }}>{w.expressionOfHub.label}</span></div>}
        {who.length > 0 && <div className="s" dir="auto">{who.reduce<React.ReactNode[]>((a, n, k) => (k ? [...a, t('، ', ', '), n] : [n]), [])}</div>}
        {year ? <div className="m">{year}</div> : null}
      </div>
      <div className="side">
        <span className="status" data-s={h.s}>{h.text}</span>
      </div>
    </button>
  );
}

/** Under a grouped result: the other records of the same Work (editions, translations), one line each. */
function ClusterEditions({ members, evidence, ctx }: { members: OpacWorkEntity[]; evidence?: string[]; ctx: Ctx }) {
  const langs = new Set(members.map(w => w.language));
  const formats = formatChips(members);
  const lines = editionLines(members);
  const label = langs.size > 1
    ? t(`${members.length} طبعات وترجمات لهذا العمل`, `${members.length} editions and translations of this work`)
    : t(`${members.length} طبعات لهذا العمل`, `${members.length} editions of this work`);
  return (
    <details className="cluster glass" style={{ marginTop: -6, padding: '8px 16px', borderRadius: 14 }}>
      <summary style={{ cursor: 'pointer', fontSize: 14 }}>
        {label}
        {formats.length > 1 && formats.map(f => <span key={f} className="chip" style={{ marginInlineStart: 8, padding: '2px 10px', fontSize: 12 }}>{f}</span>)}
      </summary>
      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
        {lines.map(({ edition: w, line }) => {
          return (
            <li key={w.id} style={{ padding: '4px 0' }}>
              <button className="inline-link" dir="auto" onClick={() => ctx.go({ mode: 'work', id: w.id })}>{w.title}</button>
              {line && <span className="muted" dir="auto"> — {line}</span>}
            </li>
          );
        })}
      </ul>
      {!!evidence?.length && (
        <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
          {t('جُمعت لأن: ', 'Grouped because: ')}{evidence.map(evidenceText).join(t('، ', '; '))}
        </p>
      )}
    </details>
  );
}

/** Why records were grouped, in the reader's language. */
function evidenceText(e: string): string {
  const ar: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^Same title$/, () => 'العنوان نفسه'],
    [/^Nearly the same title$/, () => 'العنوان نفسه تقريبًا'],
    [/^Same creator \((.*)\)$/, m => `المؤلف نفسه (${m[1]})`],
    [/^Probably the same creator/, () => 'المؤلف نفسه على الأرجح'],
    [/^Same hub/, () => 'المحور نفسه'],
    [/^Linked as a translation/, () => 'إحداهما ترجمة الأخرى أو طبعة منها'],
    [/^Joined by a cataloguer(?: \((.*)\))?$/, m => `جمعها مفهرس${m[1] ? ` (${m[1]})` : ''}`],
    [/^Creators written in different scripts$/, () => 'اسم المؤلف بخطين مختلفين'],
    [/^Only one record names a creator$/, () => 'تسجيلة واحدة فقط تذكر المؤلف'],
  ];
  if (opacLang() !== 'ar') return e;
  for (const [re, f] of ar) { const m = e.match(re); if (m) return f(m); }
  return e;
}

function FacetGroup({ title, k, values, sel, onToggle, needle, startOpen }: {
  title: string; k: FacetKey; values: FacetValue[]; sel: Selection; onToggle: (k: FacetKey, v: string) => void; needle: string; startOpen: boolean;
}) {
  const [more, setMore] = useState(false);
  const chosen = sel[k] || [];
  const shown = needle ? values.filter(v => normalizeArabic(v.label).includes(needle)) : values;
  if (!shown.length) return null;
  const list = more || needle ? shown : shown.slice(0, 6);
  return (
    <details className="group" open={startOpen || chosen.length > 0 || !!needle}>
      <summary><span>{title}</span>{chosen.length > 0 && <span className="badge">{chosen.length}</span>}</summary>
      <div className="opts">
        {list.map(o => {
          const on = chosen.includes(o.value);
          return (
            <button key={o.value} className="opt" role="checkbox" aria-checked={on} aria-pressed={on} disabled={!on && o.count === 0}
              onClick={() => onToggle(k, o.value)}>
              <span className="box" aria-hidden="true">{on ? '✓' : ''}</span>
              <span className="l" dir="auto">{o.label}</span>
              <span className="n">{o.count}</span>
            </button>
          );
        })}
        {!needle && shown.length > 6 && (
          <button className="opt-more" onClick={() => setMore(m => !m)}>{more ? t('عرض أقل', 'Show less') : t(`عرض المزيد (+${shown.length - 6})`, `Show more (+${shown.length - 6})`)}</button>
        )}
      </div>
    </details>
  );
}

function Results({ ctx, query }: { ctx: Ctx; query: string }) {
  const initial = useMemo(() => readState(new URLSearchParams(window.location.search)), [query]);
  const [sel, setSel] = useState<Selection>(initial.sel);
  const [sort, setSort] = useState<SortKey>(initial.sort);
  const partial = useMemo(() => (query.trim() ? wolfMoonOpacService.partialMatches(query, 6) : []), [query, ctx.rev]);
  const [page, setPage] = useState(initial.page);
  const [needle, setNeedle] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Every work matching the words, in order of relevance; the filters and the sort apply on top.
  const base = useMemo(
    () => wolfMoonOpacService.searchWorks(query, 'all', 'all', 'all', 'all', 'relevance', 1, 100000).works,
    [query, ctx.rev],
  );
  // Close matches (a word inside another word) by default; "exact words only" keeps whole words.
  const [exact, setExact] = useState(() => new URLSearchParams(window.location.search).get('exact') === '1');
  const matched = useMemo(() => (exact && query.trim() ? base.filter(w => exactMatch(w, query)) : base), [base, exact, query]);
  const filtered = useMemo(() => sortWorks(applyFacets(matched, sel), sort), [matched, sel, sort]);
  const counts = useMemo(() => facetCounts(matched, sel), [matched, sel]);
  // One result per Work (Libris): editions, translations and hub members fold under the best-placed record.
  const [grouped, setGrouped] = useState(() => new URLSearchParams(window.location.search).get('group') !== '0');
  const decisions = useWorkDecisions();
  const clusters = useMemo(() => (grouped ? clusterWorks(filtered, decisions) : filtered.map(w => ({ key: w.id, lead: w, members: [w], confidence: 1, evidence: [] as string[] }))), [filtered, grouped, decisions]);
  const pages = Math.max(1, Math.ceil(clusters.length / PAGE_SIZE));
  const shown = clusters.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);

  // The filters live in the address, so a filtered list can be shared, bookmarked and come back with Back.
  useEffect(() => {
    const p = writeState(new URLSearchParams(window.location.search), { sel, sort, page });
    if (grouped) p.delete('group'); else p.set('group', '0');
    if (exact) p.set('exact', '1'); else p.delete('exact');
    const url = `${window.location.pathname}?${p.toString()}`;
    if (url !== `${window.location.pathname}${window.location.search}`) history.replaceState(history.state, '', url);
    try { sessionStorage.setItem(RESULTS_KEY, JSON.stringify({ ids: filtered.map(w => w.id), url, query })); } catch { /* private mode */ }
  }, [sel, sort, page, filtered, query, grouped, exact]);

  // Remember the order the reader sees (for "which result did they open"), kept in this tab only.
  useEffect(() => {
    try { sessionStorage.setItem(ORDER_KEY, JSON.stringify(clusters.slice(0, 100).map(c => c.members.map(m => m.id)))); } catch { /* private mode */ }
  }, [clusters]);

  // Tell Moon (anonymously) what was searched and how many results it found, once the list has settled.
  const resultCount = clusters.length;
  const filterCount = Object.values(sel).reduce((a, v) => a + v.length, 0);
  useEffect(() => {
    if (!query.trim()) return;
    const timer = window.setTimeout(() => reportSearch(query, resultCount, document.documentElement.lang || 'ar', filterCount), 900);
    return () => window.clearTimeout(timer);
  }, [query, resultCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const onToggle = (k: FacetKey, v: string) => { reportAction('filter'); setSel(s => toggle(s, k, v)); setPage(1); };
  const clear = () => { setSel({}); setPage(1); };
  const chips = (Object.entries(sel) as [FacetKey, string[]][]).flatMap(([k, vs]) => vs.map(v => ({ k, v, label: valueLabel(k, v) })));
  const activeCount = chips.length;
  const n = normalizeArabic(needle.trim());

  return (
    <div className="wrap">
      <div className="page-head">
        <Crumbs ctx={ctx} items={[{ label: query ? t('نتائج البحث', 'Search results') : t('الكتب', 'Books') }]} />
        <h1 className="page-title">{query ? t(`نتائج «${query}»`, `Results for “${query}”`) : t('كل الكتب', 'All books')}</h1>
      </div>
      <div style={{ maxWidth: 720 }}><SearchBox ctx={ctx} initial={query} compact /></div>

      <div className="results-layout">
        <aside className={`filters glass ${showFilters ? 'open' : ''}`} aria-label={t('تضييق النتائج', 'Narrow the results')}>
          <div className="filters-head">
            <h2>{t('الفلاتر', 'Filters')}</h2>
            {activeCount > 0 && <button className="link-btn" onClick={clear}>{t('مسح الكل', 'Clear all')}</button>}
          </div>
          <label className="filter-search">
            <span className="sr-only">{t('ابحث في الفلاتر', 'Search the filters')}</span>
            <input value={needle} onChange={e => setNeedle(e.target.value)} placeholder={t('ابحث في الفلاتر…', 'Search the filters…')} />
          </label>
          {FACETS.map(({ key, title, en }, idx) => (
            <FacetGroup key={key} k={key} title={t(title, en)} values={counts[key]} sel={sel} onToggle={onToggle} needle={n} startOpen={idx < 4} />
          ))}
        </aside>

        <section aria-live="polite">
          <div className="results-bar glass">
            <span className="count">
              {t('عدد النتائج:', 'Results:')} {clusters.length}
              {grouped && clusters.length < filtered.length ? <span className="muted"> {t(`(${filtered.length} تسجيلة)`, `(${filtered.length} records)`)}</span> : null}
            </span>
            <label className="sort">
              <input type="checkbox" checked={grouped} onChange={e => { setGrouped(e.target.checked); setPage(1); }} />
              <span>{t('جمع الطبعات والترجمات', 'Group editions and translations')}</span>
            </label>
            {query.trim() && (
              <label className="sort" title={t('المطابقات القريبة تشمل الكلمة داخل كلمة أخرى', 'Close matches include a word inside another word')}>
                <input type="checkbox" checked={exact} onChange={e => { setExact(e.target.checked); setPage(1); }} />
                <span>{t('الكلمات كما هي فقط', 'Exact words only')}</span>
              </label>
            )}
            <button className="btn-ghost filters-toggle" aria-expanded={showFilters} onClick={() => setShowFilters(s => !s)}>
              {t('الفلاتر', 'Filters')}{activeCount ? ` (${activeCount})` : ''}
            </button>
            <label className="sort">
              <span>{t('الترتيب:', 'Sort:')}</span>
              <select className="select" value={sort} onChange={e => { setSort(e.target.value as SortKey); setPage(1); }}>
                {SORT_OPTIONS.map(s => <option key={s.v} value={s.v}>{t(s.l, s.en)}</option>)}
              </select>
            </label>
          </div>

          {chips.length > 0 && (
            <div className="chips" aria-label={t('الفلاتر المختارة', 'Chosen filters')}>
              {chips.map(c => (
                <button key={`${c.k}:${c.v}`} className="chip-x" onClick={() => onToggle(c.k, c.v)} aria-label={t(`إزالة ${c.label}`, `Remove ${c.label}`)}>
                  <span dir="auto">{c.label}</span><span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          )}

          {shown.length === 0 ? (
            <div className="empty glass">
              <h3>{t('لم نجد كتباً تطابق بحثك', 'No books match your search')}</h3>
              <p>{t('تأكد من الإملاء، أو ابحث باسم المؤلف وحده، أو أزل بعض الفلاتر.', 'Check the spelling, search by the author’s name alone, or remove some filters.')}</p>
              {!activeCount && partial.length > 0 && (
                <div className="partial">
                  <h4>{t('كتب فيها بعض كلماتك', 'Books that contain some of your words')}</h4>
                  <div className="shelf">{partial.map((w, i) => <BookCard key={w.id} work={w} ctx={ctx} i={i} />)}</div>
                </div>
              )}
              {activeCount ? <button className="btn-black" onClick={clear}>{t('إزالة الفلاتر', 'Remove filters')}</button> : <button className="btn-black" onClick={() => ctx.go({ mode: 'search', query: '' })}>{t('تصفّح كل الكتب', 'Browse all books')}</button>}
            </div>
          ) : (
            <div className="rows">
              {shown.map((c, i) => (
                <React.Fragment key={c.key}>
                  <ResultCard w={c.lead} ctx={ctx} i={i} />
                  {c.members.length > 1 && <ClusterEditions members={c.members} evidence={c.evidence} ctx={ctx} />}
                </React.Fragment>
              ))}
            </div>
          )}

          {pages > 1 && (
            <nav className="pager" aria-label={t('الصفحات', 'Pages')}>
              <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('السابق', 'Previous')}</button>
              {Array.from({ length: pages }).slice(0, 9).map((_, i) => (
                <button key={i} className="btn-ghost" aria-pressed={page === i + 1} aria-label={t(`الصفحة ${i + 1}`, `Page ${i + 1}`)} onClick={() => setPage(i + 1)}>{i + 1}</button>
              ))}
              <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>{t('التالي', 'Next')}</button>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Work page

function download(name: string, text: string, type: string) {
  if (/.(bib|ris)$/.test(name)) reportAction('export');
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * The record page's <head> for search engines: its title, description, canonical address, and the
 * book as schema.org JSON-LD. Put back to the catalogue's own when the page is left.
 */
function useRecordHead(work: OpacWorkEntity | undefined) {
  useEffect(() => {
    if (!work) return;
    const head = document.head;
    const meta = head.querySelector<HTMLMetaElement>('meta[name="description"]');
    const before = { title: document.title, description: meta?.content };
    const who = work.primaryCreator?.nameArabic || work.primaryCreator?.name;
    document.title = [work.title, who].filter(Boolean).join(' — ') + ` | ${t('فهرس مون', 'Moon Catalogue')}`;
    if (meta) meta.content = metaDescription(work);
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = pageUrl(work.id);
    const data = document.createElement('script');
    data.type = 'application/ld+json';
    data.id = 'schema-org-book';
    data.textContent = JSON.stringify(bookJsonLd(work));
    // The same Work as linked data, for crawlers and tools that follow rel="alternate".
    const uri = workUri(work);
    const alternates = uri ? ([['jsonld', 'application/ld+json'], ['ttl', 'text/turtle'], ['rdf', 'application/rdf+xml']] as const).map(([ext, type]) => {
      const l = document.createElement('link');
      l.rel = 'alternate';
      l.type = type;
      l.href = `${uri}.${ext}`;
      return l;
    }) : [];
    head.append(canonical, data, ...alternates);
    return () => {
      alternates.forEach((l) => l.remove());
      canonical.remove();
      data.remove();
      document.title = before.title;
      if (meta && before.description !== undefined) meta.content = before.description;
    };
  }, [work]);
}

/** "Result 3 of 15", previous / next, and back to the filtered list the record was opened from. */
function ResultNav({ ctx, id }: { ctx: Ctx; id: string }) {
  const last = lastResults();
  const idx = last ? last.ids.indexOf(id) : -1;
  if (!last || idx < 0) return null;
  const params = new URL(last.url, window.location.origin).searchParams;
  const back = () => ctx.go({ mode: 'search', query: last.query, params: params.toString() });
  const open = (k: number) => ctx.go({ mode: 'work', id: last.ids[k] });
  return (
    <nav className="result-nav glass" aria-label={t('التنقل بين النتائج', 'Move between results')}>
      <button className="link-btn" onClick={back}>{t('→ العودة إلى النتائج', '← Back to results')}</button>
      <span className="pos">{t(`النتيجة ${idx + 1} من ${last.ids.length}`, `Result ${idx + 1} of ${last.ids.length}`)}</span>
      <span className="pn">
        <button className="btn-ghost" disabled={idx <= 0} onClick={() => open(idx - 1)}>{t('السابق', 'Previous')}</button>
        <button className="btn-ghost" disabled={idx >= last.ids.length - 1} onClick={() => open(idx + 1)}>{t('التالي', 'Next')}</button>
      </span>
    </nav>
  );
}

/** Downloads the record as MARC 21 (ISO 2709), MARCXML or MarcEdit text, made from its stored BIBFRAME. */
async function downloadMarc(work: OpacWorkEntity, kind: 'mrc' | 'xml' | 'mrk', say: (s: string) => void) {
  reportAction('marc');
  try {
    const [{ bibframeToMarc }, marc] = await Promise.all([import('../services/marc/bibframeToMarc'), import('../services/marc/marcRecord')]);
    const [{ loadPreferredForms }, { agentUris, withPreferredNames }] = await Promise.all([import('../app/utils/preferredNames'), import('../services/nameForms')]);
    const doc = work.document && Array.isArray(work.document['@graph']) ? work.document : { '@graph': [] };
    const rec = bibframeToMarc(withPreferredNames(doc, await loadPreferredForms(agentUris(doc))), { recordId: work.id });
    if (kind === 'mrc') {
      const bytes = marc.toIso2709(rec);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/marc' }));
      a.download = `${work.id}.mrc`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (kind === 'xml') {
      download(`${work.id}.xml`, marc.toMarcXml([rec]), 'application/marcxml+xml');
    } else {
      download(`${work.id}.mrk`, marc.toMrk(rec), 'text/plain');
    }
  } catch {
    say(t('تعذّر إنشاء ملف MARC لهذا الكتاب', 'Could not make a MARC file for this book'));
  }
}

function WorkPage({ ctx, id }: { ctx: Ctx; id: string }) {
  const work = useMemo(() => wolfMoonOpacService.getWorkByIdOrUri(id), [id, ctx.rev]);
  useRecordHead(work);
  const related = useMemo(() => (work ? wolfMoonOpacService.getRelatedWorks(work.id, 6).filter(w => w.id !== work.id) : []), [work]);
  // Other works of the same hub: its translations, other editions, selections.
  const siblings = useMemo(() => (work?.expressionOfHub?.uri
    ? wolfMoonOpacService.getAllWorks().filter(w => w.id !== work.id && w.expressionOfHub?.uri === work.expressionOfHub!.uri)
    : []), [work]);
  const [citeOpen, setCiteOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // The other records of the same Work (S11 clustering): its editions and translations.
  const decisions = useWorkDecisions();
  const editions = useMemo(() => {
    if (!work) return [];
    const group = clusterWorks(wolfMoonOpacService.getAllWorks(), decisions).find(g => g.members.some(m => m.id === work.id));
    return group && group.members.length > 1 ? [work, ...group.members.filter(m => m.id !== work.id)] : [];
  }, [work, decisions]);
  // People named by the form a cataloguer preferred for the book's script (S10), from their Moon entities.
  const moonUri = (p?: OpacPersonEntity) => [p?.uri, p?.canonicalMoonUri, ...(p?.authorityLinks || [])].find(u => /\/resource\/agent\/[^/#]+$/.test(String(u || '')));
  const preferred = usePreferredForms(work ? [work.primaryCreator, ...(work.contributors || [])].map(moonUri).filter((u): u is string => !!u) : []);
  const script = useMemo(() => bookScript(work?.document), [work]);
  const shownName = (p: OpacPersonEntity) => { const u = moonUri(p); return (u && preferred.get(u)?.[script]) || personName(p); };

  if (!work) {
    return (
      <div className="wrap">
        <div className="page-head"><Crumbs ctx={ctx} items={[{ label: t('كتاب غير موجود', 'Book not found') }]} /></div>
        <div className="empty glass">
          <h3>{t('هذا الكتاب غير موجود في الفهرس', 'This book is not in the catalogue')}</h3>
          <p>{t('ربما حُذف أو لم يُنشر بعد. ابحث عنه بالعنوان.', 'It may have been removed or not published yet. Search for it by title.')}</p>
          <button className="btn-black" onClick={() => ctx.go({ mode: 'search', query: '' })}>{t('تصفّح كل الكتب', 'Browse all books')}</button>
        </div>
      </div>
    );
  }

  const inst = work.instances[0];
  const isSaved = ctx.saved.includes(work.id);
  const summary = work.summaryArabic || work.summaryEnglish;
  const copies = realCopies(work);
  const libraries = [...new Set(copies.map(c => libraryOf(c.heldBy)).filter(Boolean))];
  const online = valuesOf(work, 'avail').includes('online');
  // A musical work's maqām (S24) joins the plain "what it is" line.
  const maqam = maqamOf(work.document?.['@graph']?.find((n: any) => [].concat(n?.['@type'] || []).some((x: any) => /Work$/.test(String(x)))));
  const kicker = [whatItIs(work), maqam ? t(`مقام ${maqam.ar}`, `Maqām ${maqam.latn}`) : ''].filter(Boolean).join(' · ');
  const fmt = valueLabel('format', valuesOf(work, 'format')[0] || '');
  const year = workYearOf(work);
  const uri = workUri(work);
  const people = [work.primaryCreator, ...(work.contributors || [])]
    .filter((p, i, all) => p && personName(p) && all.findIndex(q => q && personName(q) === personName(p)) === i);
  const publisher = inst?.publisher || work.publisher?.name;
  const searchFor = (q: string) => ctx.go({ mode: 'search', query: q });

  const details: [string, React.ReactNode][] = ([
    [t('المساهمون والأدوار', 'Contributors and roles'), people.length ? (
      <span className="people">{people.map((p, i) => (
        <React.Fragment key={p.id || i}>
          {i > 0 && t('، ', ', ')}
          <button className="inline-link" dir="auto" onClick={() => ctx.go({ mode: 'person', key: p.id })}>{shownName(p)}</button>
          {roleLabel(p.role) && <span className="role"> ({roleLabel(p.role)})</span>}
          {p.lifespan && <span className="role"> {p.lifespan}</span>}
        </React.Fragment>
      ))}</span>
    ) : null],
    [t('العنوان', 'Title'), [work.title, work.subtitle].filter(Boolean).join(' : ')],
    [t('النشر', 'Publication'), (inst?.publicationPlace || publisher || inst?.publicationYear || work.originDate) ? (
      <span>
        {inst?.publicationPlace && placeName(inst.publicationPlace) && <button className="inline-link" dir="auto" onClick={() => ctx.go({ mode: 'place', key: placeName(inst.publicationPlace) })}>{inst.publicationPlace}</button>}
        {inst?.publicationPlace && !placeName(inst.publicationPlace) && <span dir="auto">{inst.publicationPlace}</span>}
        {inst?.publicationPlace && publisher && ' : '}
        {publisher && <button className="inline-link" dir="auto" onClick={() => ctx.go({ mode: 'publisher', key: publisher })}>{publisher}</button>}
        {(inst?.publicationYear || work.originDate) && <>{(inst?.publicationPlace || publisher) ? t('، ', ', ') : ''}{inst?.publicationYear || work.originDate}</>}
      </span>
    ) : null],
    [t('التاريخ بالتقويمين', 'In both calendars'), bothCalendars(readDate(String(inst?.publicationYear || work.originDate || '')), opacLang() === 'ar')],
    [t('الوصف المادي', 'Physical description'), [inst?.extent || work.extent, inst?.dimensions || work.dimensions].filter(Boolean).join(t(' ؛ ', ' ; '))],
    [t('السلسلة', 'Series'), work.series ? <button className="inline-link" dir="auto" onClick={() => ctx.go({ mode: 'series', key: seriesParts(work.series).name })}>{work.series}</button> : null],
    [t('المعرّفات', 'Identifiers'), [...new Set(work.instances.map(i => i.isbn).filter(Boolean))].map(x => `ISBN ${x}`).join(t('، ', ', '))],
    [t('التصنيف', 'Classification'), [work.classificationLcc && `${work.classificationLcc} (LCC)`, work.classificationDdc && `${work.classificationDdc} (${t('ديوي', 'Dewey')})`].filter(Boolean).join(t('، ', ', '))],
    [t('رقم الاستدعاء', 'Call number'), inst?.callNumber],
    [t('ملاحظات', 'Notes'), (work.notes || []).filter(Boolean).join(' — ')],
    [t('المحتويات', 'Contents'), work.tableOfContents],
    [t('رقم التسجيلة', 'Record number'), work.id],
  ] as [string, any][]).filter(([, v]) => v && (typeof v !== 'string' || v.trim()));
  const shownDetails = showAll ? details : details.slice(0, 6);

  const copyLink = async () => {
    reportAction('copy_link');
    await navigator.clipboard?.writeText(pageUrl(work.id)).catch(() => {});
    ctx.say(t('نُسخ رابط الكتاب', 'Link copied'));
  };

  return (
    <div className="wrap">
      <div className="page-head" style={{ paddingBottom: 0 }}>
        <Crumbs ctx={ctx} items={[{ label: t('الكتب', 'Books'), view: { mode: 'search', query: '' } }, { label: work.title }]} />
      </div>
      <ResultNav ctx={ctx} id={work.id} />

      <div className="work">
        <aside className="work-aside">
          <div className="frame glass"><Cover work={work} big /></div>
          <div className="actions glass">
            <button className="btn-black" onClick={() => { if (!isSaved) reportAction('save'); ctx.toggleSave(work.id); }} aria-pressed={isSaved}>
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                {isSaved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}{isSaved ? t('في قائمتك', 'In your list') : t('احفظ في قائمتك', 'Save to your list')}
              </span>
            </button>
            <button className="btn-ghost" onClick={() => { reportAction('cite'); setCiteOpen(true); }}><Quote size={16} />{t('استشهد', 'Cite')}</button>
            <button className="btn-ghost" onClick={copyLink}><Link2 size={16} />{t('انسخ الرابط', 'Copy link')}</button>
          </div>
        </aside>

        <div className="work-main">
          <section className="work-intro glass rise">
            {kicker && <div className="kicker">{kicker}</div>}
            <h1 className="page-title book-title">{work.title}</h1>
            {work.subtitle && <div className="subtitle">{work.subtitle}</div>}
            {people.length > 0 && (
              <div className="byline">
                {work.primaryCreator && personName(work.primaryCreator) && <Avatar p={work.primaryCreator} morph />}
                <div className="people">
                  {people.slice(0, 4).map((p, i) => (
                    <React.Fragment key={p.id || i}>
                      {i > 0 && t('، ', ', ')}
                      <HoverCard kind="person" k={p.id}><button onClick={() => ctx.go({ mode: 'person', key: p.id })} dir="auto">{shownName(p)}</button></HoverCard>
                      {roleLabel(p.role) && <span className="role"> ({roleLabel(p.role)})</span>}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
            <div className="pubfacts">
              {inst?.isbn && <div>ISBN {inst.isbn}{fmt ? ` · ${fmt}` : ''}</div>}
              {(publisher || year) && (
                <div>
                  {t('النشر:', 'Published:')} {inst?.publicationPlace ? (placeName(inst.publicationPlace)
                    ? <><button className="inline-link" onClick={() => ctx.go({ mode: 'place', key: placeName(inst.publicationPlace) })}>{inst.publicationPlace.replace(/\s*[:;]\s*$/, '')}</button>{' : '}</>
                    : `${inst.publicationPlace} : `) : ''}
                  {publisher ? <button className="inline-link" onClick={() => searchFor(publisher)}>{publisher}</button> : null}
                  {year ? `${t('، ', ', ')}${year}` : ''}
                </div>
              )}
              {(inst?.extent || work.extent) && <div>{inst?.extent || work.extent}</div>}
              {!inst?.isbn && fmt && <div>{fmt}</div>}
            </div>
            <div className="holdings-cta">
              {online || copies.length ? (
                <a className="btn-black" href="#h-where" onClick={(e) => { e.preventDefault(); document.getElementById('h-where')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                  {online ? t('متاح على الإنترنت', 'Available online') : `${t('نسخة ورقية', 'Print copy')} · ${libraries.length > 1 ? t(`${libraries.length} مكتبات`, `${libraries.length} libraries`) : (libraries[0] || t('المكتبة', 'The library'))}`}
                </a>
              ) : <span className="status" data-s="not_connected">{t('لا نسخ مسجلة بعد', 'No copies recorded yet')}</span>}
              {editions.length > 1 && <a className="btn-ghost" href="#h-group" onClick={(e) => { e.preventDefault(); document.getElementById('h-group')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{new Set(editions.map(e => e.language)).size > 1 ? t(`${editions.length} طبعات وترجمات`, `${editions.length} editions and translations`) : t(`${editions.length} طبعات`, `${editions.length} editions`)}</a>}
              {work.instances.length > 1 && <a className="btn-ghost" href="#h-eds" onClick={(e) => { e.preventDefault(); document.getElementById('h-eds')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{t(`${work.instances.length} طبعات`, `${work.instances.length} editions`)}</a>}
            </div>
            {(work.genreForm?.length || work.subjects.length) ? (
              <div className="terms">
                {work.genreForm && work.genreForm.length > 0 && (
                  <div><span className="lbl">{t('الفئة', 'Category')}</span>{work.genreForm.map(g => <button key={g} className="chip" onClick={() => ctx.go({ mode: 'genre', key: g })}>{g}</button>)}</div>
                )}
                {work.subjects.filter(s => isReadableLabel(s.label)).length > 0 && (
                  <div><span className="lbl">{t('الموضوع', 'Subject')}</span>{work.subjects.filter(s => isReadableLabel(s.label)).map(s => <HoverCard key={s.id} kind="subject" k={s.id}><button className="chip" onClick={() => ctx.go({ mode: 'subject', key: s.id })}>{s.label}</button></HoverCard>)}</div>
                )}
              </div>
            ) : null}
          </section>

          {summary && (
            <section className="panel glass rise" aria-labelledby="h-sum">
              <h2 id="h-sum">{t('نبذة', 'Summary')}</h2>
              <p className="summary">{summary}</p>
            </section>
          )}

          {details.length > 0 && (
            <section className="panel glass rise" aria-labelledby="h-det">
              <h2 id="h-det">{t('التفاصيل', 'Details')}</h2>
              <dl className="dl">
                {shownDetails.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
              </dl>
              {details.length > 6 && <button className="link-btn" onClick={() => setShowAll(s => !s)} style={{ marginTop: 12 }}>{showAll ? t('تفاصيل أقل', 'Fewer details') : t('كل التفاصيل', 'All details')}</button>}
            </section>
          )}

          <RelatedWorks work={work} ctx={ctx} />
          <IiifViewer urls={copies.map(c => c.accessUrl).filter((u): u is string => !!u)} />
          <section className="panel glass rise" aria-labelledby="h-where-t" id="h-where">
            <h2 id="h-where-t">{t('أين تجده', 'Where to find it')}</h2>
            {copies.length === 0 ? (
              <p className="muted">{t(`لم تُسجَّل نسخ لهذا الكتاب بعد. اسأل المكتبة عنه برقم التسجيلة ${work.id}.`, `No copies of this book are recorded yet. Ask the library for it by record number ${work.id}.`)}</p>
            ) : (
              <div className="libraries">
                {(libraries.length ? libraries : ['']).map(lib => {
                  const here = copies.filter(c => libraryOf(c.heldBy) === lib);
                  return (
                    <div key={lib || 'x'} className="library">
                      <div className="lib-name">{lib || t('المكتبة', 'The library')} <span className="n">{here.length === 1 ? t('نسخة واحدة', '1 copy') : here.length === 2 ? t('نسختان', '2 copies') : t(`${here.length} نسخ`, `${here.length} copies`)}</span></div>
                      {here.map(c => {
                        const where = String(c.heldBy || '').split(' — ').slice(1).join(' — ');
                        const s = c.status && c.status !== 'not_connected' ? c.status : 'not_connected';
                        return (
                          <div key={c.id} className="copy">
                            <span className="t">{[where, c.shelfMark && t(`الرف ${c.shelfMark}`, `Shelf ${c.shelfMark}`)].filter(Boolean).join(' · ') || t('نسخة', 'Copy')}</span>
                            <span className="status" data-s={s}>{s === 'not_connected' ? t('اسأل المكتبة عن إتاحتها', 'Ask the library if it is available') : STATUS_LABEL()[s] || s}</span>
                            <span className="m">{[c.copyNumber && t(`نسخة رقم ${c.copyNumber}`, `Copy ${c.copyNumber}`), c.barcode && t(`الباركود ${c.barcode}`, `Barcode ${c.barcode}`), ...(c.notes || [])].filter(Boolean).join(t('، ', ', '))}</span>
                            {c.accessUrl && <a className="link-btn" href={c.accessUrl} target="_blank" rel="noreferrer">{t('افتح النسخة الرقمية', 'Open the digital copy')}</a>}
                            {(c.binding || c.condition || c.marks?.length || c.actions?.length) ? (
                              <div className="m" style={{ marginTop: 4 }} dir="auto">
                                {c.binding && <div>{t('التجليد: ', 'Binding: ')}{c.binding}</div>}
                                {c.condition && <div>{t('الحالة: ', 'Condition: ')}{c.condition}</div>}
                                {(c.marks || []).map((m, i) => {
                                  const k = MARK_KINDS.find(x => x.id === m.kind);
                                  return <div key={i}>{k ? t(k.ar, k.en) : m.kind}: {m.text}{m.place ? ` (${m.place})` : ''}</div>;
                                })}
                                {(c.actions || []).map((a, i) => {
                                  const k = ITEM_ACTIONS.find(x => x.id === a.kind);
                                  return <div key={`a${i}`}>{k ? t(k.ar, k.en) : a.kind}{a.date ? ` · ${a.date}` : ''}{a.by ? ` · ${a.by}` : ''}</div>;
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <TransmissionChain copies={copies} />

          {(work.containedWorks || []).length > 0 && (
            <section className="panel glass rise" aria-labelledby="h-majmu">
              <h2 id="h-majmu">{t('الأعمال في هذا المجلد', 'Works in this volume')} <span className="count-n">{work.containedWorks!.length}</span></h2>
              <div className="copies">
                {work.containedWorks!.map((c, i) => {
                  const own = wolfMoonOpacService.getAllWorks().find(w => w.id !== work.id && normalizeArabic(w.title) === normalizeArabic(c.title));
                  return (
                    <div key={i} className="copy">
                      <span className="t" dir="auto">{own ? <button className="inline-link" onClick={() => ctx.go({ mode: 'work', id: own.id })}>{c.title}</button> : c.title}</span>
                      <span className="m" dir="auto">{[c.creator, c.locator].filter(Boolean).join(' · ')}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {work.instances.length > 1 && (
            <section className="panel glass rise" aria-labelledby="h-eds-t" id="h-eds">
              <h2 id="h-eds-t">{t('طبعات هذا العمل', 'Editions of this work')}</h2>
              <div className="copies">
                {work.instances.map(i => (
                  <div key={i.id} className="copy">
                    <span className="t">{[i.publicationPlace, i.publisher].filter(Boolean).join(' : ') || i.title}{i.publicationYear ? `${t('، ', ', ')}${i.publicationYear}` : ''}</span>
                    <span className="m">{[i.isbn && `ISBN ${i.isbn}`, i.extent].filter(Boolean).join(' · ')}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {editions.length > 1 && (
            <section className="panel glass rise" aria-labelledby="h-group-t" id="h-group">
              <h2 id="h-group-t">{new Set(editions.map(e => e.language)).size > 1 ? t('طبعات العمل وترجماته', 'Editions and translations of this work') : t('طبعات هذا العمل', 'Editions of this work')}</h2>
              <p className="muted">{t('ما يميّز كل طبعة عن الأخرى:', 'What sets each one apart:')}</p>
              <div className="copies">
                {editionLines(editions).map(({ edition: e, line }) => (
                  <div key={e.id} className="copy">
                    <span className="t" dir="auto">{e.id === work.id ? <b>{e.title} {t('(هذه)', '(this one)')}</b> : <button className="inline-link" onClick={() => ctx.go({ mode: 'work', id: e.id })}>{e.title}</button>}</span>
                    <span className="m" dir="auto">{line}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(() => {
            const shelf = shelfNeighbours(work, wolfMoonOpacService.getAllWorks(), 6);
            return shelf.length > 0 ? (
              <section className="panel glass rise" aria-labelledby="h-shelf">
                <h2 id="h-shelf">{t('على الرف بجانبه', 'On the shelf nearby')}</h2>
                <p className="muted">{t('كتب برقم استدعاء أو تصنيف قريب.', 'Books with a call number or class number next to this one.')}</p>
                <div className="rows">{shelf.map((w, i) => <ResultCard key={w.id} w={w} ctx={ctx} i={i} />)}</div>
              </section>
            ) : null;
          })()}

          {siblings.length > 0 && editions.length <= 1 && (
            <section className="panel glass rise" aria-labelledby="h-hub">
              <h2 id="h-hub">{t('من العمل نفسه', 'From the same work')}{work.expressionOfHub?.label ? <>: <button className="inline-link" onClick={() => ctx.go({ mode: 'hub', key: work.expressionOfHub!.uri })}>{work.expressionOfHub.label}</button></> : ''}</h2>
              <p className="muted">{t('ترجمات وطبعات أخرى مرتبطة بالمحور نفسه (bf:Hub).', 'Other translations and editions linked to the same hub (bf:Hub).')}</p>
              <div className="rows">{siblings.map((w, i) => <ResultCard key={w.id} w={w} ctx={ctx} i={i} />)}</div>
            </section>
          )}

          <section className="panel glass rise linked" aria-labelledby="h-ld">
            <h2 id="h-ld">{t('البيانات المترابطة', 'Linked data')}</h2>
            <div className="perma">
              <span className="lbl">{t('المعرّف الدائم', 'Permanent identifier')}</span>
              <a href={uri} dir="ltr">{uri}</a>
            </div>
            <div className="dl-links">
              <span className="lbl">{t('نزّل البيانات الوصفية', 'Download the metadata')}</span>
              <a href={`${uri}.jsonld`} target="_blank" rel="noreferrer">JSON-LD</a>
              <a href={`${uri}.ttl`} target="_blank" rel="noreferrer">Turtle</a>
              <a href={`${uri}.nt`} target="_blank" rel="noreferrer">N-Triples</a>
              <a href={`${uri}.rdf`} target="_blank" rel="noreferrer">RDF/XML</a>
              <button className="inline-link" onClick={() => downloadMarc(work, 'mrc', ctx.say)}>MARC 21 (ISO 2709)</button>
              <button className="inline-link" onClick={() => downloadMarc(work, 'xml', ctx.say)}>MARCXML</button>
              <button className="inline-link" onClick={() => downloadMarc(work, 'mrk', ctx.say)}>MarcEdit (.mrk)</button>
              <button className="inline-link" onClick={() => download(`${work.id}.bib`, wolfMoonOpacService.generateCitations(work).bibtex + '\n', 'application/x-bibtex')}>BibTeX (.bib)</button>
            </div>
            <div className="dl-links">
              <span className="lbl">{t('الترخيص', 'Licence')}</span>
              <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer license">{t('CC0 1.0 — ملك عام: انسخ وانشر بحرية', 'CC0 1.0 — public domain: copy and share freely')}</a>
            </div>
            <p className="muted">
              {t('كل ما في هذه الصفحة بيانات BIBFRAME مترابطة: لكل عمل وطبعة ونسخة وشخص وموضوع عنوان دائم على mooon.site، ويمكن الاستعلام عنها عبر', 'Everything on this page is linked BIBFRAME data: every work, edition, copy, person and subject has a permanent address on mooon.site, and can be queried with')}
              {' '}<a href="/resource/sparql">SPARQL</a> {t('أو تنزيل الفهرس كاملاً من', 'or downloaded in full from the')} <a href="/resource/">{t('قائمة السجلات', 'record list')}</a>.
            </p>
          </section>
        </div>
      </div>

      {related.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>{t('كتب قريبة منه', 'Related books')}</h2></div>
          <div className="shelf">{related.map((w, i) => <BookCard key={w.id} work={w} ctx={ctx} i={i} />)}</div>
        </section>
      )}

      {citeOpen && <CiteDialog work={work} ctx={ctx} onClose={() => setCiteOpen(false)} />}
    </div>
  );
}

function CiteDialog({ work, ctx, onClose }: { work: OpacWorkEntity; ctx: Ctx; onClose: () => void }) {
  const c = useMemo(() => wolfMoonOpacService.generateCitations(work), [work]);
  const [copied, setCopied] = useState<string | null>(null);
  useEscape(onClose);
  const rows: [string, string][] = [['APA', c.apa], ['Chicago', c.chicago], ['MLA', c.mla], ['BibTeX', c.bibtex]];
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog glass" role="dialog" aria-modal="true" aria-labelledby="cite-h">
        <div className="sheet-head">
          <h2 id="cite-h">{t('استشهد بهذا الكتاب', 'Cite this book')}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('إغلاق', 'Close')}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 14, color: 'var(--ink-3)', marginBottom: 6 }}>{k}</div>
              <div className="cite-row">
                <div className="cite" style={k === 'BibTeX' ? { direction: 'ltr', textAlign: 'left', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13, whiteSpace: 'pre-wrap' } : undefined}>{v}</div>
                <button className="icon-btn" aria-label={t(`انسخ ${k}`, `Copy ${k}`)} onClick={() => { navigator.clipboard?.writeText(v); setCopied(k); ctx.say(t(`نُسخ استشهاد ${k}`, `${k} citation copied`)); }}>
                  {copied === k ? <Check size={18} /> : <Copy size={18} />}
                </button>
                {k === 'BibTeX' && (
                  <button className="icon-btn" aria-label={t('نزّل ملف ‎.bib', 'Download the .bib file')} title=".bib"
                    onClick={() => { download(`${work.id}.bib`, v + '\n', 'application/x-bibtex'); ctx.say(t('نُزّل ملف ‎.bib', '.bib file downloaded')); }}>
                    <Download size={18} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function useEscape(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') fn(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [fn]);
}

// ---------------------------------------------------------------------------
// Person, subject, directories

/** Works as a list, newest first (Libris lists an entity's works this way). */
function WorkRows({ works, ctx }: { works: OpacWorkEntity[]; ctx: Ctx }) {
  const sorted = useMemo(() => sortWorks(works, 'date-desc'), [works]);
  return <div className="rows">{sorted.map((w, i) => <ResultCard key={w.id} w={w} ctx={ctx} i={i} />)}</div>;
}

/** The years a set of works spans, e.g. "1650–2026". */
function yearSpan(works: OpacWorkEntity[]): string {
  const ys = works.map(workYearOf).filter((y): y is number => !!y).sort((a, b) => a - b);
  if (!ys.length) return '';
  return ys[0] === ys[ys.length - 1] ? String(ys[0]) : `${ys[0]}–${ys[ys.length - 1]}`;
}

/** A Moon authority entry (mooon.site/resource/agent|topic|hub/…) whose name or variant is exactly this one. */
interface MoonEntry { id: string; uri: string; label: string; variants: string[]; sameAs: string[]; note?: string | null }
function useMoonAuthority(kind: 'agent' | 'topic' | 'hub' | 'place', name: string | undefined): MoonEntry | null {
  const [entry, setEntry] = useState<MoonEntry | null>(null);
  useEffect(() => {
    setEntry(null);
    const n = normalizeArabic(String(name || '').trim());
    if (!n) return;
    let live = true;
    const params = new URLSearchParams({ q: String(name), kind, limit: '5' });
    fetch(`${MOON_API}/authorities?${params}`, { headers: moonHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!live) return;
        const found = (d?.authorities || []).find((a: MoonEntry) =>
          [a.label, ...(a.variants || [])].some(x => normalizeArabic(x) === n));
        setEntry(found || null);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [kind, name]);
  return entry;
}

const SAME_AS_LABEL = (u: string) =>
  /viaf\.org/.test(u) ? 'VIAF' : /id\.loc\.gov/.test(u) ? t('مكتبة الكونغرس', 'Library of Congress') : /wikidata\.org/.test(u) ? t('ويكي بيانات', 'Wikidata') : /isni/.test(u) ? 'ISNI' : new URL(u).hostname;

/** The entity's own address and data, and where it links out to (owl:sameAs). */
/** What LC and Wikidata call these addresses, from Moon's label cache (S19); empty until it answers. */
function useOutsideLabels(uris: string[]): Record<string, OutsideLabel[]> {
  const wanted = [...new Set(uris.filter(u => outsideSource(canonicalOutside(u))).map(canonicalOutside))].sort().join(' ');
  const [labels, setLabels] = useState<Record<string, OutsideLabel[]>>({});
  useEffect(() => {
    if (!wanted) { setLabels({}); return; }
    let live = true;
    const qs = wanted.split(' ').map(u => `uri=${encodeURIComponent(u)}`).join('&');
    fetch(`${MOON_API}/labels?${qs}`, { headers: moonHeaders() }).then(r => (r.ok ? r.json() : null))
      .then(j => { if (live && j?.labels) setLabels(Object.fromEntries(Object.entries<any>(j.labels).map(([u, v]) => [u, v.labels || []]))); })
      .catch(() => {});
    return () => { live = false; };
  }, [wanted]);
  return labels;
}

function LinkedPanel({ uri, sameAs, note }: { uri?: string; sameAs: string[]; note?: string }) {
  const own = uri && uri.startsWith('https://mooon.site/resource/') ? uri : undefined;
  // One link per thing: …/wiki/Q1 and …/entity/Q1, http and https, a trailing slash are the same address.
  const sameKey = (u: string) => (outsideSource(canonicalOutside(u)) ? canonicalOutside(u) : u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''));
  const links = sameAs.filter(u => /^https?:\/\//.test(u)).filter((u, i, all) => all.findIndex(x => sameKey(x) === sameKey(u)) === i);
  const outside = useOutsideLabels(links);
  if (!own && !links.length) return null;
  return (
    <section className="panel glass rise linked" aria-labelledby="h-ld">
      <h2 id="h-ld">{t('البيانات المترابطة', 'Linked data')}</h2>
      {own && (
        <>
          <div className="perma"><span className="lbl">{t('المعرّف الدائم', 'Permanent identifier')}</span><a href={own} dir="ltr">{own}</a></div>
          <div className="dl-links">
            <span className="lbl">{t('نزّل', 'Download')}</span>
            <a href={`${own}.jsonld`} target="_blank" rel="noreferrer">JSON-LD</a>
            <a href={`${own}.ttl`} target="_blank" rel="noreferrer">Turtle</a>
            <a href={`${own}.nt`} target="_blank" rel="noreferrer">N-Triples</a>
            <a href={`${own}.rdf`} target="_blank" rel="noreferrer">RDF/XML</a>
          </div>
        </>
      )}
      {links.length > 0 && (
        <div className="dl-links">
          <span className="lbl">{t('الكيان نفسه في', 'Same entity in')}</span>
          {links.map(u => <a key={u} href={u} target="_blank" rel="noreferrer">{SAME_AS_LABEL(u)} <ArrowUpRight size={13} /></a>)}
        </div>
      )}
      {links.some(u => outside[canonicalOutside(u)]?.length) && (
        <div className="muted" style={{ fontSize: 13 }}>
          {links.filter(u => outside[canonicalOutside(u)]?.length).map(u => (
            <div key={u} dir="auto">{t(`تسمّيه ${SAME_AS_LABEL(u)}: `, `${SAME_AS_LABEL(u)} calls it: `)}<b>{pickLabel(outside[canonicalOutside(u)], opacLang() === 'ar' ? 'ar' : 'en')}</b></div>
          ))}
        </div>
      )}
      {note && <p className="muted">{note}</p>}
    </section>
  );
}

function PersonPage({ ctx, k }: { ctx: Ctx; k: string }) {
  const r = useMemo(() => wolfMoonOpacService.getPersonByNameOrUri(k), [k, ctx.rev]);
  const moon = useMoonAuthority('agent', r ? personName(r.person) : undefined);
  const found = usePersonWikidata(r ? { ...r.person, authorityLinks: [...(r.person.authorityLinks || []), ...(moon?.sameAs || [])] } : undefined);
  const fromMoon = [found, ...(r?.person.authorityLinks || []).filter((u) => !/mooon\.site/.test(u)), ...(moon?.sameAs || [])].filter((u): u is string => !!u);
  // The picture and the VIAF / LC / ISNI links come from the person's Wikidata entry, so they are real.
  const card = useWikidataCard(fromMoon, 'person');
  if (!r) return <NotFound ctx={ctx} what={t('المؤلف', 'author')} back={{ mode: 'authors' }} backLabel={t('كل المؤلفين', 'All authors')} />;
  const { person: p, works } = r;
  const name = personName(p);
  // Libris groups a person's works by what they did: wrote it, translated it, edited it …
  const roleIn = (w: OpacWorkEntity) => {
    if (personName(w.primaryCreator) === name) return roleLabel(w.primaryCreator.role) || AUTHOR_ROLE();
    const c = (w.contributors || []).find(x => personName(x) === name);
    return roleLabel(c?.role) || t('مشارك', 'Contributor');
  };
  const groups = new Map<string, OpacWorkEntity[]>();
  works.forEach(w => { const g = roleIn(w); groups.set(g, [...(groups.get(g) || []), w]); });
  const subjects = [...new Map(works.flatMap(w => w.subjects).filter(s => isReadableLabel(s.label)).map(s => [s.label, s])).values()].slice(0, 10);
  const langs = [...new Set(works.map(w => languageDisplay(languageName(w.languageLabel, w.language))).filter(Boolean))];
  const sameAs = [...new Set([...fromMoon, ...(card?.sameAs || [])])];
  const variants = (moon?.variants || []).filter(v => v !== name);
  const span = yearSpan(works);
  // Knowledge from the records (S14): books about them, their teachers and students from ijāzāt, places.
  const everything = wolfMoonOpacService.getAllWorks();
  const who = whoOf(p, variants, moon?.uri ? [moon.uri] : []);
  const about = aboutPerson(who, everything).filter(w => !works.some(x => x.id === w.id));
  const { teachers, students } = teachersAndStudents(who, everything);
  const places = personPlaces(who, works, everything).slice(0, 8);
  const openPerson = (l: KnowledgeLink) => {
    const known = wolfMoonOpacService.getPersonByNameOrUri(l.uri || l.label) || wolfMoonOpacService.getPersonByNameOrUri(l.label);
    ctx.go(known ? { mode: 'person', key: known.person.id } : { mode: 'search', query: l.label });
  };
  const KIND_WORD: Record<string, [string, string]> = { ijazah: ['إجازة', 'ijāzah'], sama: ['سماع', 'samāʿ'], qiraa: ['قراءة', 'qirāʾa'] };
  const linkChips = (list: KnowledgeLink[]) => (
    <div className="subjects">{list.map(l => (
      <button key={l.uri || l.label} className="chip" dir="auto" onClick={() => openPerson(l)} title={[t(...(KIND_WORD[l.kind] || [l.kind, l.kind])), l.date].filter(Boolean).join(' · ')}>{l.label}</button>
    ))}</div>
  );

  return (
    <div className="wrap">
      <div className="page-head" style={{ paddingBottom: 0 }}>
        <Crumbs ctx={ctx} items={[{ label: t('المؤلفون', 'Authors'), view: { mode: 'authors' } }, { label: name }]} />
      </div>
      <section className="person-hero glass rise">
        <Avatar p={p} cls="xl" morph image={card?.image} />
        <div>
          <div className="kicker">{t('شخص', 'Person')}</div>
          <h1 className="page-title">{name}</h1>
          <p className="lede">{[p.nameEnglish && p.nameEnglish !== name ? p.nameEnglish : '', p.lifespan, p.city].filter(Boolean).join(t('، ', ', '))}</p>
          {variants.length > 0 && <p className="muted">{t('أشكال أخرى للاسم:', 'Other forms of the name:')} {variants.join(' · ')}</p>}
          {(p.bioArabic || p.bioEnglish) && <p className="bio">{p.bioArabic || p.bioEnglish}</p>}
          <div className="entity-facts">
            <span><b>{works.length}</b> {works.length === 1 ? t('عمل', 'work') : t('أعمال', 'works')} {t('في الفهرس', 'in the catalogue')}</span>
            {span && <span>{span.includes('–') ? t('بين', 'Between') : t('سنة', 'In')} <b>{span}</b></span>}
            {langs.length > 0 && <span>{t(`بـ${langs.join(' و')}`, `In ${langs.join(' and ')}`)}</span>}
          </div>
        </div>
      </section>

      <div className="entity-layout">
        <div className="entity-main">
          {[...groups].map(([role, ws]) => (
            <section key={role} className="section" style={{ marginTop: 24 }}>
              <div className="section-head"><h2>{role === AUTHOR_ROLE() ? t('من تأليفه', 'Written by') : t(`بصفته ${role}`, `As ${role.toLowerCase()}`)} <span className="count-n">{ws.length}</span></h2>
                <button className="link-btn" onClick={() => ctx.go({ mode: 'search', query: '', params: `f_author=${encodeURIComponent(name)}` })}>{t('في البحث مع الفلاتر', 'In search with filters')}</button>
              </div>
              <WorkRows works={ws} ctx={ctx} />
            </section>
          ))}
          {about.length > 0 && (
            <section className="section" style={{ marginTop: 24 }}>
              <div className="section-head"><h2>{t('كُتب عنه', 'Written about them')} <span className="count-n">{about.length}</span></h2></div>
              <WorkRows works={about} ctx={ctx} />
            </section>
          )}
        </div>
        <aside className="entity-side">
          <WikidataCard sameAs={fromMoon} kind="person" />
          <LinkedPanel uri={moon?.uri} sameAs={sameAs} note={moon ? undefined : t('لهذا الشخص سجل في ملفات الاستناد العالمية؛ يمكن إضافته إلى ملف مون الاستنادي من محرر مون.', 'This person has a record in international authority files; it can be added to Moon’s authority file from the Moon editor.')} />
          {teachers.length > 0 && (
            <section className="panel glass rise">
              <h2>{t('شيوخه', 'Teachers')}</h2>
              <p className="muted" style={{ fontSize: 12 }}>{t('من الإجازات والسماعات المسجلة على النسخ المخطوطة.', 'From the ijāzāt and samāʿ notes recorded on manuscript copies.')}</p>
              {linkChips(teachers)}
            </section>
          )}
          {students.length > 0 && (
            <section className="panel glass rise">
              <h2>{t('تلاميذه', 'Students')}</h2>
              <p className="muted" style={{ fontSize: 12 }}>{t('من الإجازات والسماعات المسجلة على النسخ المخطوطة.', 'From the ijāzāt and samāʿ notes recorded on manuscript copies.')}</p>
              {linkChips(students)}
            </section>
          )}
          {places.length > 0 && (
            <section className="panel glass rise">
              <h2>{t('أماكن', 'Places')}</h2>
              <div className="subjects">{places.map(pl => <button key={pl.label} className="chip" dir="auto" onClick={() => ctx.go(placeName(pl.label) ? { mode: 'place', key: placeName(pl.label) } : { mode: 'search', query: pl.label })}>{pl.label}{pl.count > 1 ? <span className="n"> {pl.count}</span> : null}</button>)}</div>
            </section>
          )}
          {subjects.length > 0 && (
            <section className="panel glass rise">
              <h2>{t('يكتب في', 'Writes about')}</h2>
              <div className="subjects">{subjects.map(s => <button key={s.id} className="chip" onClick={() => ctx.go({ mode: 'subject', key: s.id })}>{s.label}</button>)}</div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function SubjectPage({ ctx, k }: { ctx: Ctx; k: string }) {
  const r = useMemo(() => wolfMoonOpacService.getSubjectByLabelOrUri(k), [k, ctx.rev]);
  const moon = useMoonAuthority('topic', r?.subject.label);
  if (!r) return <NotFound ctx={ctx} what={t('الموضوع', 'subject')} back={{ mode: 'subjects' }} backLabel={t('كل الموضوعات', 'All subjects')} />;
  const { subject: s, works } = r;
  const near = [s.broader, ...(s.narrower || []), ...(s.related || [])].filter(Boolean) as string[];
  const along = subjectsAlongside(s.label, works).filter(x => !near.includes(x.label) && isReadableLabel(x.label));
  const authors = [...new Map(works.map(w => w.primaryCreator).filter(p => p && personName(p)).map(p => [personName(p), p])).values()].slice(0, 8);
  const span = yearSpan(works);
  const sameAs = [s.uri, ...(moon?.sameAs || [])].filter((u): u is string => !!u && /^https?:\/\//.test(u) && !u.startsWith('https://mooon.site/'));
  return (
    <div className="wrap">
      <div className="page-head">
        <Crumbs ctx={ctx} items={[{ label: t('الموضوعات', 'Subjects'), view: { mode: 'subjects' } }, { label: s.label }]} />
        <div className="kicker">{t('موضوع', 'Subject')}</div>
        <h1 className="page-title">{s.label}</h1>
        <p className="lede">{[s.labelEnglish, `${works.length} ${works.length === 1 ? t('عمل', 'work') : t('أعمال', 'works')}`, span].filter(Boolean).join(t('، ', ', '))}</p>
        {near.length > 0 && (
          <div className="terms" style={{ borderTop: 0, paddingTop: 0 }}>
            <div><span className="lbl">{t('موضوعات قريبة', 'Related subjects')}</span>{near.map(n => <button key={n} className="chip" onClick={() => ctx.go({ mode: 'subject', key: n })}>{n}</button>)}</div>
          </div>
        )}
      </div>
      <div className="entity-layout">
        <div className="entity-main">
          <div className="section-head">
            <h2>{t('الأعمال', 'Works')} <span className="count-n">{works.length}</span></h2>
            <button className="link-btn" onClick={() => ctx.go({ mode: 'search', query: '', params: `f_subject=${encodeURIComponent(s.label)}` })}>{t('في البحث مع الفلاتر', 'In search with filters')}</button>
          </div>
          <WorkRows works={works} ctx={ctx} />
        </div>
        <aside className="entity-side">
          <LinkedPanel uri={moon?.uri} sameAs={sameAs} />
          {along.length > 0 && (
            <section className="panel glass rise">
              <h2>{t('يأتي معه غالبًا', 'Often given with')}</h2>
              <div className="subjects">{along.map(x => <button key={x.label} className="chip" dir="auto" onClick={() => ctx.go({ mode: 'subject', key: x.label })}>{x.label}<span className="n"> {x.count}</span></button>)}</div>
            </section>
          )}
          {authors.length > 0 && (
            <section className="panel glass rise">
              <h2>{t('كتب فيه', 'Books about it')}</h2>
              <div className="subjects">{authors.map(p => <button key={p.id} className="chip" onClick={() => ctx.go({ mode: 'person', key: p.id })}>{personName(p)}</button>)}</div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/** A hub (bf:Hub): one creative work across its translations, editions and selections. */
function HubPage({ ctx, k }: { ctx: Ctx; k: string }) {
  const works = useMemo(() => wolfMoonOpacService.getAllWorks().filter(w => w.expressionOfHub?.uri === k), [k, ctx.rev]);
  const label = works[0]?.expressionOfHub?.label || '';
  const moon = useMoonAuthority('hub', label);
  if (!works.length) return <NotFound ctx={ctx} what={t('العمل', 'work')} back={{ mode: 'search', query: '' }} backLabel={t('كل الكتب', 'All books')} />;
  const langs = [...new Set(works.map(w => languageDisplay(languageName(w.languageLabel, w.language))).filter(Boolean))];
  const own = k.startsWith('https://mooon.site/resource/hub/') ? k : moon?.uri;
  const sameAs = [k, ...(moon?.sameAs || [])].filter(u => !u.startsWith('https://mooon.site/'));
  return (
    <div className="wrap">
      <div className="page-head">
        <Crumbs ctx={ctx} items={[{ label: t('الكتب', 'Books'), view: { mode: 'search', query: '' } }, { label }]} />
        <div className="kicker">{t('عمل (محور bf:Hub)', 'Work (bf:Hub)')}</div>
        <h1 className="page-title" dir="auto">{label}</h1>
        <p className="lede">{works.length} {works.length === 1 ? t('تعبير', 'expression') : t('تعبيرات', 'expressions')} {t('في الفهرس', 'in the catalogue')}{langs.length ? ` · ${langs.join(t('، ', ', '))}` : ''}{yearSpan(works) ? ` · ${yearSpan(works)}` : ''}</p>
      </div>
      <div className="entity-layout">
        <div className="entity-main">
          <div className="section-head"><h2>{t('الترجمات والطبعات', 'Translations and editions')}</h2></div>
          <WorkRows works={works} ctx={ctx} />
        </div>
        <aside className="entity-side">
          <LinkedPanel uri={own} sameAs={sameAs} note={t('المحور يجمع كل ترجمات العمل الواحد وطبعاته ومختاراته، كما تفعل مكتبة الكونغرس ولِبريس.', 'A hub gathers all the translations, editions and selections of one work, as the Library of Congress and Libris do.')} />
        </aside>
      </div>
    </div>
  );
}

/** A place (city of publication), with every Work published there and Moon's authority entry for it. */
function PlacePage({ ctx, k }: { ctx: Ctx; k: string }) {
  const all = useMemo(() => wolfMoonOpacService.getAllWorks(), [ctx.rev]);
  const works = useMemo(() => worksAtPlace(all, k), [all, k]);
  const others = useMemo(() => placesOf(all).filter(p => p.name !== k).slice(0, 12), [all, k]);
  const moon = useMoonAuthority('place', k);
  if (!works.length) return <NotFound ctx={ctx} what={t('المكان', 'place')} back={{ mode: 'search', query: '' }} backLabel={t('كل الكتب', 'All books')} />;
  const publishers = [...new Set(works.flatMap(w => w.instances.map(i => i.publisher)).filter((p): p is string => !!p))].slice(0, 10);
  const sameAs = (moon?.sameAs || []).filter(u => !u.startsWith('https://mooon.site/'));
  return (
    <div className="wrap">
      <div className="page-head">
        <Crumbs ctx={ctx} items={[{ label: t('الكتب', 'Books'), view: { mode: 'search', query: '' } }, { label: k }]} />
        <div className="kicker">{t('مكان', 'Place')}</div>
        <h1 className="page-title" dir="auto">{k}</h1>
        <p className="lede">{works.length} {works.length === 1 ? t('عمل نُشر هنا', 'work published here') : t('أعمال نُشرت هنا', 'works published here')}{yearSpan(works) ? ` · ${yearSpan(works)}` : ''}</p>
        {moon && moon.variants.length > 0 && <p className="muted">{t('أشكال أخرى للاسم:', 'Other forms of the name:')} {moon.variants.filter(v => v !== k).join(' · ')}</p>}
      </div>
      <div className="entity-layout">
        <div className="entity-main">
          <div className="section-head"><h2>{t('نُشر هنا', 'Published here')} <span className="count-n">{works.length}</span></h2></div>
          <WorkRows works={works} ctx={ctx} />
        </div>
        <aside className="entity-side">
          <WikidataCard sameAs={sameAs} kind="place" />
          <LinkedPanel uri={moon?.uri} sameAs={sameAs} />
          {publishers.length > 0 && (
            <section className="panel glass rise">
              <h2>{t('الناشرون', 'Publishers')}</h2>
              <div className="subjects">{publishers.map(p => <button key={p} className="chip" onClick={() => ctx.go({ mode: 'search', query: p })}>{p}</button>)}</div>
            </section>
          )}
          {others.length > 0 && (
            <section className="panel glass rise">
              <h2>{t('أماكن أخرى', 'Other places')}</h2>
              <div className="subjects">{others.map(p => <button key={p.name} className="chip" onClick={() => ctx.go({ mode: 'place', key: p.name })}>{p.name} <span className="count-n">{p.count}</span></button>)}</div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * A publisher's, a series' or a genre's page: its books (a series in number order) and the others of its kind.
 * Names are matched folded (see groupPages.ts), so one publisher written two ways is one page.
 */
function GroupPage({ ctx, kind, k }: { ctx: Ctx; kind: 'publisher' | 'series' | 'genre'; k: string }) {
  const all = useMemo(() => wolfMoonOpacService.getAllWorks(), [ctx.rev]);
  const works = useMemo(() => worksOfGroup(kind, all, k), [all, kind, k]);
  const others = useMemo(() => groupsOf(kind, all).filter(g => g.name !== k).slice(0, 16), [all, kind, k]);
  const words = {
    publisher: { kicker: t('ناشر', 'Publisher'), what: t('الناشر', 'publisher'), list: t('من منشوراته', 'Published by them'), others: t('ناشرون آخرون', 'Other publishers') },
    series: { kicker: t('سلسلة', 'Series'), what: t('السلسلة', 'series'), list: t('كتب السلسلة', 'In this series'), others: t('سلاسل أخرى', 'Other series') },
    genre: { kicker: t('نوع', 'Genre'), what: t('النوع', 'genre'), list: t('كتب من هذا النوع', 'Books of this genre'), others: t('أنواع أخرى', 'Other genres') },
  }[kind];
  if (!works.length) return <NotFound ctx={ctx} what={words.what} back={{ mode: 'search', query: '' }} backLabel={t('كل الكتب', 'All books')} />;
  return (
    <div className="wrap">
      <div className="page-head">
        <Crumbs ctx={ctx} items={[{ label: t('الكتب', 'Books'), view: { mode: 'search', query: '' } }, { label: k }]} />
        <div className="kicker">{words.kicker}</div>
        <h1 className="page-title" dir="auto">{k}</h1>
        <p className="lede">{works.length} {works.length === 1 ? t('عمل', 'work') : t('أعمال', 'works')}{yearSpan(works) ? ` · ${yearSpan(works)}` : ''}</p>
      </div>
      <div className="entity-layout">
        <div className="entity-main">
          <div className="section-head"><h2>{words.list} <span className="count-n">{works.length}</span></h2></div>
          <WorkRows works={works} ctx={ctx} />
        </div>
        <aside className="entity-side">
          {others.length > 0 && (
            <section className="panel glass rise">
              <h2>{words.others}</h2>
              <div className="subjects">{others.map(g => <button key={g.name} className="chip" dir="auto" onClick={() => ctx.go({ mode: kind, key: g.name })}>{g.name} <span className="count-n">{g.count}</span></button>)}</div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Wikidata info card (as Primo shows): description, picture, dates or map position, with its source. */
const infoCardCache = new Map<string, InfoCardData | null>();
function useWikidataCard(sameAs: (string | undefined)[], kind: 'person' | 'place'): InfoCardData | null {
  const qid = wikidataQid(sameAs);
  const lang = opacLang();
  const cacheKey = `${qid}|${lang}|${kind}`;
  const [card, setCard] = useState<InfoCardData | null>(() => (qid ? infoCardCache.get(cacheKey) ?? null : null));
  useEffect(() => {
    if (!qid) { setCard(null); return; }
    if (infoCardCache.has(cacheKey)) { setCard(infoCardCache.get(cacheKey)!); return; }
    let live = true;
    fetch(wikidataApiUrl(qid))
      .then(r => (r.ok ? r.json() : null))
      .then(j => { const c = j ? parseInfoCard(j, qid, lang, kind) : null; infoCardCache.set(cacheKey, c); if (live) setCard(c); })
      .catch(() => {});
    return () => { live = false; };
  }, [qid, cacheKey]);
  return card;
}

function WikidataCard({ sameAs, kind }: { sameAs: (string | undefined)[]; kind: 'person' | 'place' }) {
  const card = useWikidataCard(sameAs, kind);
  if (!card || (!card.description && !card.image)) return null;
  const life = [card.born, card.died].filter(Boolean).join(' – ');
  return (
    <section className="panel glass rise info-card" aria-label={t('بطاقة من ويكي بيانات', 'Card from Wikidata')}>
      {card.image && <img src={card.image} alt={card.label || ''} loading="lazy" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12 }} />}
      {card.label && <h2 dir="auto">{card.label}</h2>}
      {card.description && <p dir="auto">{card.description}</p>}
      {life && <p className="muted" dir="ltr">{life}</p>}
      {card.coordinates && (
        <p><a href={`https://www.openstreetmap.org/?mlat=${card.coordinates.lat}&mlon=${card.coordinates.lon}#map=10/${card.coordinates.lat}/${card.coordinates.lon}`} target="_blank" rel="noreferrer">
          {t('على الخريطة', 'On the map')} <ArrowUpRight size={13} />
        </a></p>
      )}
      <p className="muted" style={{ fontSize: 12 }}>
        {t('المصدر:', 'Source:')} <a href={card.url} target="_blank" rel="noreferrer">{t('ويكي بيانات', 'Wikidata')} {card.qid}</a>
      </p>
    </section>
  );
}

/** BIBFRAME relationships (translation of, related to …) in both directions, linked when Moon holds the Work. */
/** A relation's words in the reader's language ("Translation of" / "ترجمة لـ"), or its inverse for the other book. */
function relationLabel(r: { predicate: string; predicateLabel: string }, inverse = false): string {
  const term = r.predicate.startsWith('rel:') ? r.predicate.slice(4) : '';
  return (term && relationWords(term, opacLang(), inverse)) || (inverse ? t(`يشير إليه (${r.predicateLabel})`, `Points here (${r.predicateLabel})`) : r.predicateLabel);
}

function RelatedWorks({ work, ctx }: { work: OpacWorkEntity; ctx: Ctx }) {
  const { outgoing, incoming } = useMemo(() => relationsOf(work, wolfMoonOpacService.getAllWorks()), [work, ctx.rev]);
  if (!outgoing.length && !incoming.length) return null;
  const titleOf = (id: string) => wolfMoonOpacService.getAllWorks().find(w => w.id === id)?.title;
  return (
    <section className="panel glass rise" aria-labelledby="h-rel">
      <h2 id="h-rel">{t('أعمال ذات صلة', 'Related works')}</h2>
      <dl className="dl">
        {outgoing.map((r, i) => (
          <React.Fragment key={`o${i}`}>
            <dt>{relationLabel(r)}</dt>
            <dd dir="auto">{r.workId
              ? <button className="inline-link" onClick={() => ctx.go({ mode: 'work', id: r.workId! })}>{titleOf(r.workId) || r.targetTitle}</button>
              : r.targetUri && /^https?:\/\//.test(r.targetUri) ? <a href={r.targetUri} target="_blank" rel="noreferrer">{r.targetTitle}</a> : r.targetTitle}
              {r.details ? ` — ${r.details}` : ''}</dd>
          </React.Fragment>
        ))}
        {incoming.map(({ work: w, relation }) => (
          <React.Fragment key={`i${w.id}${relation.predicate}`}>
            <dt>{relationLabel(relation, true)}</dt>
            <dd dir="auto"><button className="inline-link" onClick={() => ctx.go({ mode: 'work', id: w.id })}>{w.title}</button></dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );
}

function useFilter<T>(list: T[], text: (t: T) => string) {
  const [q, setQ] = useState('');
  const out = useMemo(() => {
    const n = normalizeArabic(q.trim());
    return n ? list.filter(x => normalizeArabic(text(x)).includes(n)) : list;
  }, [list, q]);
  return { q, setQ, out };
}

/** The headings under one letter (or all), in filing order: without the article, Arabic first. */
function byLetter<T>(list: T[], label: (x: T) => string, letter: string): T[] {
  const chosen = letter ? list.filter(x => letterOf(label(x)) === letter) : list;
  return letter ? [...chosen].sort((a, b) => filingKey(label(a)).localeCompare(filingKey(label(b)), 'ar')) : chosen;
}

/** The A–Z bar in both scripts (S13): Arabic letters, then Latin; letters with no heading are greyed. */
function AZBar({ labels, letter, onLetter }: { labels: string[]; letter: string; onLetter: (l: string) => void }) {
  const idx = useMemo(() => alphaIndex(labels), [labels]);
  return (
    <nav className="az" aria-label={t('تصفّح بالحرف', 'Browse by letter')}>
      <button className={!letter ? 'on' : ''} aria-pressed={!letter} onClick={() => onLetter('')}>{t('الكل', 'All')}</button>
      {idx.map(({ letter: l, count }) => (
        <button key={l} className={letter === l ? 'on' : ''} aria-pressed={letter === l} disabled={!count}
          title={t(`${count} تحت «${l}»`, `${count} under “${l}”`)} onClick={() => onLetter(letter === l ? '' : l)}>{l}</button>
      ))}
    </nav>
  );
}

/** A short card on a name or subject (S13), shown on hover or keyboard focus, from the catalogue's own data. */
function HoverCard({ kind, k, children }: { kind: 'person' | 'subject'; k: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const timer = React.useRef<number | undefined>(undefined);
  const info: any = useMemo(() => (open ? wolfMoonOpacService.getHoverInfo(kind, k) : null), [open, kind, k]);
  const show = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), 350); };
  const hide = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), 150); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const facts = info ? [
    info.subtitle && info.subtitle !== info.title ? info.subtitle : '',
    info.lifespan || '',
    kind === 'subject' && info.broader ? t(`أعمّ: ${info.broader}`, `Broader: ${info.broader}`) : '',
  ].filter(Boolean) : [];
  return (
    <span className="hc" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {open && info && (
        <span className="hc-card glass" role="tooltip">
          <b dir="auto">{info.title}</b>
          {facts.map((x: string) => <span key={x} className="muted" dir="auto">{x}</span>)}
          <span>{info.worksCount === 1 ? t('كتاب واحد في الفهرس', '1 book in the catalogue') : t(`${info.worksCount} كتب في الفهرس`, `${info.worksCount} books in the catalogue`)}</span>
          {info.bio && <span className="muted" dir="auto">{info.bio}</span>}
        </span>
      )}
    </span>
  );
}

function FilterField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="search-field glass">
      <Search size={20} strokeWidth={1.8} aria-hidden="true" />
      <input aria-label={label} placeholder={label} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function AuthorsPage({ ctx }: { ctx: Ctx }) {
  const all = useMemo(() => wolfMoonOpacService.getAllPersons(), [ctx.rev]);
  const { q, setQ, out: found } = useFilter(all, p => `${p.nameArabic} ${p.name} ${p.nameEnglish || ''}`);
  const [letter, setLetter] = useState('');
  const label = (p: OpacPersonEntity) => p.nameArabic || p.name || '';
  const out = useMemo(() => byLetter(found, label, letter), [found, letter]);
  return (
    <div className="wrap">
      <div className="page-head">
        <Crumbs ctx={ctx} items={[{ label: t('المؤلفون', 'Authors') }]} />
        <h1 className="page-title">{t('المؤلفون', 'Authors')}</h1>
        <p className="lede">{t(`${all.length} مؤلفاً ومساهماً في الفهرس`, `${all.length} authors and contributors in the catalogue`)}</p>
        <div className="dir-tools"><FilterField value={q} onChange={setQ} label={t('ابحث عن مؤلف', 'Find an author')} /></div>
        <AZBar labels={found.map(label)} letter={letter} onLetter={setLetter} />
      </div>
      <section className="section" style={{ marginTop: 28 }}>
        {out.length ? <div className="people">{out.map((p, i) => <PersonCard key={p.id} p={p} ctx={ctx} i={i} />)}</div>
          : <div className="empty glass"><h3>{t('لا يوجد مؤلف بهذا الاسم', 'No author by that name')}</h3><p>{t('جرّب جزءاً من الاسم فقط.', 'Try just part of the name.')}</p></div>}
      </section>
    </div>
  );
}

function SubjectsPage({ ctx }: { ctx: Ctx }) {
  const all = useMemo(() => wolfMoonOpacService.getAllSubjects().filter(s => isReadableLabel(s.label)), [ctx.rev]);
  const { q, setQ, out: found } = useFilter(all, s => `${s.label} ${s.labelEnglish || ''}`);
  const [letter, setLetter] = useState('');
  const out = useMemo(() => byLetter(found, s => s.label, letter), [found, letter]);
  return (
    <div className="wrap">
      <div className="page-head">
        <Crumbs ctx={ctx} items={[{ label: t('الموضوعات', 'Subjects') }]} />
        <h1 className="page-title">{t('الموضوعات', 'Subjects')}</h1>
        <p className="lede">{t(`${all.length} موضوعاً`, `${all.length} subjects`)}</p>
        <div className="dir-tools"><FilterField value={q} onChange={setQ} label={t('ابحث عن موضوع', 'Find a subject')} /></div>
        <AZBar labels={found.map(s => s.label)} letter={letter} onLetter={setLetter} />
      </div>
      <section className="section" style={{ marginTop: 28 }}>
        {out.length ? (
          <div className="subject-list">
            {out.map((s, i) => (
              <button key={s.id} className="subject-row glass rise" style={stagger(i)} onClick={() => ctx.go({ mode: 'subject', key: s.id })}>
                <span className="t">{s.label}</span>
                <span className="n">{s.worksCount} {s.worksCount === 1 ? t('كتاب', 'book') : t('كتب', 'books')}</span>
              </button>
            ))}
          </div>
        ) : <div className="empty glass"><h3>{t('لا يوجد موضوع بهذا الاسم', 'No subject by that name')}</h3><p>{t('جرّب كلمة أعم.', 'Try a broader word.')}</p></div>}
      </section>
    </div>
  );
}

function NotFound({ ctx, what, back, backLabel }: { ctx: Ctx; what: string; back: View; backLabel: string }) {
  return (
    <div className="wrap">
      <div className="page-head"><Crumbs ctx={ctx} items={[{ label: backLabel, view: back }]} /></div>
      <div className="empty glass">
        <h3>{t(`لم نجد هذا ${what} في الفهرس`, `We could not find this ${what} in the catalogue`)}</h3>
        <p>{t('ربما تغيّر الرابط. اختره من القائمة.', 'The link may have changed. Choose it from the list.')}</p>
        <button className="btn-black" onClick={() => ctx.go(back)}>{backLabel}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved list

function SavedSheet({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const works = useMemo(() => ctx.saved.map(id => wolfMoonOpacService.getWorkByIdOrUri(id)).filter(Boolean) as OpacWorkEntity[], [ctx.saved]);
  useEscape(onClose);
  const exp = (f: 'ris' | 'bibtex') => download(`moon-list.${f === 'ris' ? 'ris' : 'bib'}`, wolfMoonOpacService.exportBookbag(f), 'text/plain');
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="sheet glass" role="dialog" aria-modal="true" aria-labelledby="saved-h">
        <div className="sheet-head">
          <h2 id="saved-h">{t('قائمتي', 'My list')}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('إغلاق', 'Close')}><X size={18} /></button>
        </div>
        <div className="sheet-body">
          {works.length === 0 ? (
            <p style={{ color: 'var(--ink-2)' }}>{t('احفظ الكتب التي تهمّك من صفحة كل كتاب، وستجدها هنا.', 'Save the books you care about from each book’s page, and you will find them here.')}</p>
          ) : works.map(w => (
            <div key={w.id} className="mini">
              <Cover work={w} jacket={false} morph={false} />
              <button style={{ background: 'none', border: 0, padding: 0, textAlign: 'start' }} onClick={() => { onClose(); ctx.go({ mode: 'work', id: w.id }); }}>
                <div className="t">{w.title}</div>
                <div className="s">{personName(w.primaryCreator)}</div>
              </button>
              <button className="icon-btn" aria-label={t(`أزل ${w.title}`, `Remove ${w.title}`)} onClick={() => ctx.toggleSave(w.id)}><X size={16} /></button>
            </div>
          ))}
        </div>
        {works.length > 0 && (
          <div className="sheet-foot">
            <button className="btn-ghost" style={{ justifyContent: 'center' }} onClick={() => exp('ris')}><Download size={16} />RIS</button>
            <button className="btn-ghost" style={{ justifyContent: 'center' }} onClick={() => exp('bibtex')}><Download size={16} />BibTeX</button>
          </div>
        )}
      </aside>
    </>
  );
}

export default OpacApp;
