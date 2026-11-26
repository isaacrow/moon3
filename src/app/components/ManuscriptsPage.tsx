/**
 * Manuscripts (/manuscripts/): the Al-Qamar catalogue of 107,149 Arabic, Persian and Ottoman manuscripts (from
 * dromh.org), searched and read inside Moon. Only the Super Admin and accounts the Super Admin gave the Manuscripts
 * role open it; the server (manuscriptsRoutes.tsx) checks the same and answers 403 to everyone else.
 * Each manuscript's MARC 21 / RDA record is built here from its source fields with Al-Qamar's own builder.
 * The open manuscript and the search are kept in the address (?id=…&q=…), so a refresh or a link opens the same view.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollText, Search, ShieldAlert, ExternalLink, Download, X, ChevronLeft, ChevronRight, Loader2, FileCode2, List, BarChart3, Sparkles } from 'lucide-react';
import { moonFetch } from '../utils/moonApi';
import { useAuth } from '../contexts/AuthContext';
import { buildMarcRecord, toIso2709, toMrk } from '../utils/manuscriptMarc.js';
import { glass, input, btn, dark, light } from './CirculationDesk';

const ALQAMAR_URL = 'https://alqamar-manuscripts.onrender.com';

interface Facet { value: string; count: number }
interface Facets { total: number; libraries: Facet[]; subjects: Facet[]; languages: Facet[] }
interface Row { id: string; title: string; author?: string | null; subject?: string | null; language?: string | null; library?: string | null; copyNumber?: string | null; copyDate?: string | null; copyist?: string | null }
interface Manuscript { id: string; viewUrl?: string | null; fields: Record<string, string> }

// Al-Qamar's source fields, in reading order, with their English names.
const FIELDS: Array<[string, string]> = [
  ['العنوان', 'Title'], ['المؤلف', 'Author'], ['الموضوع', 'Subject'], ['اللغة', 'Language'], ['نوع الخط', 'Script'],
  ['الناسخ', 'Copyist'], ['تاريخ النسخ', 'Date copied'], ['مكان النسخ', 'Place copied'], ['عدد الاوراق', 'Leaves'],
  ['المصدر', 'Holding library'], ['رقم النسخة', 'Shelf number'], ['وصف النسخة', 'Description'],
  ['أول النسخة', 'Incipit'], ['آخر النسخة', 'Explicit'],
];

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  return { id: p.get('id') || '', q: p.get('q') || '', library: p.get('library') || '', subject: p.get('subject') || '', language: p.get('language') || '', page: Math.max(0, Number(p.get('page')) || 0) };
}
function writeUrl(s: ReturnType<typeof readUrl>) {
  const u = new URL(window.location.href);
  for (const [k, v] of Object.entries(s)) {
    if (v && !(k === 'page' && v === 0)) u.searchParams.set(k, String(v)); else u.searchParams.delete(k);
  }
  window.history.replaceState(null, '', u.pathname + u.search);
}

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ManuscriptsPage({ isAr }: { isAr: boolean }) {
  const { canSeeManuscripts } = useAuth();
  const [state, setState] = useState(readUrl);
  const [qInput, setQInput] = useState(state.q);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [result, setResult] = useState<{ total: number; rows: Row[]; pageSize: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const [suiteTab, setSuiteTab] = useState<'alqamar' | 'insights' | 'quick'>(() => (state.id || state.q ? 'quick' : 'alqamar'));
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const n = useCallback((v: number) => v.toLocaleString(isAr ? 'ar-EG' : 'en-GB'), [isAr]);

  const update = (patch: Partial<ReturnType<typeof readUrl>>) => setState((s) => {
    const next = { ...s, ...patch };
    writeUrl(next);
    return next;
  });

  useEffect(() => {
    if (!canSeeManuscripts) return;
    moonFetch<Facets>('/manuscripts/facets').then((r) => {
      if (r.status === 403) setDenied(true);
      else if (r.ok) setFacets(r.data);
    }).catch(() => {});
  }, [canSeeManuscripts]);

  useEffect(() => {
    if (!canSeeManuscripts) return;
    let live = true;
    setLoading(true);
    setError('');
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.library) p.set('library', state.library);
    if (state.subject) p.set('subject', state.subject);
    if (state.language) p.set('language', state.language);
    if (state.page) p.set('page', String(state.page));
    moonFetch<any>(`/manuscripts/search?${p}`).then((r) => {
      if (!live) return;
      if (r.status === 403) setDenied(true);
      else if (r.ok) setResult(r.data);
      else setError(r.data?.error || (isAr ? 'تعذّر البحث.' : 'The search failed.'));
    }).catch(() => live && setError(isAr ? 'تعذّر الوصول إلى الخادم.' : 'Could not reach the server.'))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [canSeeManuscripts, state.q, state.library, state.subject, state.language, state.page, isAr]);

  if (!canSeeManuscripts || denied) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="p-6 flex gap-3" style={glass}>
          <ShieldAlert className="h-6 w-6 text-slate-700 shrink-0" />
          <div>
            <h1 className="font-black text-slate-900">{isAr ? 'فهرس المخطوطات مقيّد' : 'The manuscripts catalogue is restricted'}</h1>
            <p className="text-sm text-slate-600 mt-1">
              {isAr
                ? 'يفتحه المشرف العام وأصحاب حسابات «المخطوطات» فقط. اطلب من المشرف العام أن يجعل دورك «المخطوطات».'
                : 'Only the Super Admin and Manuscripts accounts open it. Ask the Super Admin to give your account the Manuscripts role.'}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const filtered = !!(state.q || state.library || state.subject || state.language);
  const notImported = facets && facets.total === 0;

  const select = (label: string, value: string, options: Facet[] | undefined, key: 'library' | 'subject' | 'language') => (
    <label className="text-xs font-bold text-slate-700 min-w-0">
      <span className="block mb-1">{label}</span>
      <select className={input} value={value} onChange={(e) => update({ [key]: e.target.value, page: 0, id: '' })}>
        <option value="">{isAr ? 'الكل' : 'All'}</option>
        {(options || []).map((f) => <option key={f.value} value={f.value}>{f.value} ({n(f.count)})</option>)}
        {value && !(options || []).some((f) => f.value === value) && <option value={value}>{value}</option>}
      </select>
    </label>
  );

  const activeExternalUrl = suiteTab === 'insights' ? `${ALQAMAR_URL}/insights` : ALQAMAR_URL;

  const switchTab = (next: 'alqamar' | 'insights' | 'quick') => {
    if (next !== suiteTab) {
      if (next !== 'quick') setIframeLoaded(false);
      setSuiteTab(next);
    }
  };

  if (suiteTab !== 'quick') {
    return (
      <main className="max-w-[1600px] mx-auto px-3 sm:px-5 py-3" dir={isAr ? 'rtl' : 'ltr'}>
        <header className="flex flex-wrap items-center justify-between gap-2 mb-3 px-4 py-2.5" style={glass}>
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-slate-900" />
            <h1 className="text-base sm:text-lg font-black text-slate-900">
              {isAr ? 'منظومة القمر للمخطوطات (Al-Qamar)' : 'Al-Qamar Manuscripts Suite'}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => switchTab('alqamar')}
              className={`${suiteTab === 'alqamar' ? dark : light} px-3 py-1.5 text-xs`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isAr ? 'القمر الكامل (الفهرسة)' : 'Full Al-Qamar'}
            </button>
            <button
              type="button"
              onClick={() => switchTab('insights')}
              className={`${suiteTab === 'insights' ? dark : light} px-3 py-1.5 text-xs`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              {isAr ? 'التحليلات والخرائط 3D' : '3D Insights & Map'}
            </button>
            <button
              type="button"
              onClick={() => switchTab('quick')}
              className={`${light} px-3 py-1.5 text-xs`}
            >
              <Search className="h-3.5 w-3.5" />
              {isAr ? 'البحث السريع' : 'Quick Search'}
            </button>
            <a
              href={activeExternalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${light} px-3 py-1.5 text-xs`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {isAr ? 'ملء الشاشة' : 'New Tab'}
            </a>
          </div>
        </header>

        <div className="relative w-full h-[calc(100vh-145px)] min-h-[680px] rounded-2xl overflow-hidden border border-white/60 shadow-xl bg-slate-950/5">
          {!iframeLoaded && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-6 text-center bg-white/85 backdrop-blur-md">
              <Loader2 className="h-8 w-8 animate-spin text-slate-800" />
              <p className="font-bold text-slate-900">
                {isAr ? 'جاري تشغيل منظومة القمر الكاملة (107,149 مخطوطة)...' : 'Waking up the full Al-Qamar suite (107,149 manuscripts)...'}
              </p>
              <p className="text-xs text-slate-600 max-w-md">
                {isAr
                  ? 'قد يستغرق التشغيل الأول نحو 30–50 ثانية على الخادم السحابي المجاني، وبعدها يعمل بسرعة فائقة.'
                  : 'First load on the free cloud host can take 30–50s to wake up; subsequent loads are instant.'}
              </p>
              <button type="button" onClick={() => switchTab('quick')} className={`${light} px-3 py-1.5 text-xs mt-1`}>
                <Search className="h-3.5 w-3.5" />
                {isAr ? 'استخدم البحث السريع أثناء التحميل' : 'Use Quick Search while loading'}
              </button>
            </div>
          )}
          <iframe
            key={activeExternalUrl}
            src={activeExternalUrl}
            title={isAr ? 'منظومة القمر للمخطوطات' : 'Al-Qamar Manuscripts Suite'}
            className="w-full h-full border-0"
            allow="fullscreen; clipboard-write"
            onLoad={() => setIframeLoaded(true)}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <ScrollText className="h-6 w-6" /> {isAr ? 'المخطوطات' : 'Manuscripts'}
          </h1>
          <p className="text-sm text-slate-600">
            {isAr
              ? `فهرس القمر: ${facets ? n(facets.total) : '…'} مخطوطة عربية وفارسية وعثمانية · MARC 21 / RDA`
              : `The Al-Qamar catalogue: ${facets ? n(facets.total) : '…'} Arabic, Persian and Ottoman manuscripts · MARC 21 / RDA`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => switchTab('alqamar')} className={`${dark} px-3 py-1.5 text-xs`}>
            <Sparkles className="h-3.5 w-3.5" />
            {isAr ? 'فتح القمر الكامل' : 'Open Full Al-Qamar'}
          </button>
          <button type="button" onClick={() => switchTab('insights')} className={`${light} px-3 py-1.5 text-xs`}>
            <BarChart3 className="h-3.5 w-3.5" />
            {isAr ? 'التحليلات والخرائط 3D' : '3D Insights & Map'}
          </button>
        </div>
      </header>

      {notImported && (
        <div className="p-4 mb-4 text-sm text-slate-800" style={glass}>
          {isAr
            ? 'الفهرس لم يُحمَّل بعد. يحمّله المشرف العام مرة واحدة: node scripts/import-manuscripts.mjs --file <ملف الفهرس> --apply'
            : 'The catalogue has not been loaded yet. The Super Admin loads it once: node scripts/import-manuscripts.mjs --file <catalogue file> --apply'}
        </div>
      )}

      <section className="p-4 mb-4 space-y-3" style={glass}>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); update({ q: qInput.trim(), page: 0, id: '' }); }}>
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
            <input className={`${input} ps-9`} value={qInput} onChange={(e) => setQInput(e.target.value)} dir="auto"
              placeholder={isAr ? 'العنوان، المؤلف، الناسخ، الموضوع، المكتبة أو رقم النسخة' : 'Title, author, copyist, subject, library or shelf number'} />
          </div>
          <button type="submit" className={dark}>{isAr ? 'بحث' : 'Search'}</button>
          {filtered && (
            <button type="button" className={light} onClick={() => { setQInput(''); update({ q: '', library: '', subject: '', language: '', page: 0, id: '' }); }}>
              <X className="h-4 w-4" /> {isAr ? 'مسح' : 'Clear'}
            </button>
          )}
        </form>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {select(isAr ? 'المكتبة' : 'Library', state.library, facets?.libraries, 'library')}
          {select(isAr ? 'الموضوع' : 'Subject', state.subject, facets?.subjects, 'subject')}
          {select(isAr ? 'اللغة' : 'Language', state.language, facets?.languages, 'language')}
        </div>
      </section>

      <div className={`grid gap-4 ${state.id ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]' : ''}`}>
        <section className="p-2 min-w-0" style={glass} aria-busy={loading}>
          <div className="flex items-center justify-between px-2 py-1 text-xs text-slate-600">
            <span>{result ? (isAr ? `${n(result.total)} نتيجة` : `${n(result.total)} results`) : ''}</span>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          {error && <p className="px-2 py-3 text-sm text-red-700">{error}</p>}
          <ul className="divide-y divide-slate-200/70">
            {(result?.rows || []).map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => update({ id: r.id })} aria-current={state.id === r.id ? 'true' : undefined}
                  className={`w-full text-start px-3 py-2.5 rounded-xl cursor-pointer ${state.id === r.id ? 'bg-slate-900 text-white' : 'hover:bg-white/70 text-slate-900'}`}>
                  <span className="block font-bold text-sm leading-snug" dir="rtl">{r.title || (isAr ? '[بدون عنوان]' : '[untitled]')}</span>
                  <span className={`block text-xs mt-0.5 ${state.id === r.id ? 'text-slate-200' : 'text-slate-600'}`} dir="rtl">
                    {[r.author, r.library && `${r.library}${r.copyNumber ? ` · ${r.copyNumber}` : ''}`, r.copyDate].filter(Boolean).join(' — ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {result && result.total === 0 && !loading && (
            <p className="px-3 py-6 text-sm text-slate-600 text-center">{isAr ? 'لا توجد مخطوطات مطابقة.' : 'No matching manuscripts.'}</p>
          )}
          {result && pages > 1 && (
            <nav className="flex items-center justify-center gap-2 py-2 text-xs text-slate-700">
              <button type="button" className={`${light} px-2 py-1`} disabled={state.page === 0} onClick={() => update({ page: state.page - 1 })}
                aria-label={isAr ? 'الصفحة السابقة' : 'Previous page'}>
                {isAr ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
              <span>{isAr ? `صفحة ${n(state.page + 1)} من ${n(pages)}` : `Page ${n(state.page + 1)} of ${n(pages)}`}</span>
              <button type="button" className={`${light} px-2 py-1`} disabled={state.page + 1 >= pages} onClick={() => update({ page: state.page + 1 })}
                aria-label={isAr ? 'الصفحة التالية' : 'Next page'}>
                {isAr ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            </nav>
          )}
        </section>

        {state.id && <ManuscriptDetail key={state.id} id={state.id} isAr={isAr} onClose={() => update({ id: '' })} />}
      </div>
    </main>
  );
}

function ManuscriptDetail({ id, isAr, onClose }: { id: string; isAr: boolean; onClose: () => void }) {
  const [m, setM] = useState<Manuscript | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<'fields' | 'marc'>('fields');

  useEffect(() => {
    moonFetch<any>(`/manuscripts/${encodeURIComponent(id)}`).then((r) => {
      if (r.ok) setM(r.data);
      else setError(r.status === 404 ? (isAr ? 'لا مخطوطة بهذا الرقم.' : 'No manuscript has this number.') : (r.data?.error || 'Error'));
    }).catch(() => setError(isAr ? 'تعذّر الوصول إلى الخادم.' : 'Could not reach the server.'));
  }, [id, isAr]);

  const marc = useMemo(() => (m ? buildMarcRecord({ id: m.id, viewUrl: m.viewUrl, source_fields: m.fields }) : null), [m]);
  const extra = m ? Object.keys(m.fields).filter((k) => !FIELDS.some(([f]) => f === k)) : [];

  return (
    <section className="p-4 min-w-0 lg:sticky lg:top-4 self-start max-h-[calc(100vh-2rem)] overflow-auto" style={glass}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">{isAr ? `رقم التسجيلة ${id}` : `Record ${id}`}</p>
          <h2 className="font-black text-lg text-slate-900 leading-snug" dir="rtl">{m?.fields['العنوان'] || (m ? (isAr ? '[بدون عنوان]' : '[untitled]') : '…')}</h2>
        </div>
        <button type="button" onClick={onClose} className={`${light} px-2 py-1 shrink-0`} aria-label={isAr ? 'إغلاق' : 'Close'}><X className="h-4 w-4" /></button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {m && marc && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="flex gap-1 p-1 rounded-full bg-white/60 border border-slate-200">
              <button type="button" onClick={() => setView('fields')} aria-pressed={view === 'fields'}
                className={`${btn} px-3 py-1 text-xs ${view === 'fields' ? 'bg-slate-900 text-white' : 'text-slate-800'}`}><List className="h-3.5 w-3.5" />{isAr ? 'الوصف' : 'Description'}</button>
              <button type="button" onClick={() => setView('marc')} aria-pressed={view === 'marc'}
                className={`${btn} px-3 py-1 text-xs ${view === 'marc' ? 'bg-slate-900 text-white' : 'text-slate-800'}`}><FileCode2 className="h-3.5 w-3.5" />MARC 21</button>
            </div>
            <button type="button" className={`${light} px-3 py-1 text-xs`} onClick={() => download(`alqamar-${m.id}.mrk`, toMrk(marc), 'text/plain;charset=utf-8')}>
              <Download className="h-3.5 w-3.5" /> .mrk
            </button>
            <button type="button" className={`${light} px-3 py-1 text-xs`} onClick={() => download(`alqamar-${m.id}.mrc`, toIso2709(marc) as BlobPart, 'application/marc')}>
              <Download className="h-3.5 w-3.5" /> .mrc
            </button>
            {m.viewUrl && (
              <a href={m.viewUrl} target="_blank" rel="noopener noreferrer" className={`${light} px-3 py-1 text-xs`}>
                <ExternalLink className="h-3.5 w-3.5" /> dromh.org
              </a>
            )}
          </div>
          {view === 'fields' ? (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              {[...FIELDS.filter(([k]) => m.fields[k]), ...extra.map((k) => [k, k] as [string, string])].map(([k, en]) => (
                <React.Fragment key={k}>
                  <dt className="font-bold text-slate-600 whitespace-nowrap">{isAr ? k : en}</dt>
                  <dd className="text-slate-900 whitespace-pre-wrap break-words" dir="rtl">{m.fields[k]}</dd>
                </React.Fragment>
              ))}
            </dl>
          ) : (
            <pre className="text-xs leading-relaxed bg-white/70 border border-slate-200 rounded-xl p-3 overflow-auto whitespace-pre-wrap break-words text-slate-900" dir="ltr">
              {toMrk(marc)}
            </pre>
          )}
        </>
      )}
    </section>
  );
}
