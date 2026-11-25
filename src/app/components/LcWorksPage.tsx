/**
 * Link works to LC (/lc-works/, plan step A3): each record's work beside its best candidates among the Library of
 * Congress's Works and Hubs (lcWorks.tsx scores them: contributors above titles), and a person decides: link this
 * one, not this one, or "not in LC". Nothing is linked without a person. Records not yet linked come first.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Link2, Check, X, Ban, ExternalLink, ShieldAlert, Search, Loader2 } from 'lucide-react';
import { moonFetch } from '../utils/moonApi';
import { glass, input, dark, light } from './CirculationDesk';

interface Row { id: string; title: string; status: string; linked: string[]; decision: { rejected: string[]; noMatch?: { by: string; at: string }; checkedAt?: string } }
interface Cand { uri: string; kind: 'work' | 'hub'; label: string; titles: string[]; contributors: string[]; languages: string[]; dates: string[]; score: number; reasons: string[] }
interface Detail { id: string; title: string; facts: { titles: string[]; contributors: string[]; language?: string; year?: number; linked: string[] }; candidates: Cand[]; lcDown?: boolean }

const REASONS: Record<string, [string, string]> = {
  'same LCCN': ['same LCCN', 'رقم LCCN نفسه'], title: ['title', 'العنوان'], 'title in part': ['title in part', 'جزء من العنوان'],
  contributor: ['contributor', 'المؤلف'], 'contributor in part': ['contributor in part', 'جزء من اسم المؤلف'], 'other contributor': ['another contributor', 'مؤلف آخر'],
  language: ['language', 'اللغة'], year: ['year', 'السنة'], 'other language': ['another language', 'لغة أخرى'], selections: ['selections', 'مختارات'],
};

export function LcWorksPage({ isAr, onOpenRecord }: { isAr: boolean; onOpenRecord?: (id: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [filter, setFilter] = useState('');
  const [show, setShow] = useState<'todo' | 'linked' | 'all'>('todo');
  const [current, setCurrent] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const L = (en: string, ar: string) => (isAr ? ar : en);

  const load = useCallback(() => {
    moonFetch<any>('/lc-works').then((r) => {
      if (r.status === 403) setDenied(true);
      else if (r.ok) setRows(r.data.records || []);
      else setRows([]);
    });
  }, []);
  useEffect(load, [load]);

  const open = async (id: string) => {
    setCurrent(id); setDetail(null); setLoading(true);
    const r = await moonFetch<any>(`/lc-works/${encodeURIComponent(id)}`);
    setLoading(false);
    if (!r.ok) { toast.error(r.data?.error || L('LC could not be searched just now', 'تعذر البحث في مكتبة الكونغرس الآن')); return; }
    setDetail(r.data);
  };

  const decide = async (body: Record<string, unknown>, done: string) => {
    if (!current) return;
    const r = await moonFetch<any>(`/lc-works/${encodeURIComponent(current)}`, { body });
    if (!r.ok) { toast.error(r.data?.error || L('Not saved', 'لم يُحفظ')); return; }
    toast.success(done);
    if (body.accept) {
      setRows((rs) => rs && rs.map((x) => (x.id === current ? { ...x, linked: r.data.facts.linked } : x)));
      setDetail((d) => d && { ...d, facts: { ...d.facts, linked: r.data.facts.linked }, candidates: d.candidates.filter((c) => c.uri !== body.accept) });
    } else if (body.reject) {
      setDetail((d) => d && { ...d, candidates: d.candidates.filter((c) => c.uri !== body.reject) });
    } else if (body.noMatch) {
      setRows((rs) => rs && rs.filter((x) => x.id !== current));
      setCurrent(null); setDetail(null);
    }
  };

  const shown = useMemo(() => (rows || []).filter((r) => (show === 'all' || (show === 'linked' ? r.linked.length > 0 : r.linked.length === 0))
    && (!filter.trim() || r.title.toLowerCase().includes(filter.trim().toLowerCase()) || r.id.includes(filter.trim()))), [rows, show, filter]);
  const linkedCount = (rows || []).filter((r) => r.linked.length).length;

  if (denied) {
    return (
      <div className="max-w-xl mx-auto mt-16 p-6 text-center moon-enter" style={glass}>
        <ShieldAlert className="mx-auto h-8 w-8 mb-2 text-slate-700" />
        <p className="font-bold text-slate-900">{L('For library staff', 'لموظفي المكتبة')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 py-4 grid gap-4 lg:grid-cols-[340px_1fr]" dir={isAr ? 'rtl' : 'ltr'}>
      <aside className="p-3 h-fit moon-enter" style={glass}>
        <h2 className="font-bold text-slate-900 flex items-center gap-1.5"><Link2 className="h-4 w-4" />{L('Link works to LC', 'ربط الأعمال بمكتبة الكونغرس')}</h2>
        <p className="text-xs text-slate-600 mt-1">
          {rows ? L(`${linkedCount} of ${rows.length} works linked to an LC Work or Hub`, `${linkedCount} من ${rows.length} عملًا مربوطة بعمل أو مجمّع في مكتبة الكونغرس`) : '…'}
        </p>
        <div className="flex gap-1 my-2">
          {(['todo', 'linked', 'all'] as const).map((k) => (
            <button key={k} onClick={() => setShow(k)} className={`px-2.5 py-1 rounded-full text-xs font-bold border cursor-pointer ${show === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white/70 text-slate-700 border-slate-300'}`}>
              {k === 'todo' ? L('Not linked', 'غير مربوطة') : k === 'linked' ? L('Linked', 'مربوطة') : L('All', 'الكل')}
            </button>
          ))}
        </div>
        <input className={input} placeholder={L('Find a title or number', 'ابحث بعنوان أو رقم')} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ul className="mt-2 max-h-[65vh] overflow-y-auto space-y-0.5">
          {shown.slice(0, 300).map((r) => (
            <li key={r.id}>
              <button onClick={() => open(r.id)} className={`w-full text-start rounded-xl px-2 py-1.5 transition-colors cursor-pointer ${current === r.id ? 'bg-slate-900 text-white' : 'hover:bg-white/80 text-slate-900'}`}>
                <span className="block text-sm font-bold truncate" dir="auto">{r.title}</span>
                <span className="block text-[11px] opacity-70">{r.id}{r.linked.length ? L(' · linked', ' · مربوط') : r.decision.checkedAt ? L(' · looked at', ' · رُوجع') : ''}</span>
              </button>
            </li>
          ))}
          {rows && !shown.length && <li className="text-xs text-slate-600 p-2">{L('Nothing here.', 'لا شيء هنا.')}</li>}
        </ul>
      </aside>

      <main className="space-y-3 min-w-0">
        {!current && (
          <section className="p-5 moon-enter" style={glass}>
            <p className="text-sm text-slate-800">{L(
              'Choose a work. Moon asks the Library of Congress for Works and Hubs by its contributor and title and scores each: the contributor counts more than the title, the same LCCN settles it. You decide each link: a Hub becomes the work\'s “expression of”, an LC Work its “same as”, in a new version of the record.',
              'اختر عملًا. يسأل مون مكتبة الكونغرس عن الأعمال والمجمّعات بالمؤلف والعنوان ويقيّم كلًّا منها: المؤلف أثقل من العنوان، ورقم LCCN نفسه يحسم. وأنت تقرر كل رابط: المجمّع يصير «تعبيرًا عن» والعمل «هو نفسه»، في نسخة جديدة من التسجيلة.')}</p>
          </section>
        )}
        {current && (
          <section className="p-4 moon-enter" style={glass}>
            {loading && <p className="text-sm text-slate-600 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{L('Asking the Library of Congress…', 'جارٍ السؤال في مكتبة الكونغرس…')}</p>}
            {detail && (
              <>
                <div className="flex flex-wrap items-baseline gap-2 justify-between">
                  <h3 className="font-bold text-slate-900 text-lg" dir="auto">{detail.title}</h3>
                  {onOpenRecord && <button className="text-xs underline cursor-pointer" onClick={() => onOpenRecord(detail.id)}>{L('Open the record', 'افتح التسجيلة')}</button>}
                </div>
                <p className="text-xs text-slate-700 mt-1" dir="auto">
                  {[detail.facts.contributors.slice(0, 2).join(' · '), detail.facts.language, detail.facts.year].filter(Boolean).join(' · ')}
                </p>
                {detail.facts.linked.length > 0 && (
                  <p className="text-xs text-emerald-800 mt-2 font-bold">{L('Linked: ', 'مربوط: ')}
                    {detail.facts.linked.map((u) => <a key={u} href={u} target="_blank" rel="noopener" className="underline me-2" dir="ltr">{u.replace('http://id.loc.gov/resources/', '')}</a>)}
                  </p>
                )}
                {detail.lcDown && <p className="text-xs text-amber-800 mt-2">{L('LC did not answer; try again in a moment.', 'لم تُجب مكتبة الكونغرس؛ أعد المحاولة بعد قليل.')}</p>}
                <ul className="mt-3 space-y-2 moon-stagger">
                  {detail.candidates.map((c) => (
                    <li key={c.uri} className="rounded-xl p-3 bg-white/70 border border-slate-200">
                      <div className="flex items-start gap-3">
                        <div className="w-14 shrink-0 text-center">
                          <div className={`text-lg font-black ${c.score >= 0.85 ? 'text-emerald-700' : c.score >= 0.6 ? 'text-amber-700' : 'text-slate-500'}`}>{Math.round(c.score * 100)}</div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">{c.kind === 'hub' ? L('Hub', 'مجمّع') : L('Work', 'عمل')}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <a href={c.uri} target="_blank" rel="noopener" className="font-bold text-slate-900 hover:underline inline-flex items-center gap-1" dir="auto">{c.label}<ExternalLink className="h-3 w-3 opacity-60" /></a>
                          <div className="text-xs text-slate-600" dir="auto">{[c.languages.join(', '), c.dates.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {c.reasons.map((r) => <span key={r} className={`text-[11px] px-2 rounded-full ${/other|selections/.test(r) ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>{REASONS[r]?.[isAr ? 1 : 0] || r}</span>)}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <button className={`${dark} py-1 px-3 text-xs`} onClick={() => decide({ accept: c.uri }, L('Linked', 'رُبط'))}><Check className="h-3.5 w-3.5" />{L('Link', 'اربط')}</button>
                          <button className={`${light} py-1 px-3 text-xs`} onClick={() => decide({ reject: c.uri }, L('Not this one', 'ليس هذا'))}><X className="h-3.5 w-3.5" />{L('Not this', 'ليس هذا')}</button>
                        </div>
                      </div>
                    </li>
                  ))}
                  {!detail.candidates.length && !detail.lcDown && <li className="text-sm text-slate-600 flex items-center gap-2"><Search className="h-4 w-4" />{L('LC has nothing close to this work.', 'لا شيء قريب من هذا العمل في مكتبة الكونغرس.')}</li>}
                </ul>
                <button className={`${light} mt-3`} onClick={() => decide({ noMatch: true }, L('Marked as not in LC', 'عُلّم: ليس في مكتبة الكونغرس'))}><Ban className="h-4 w-4" />{L('Not in LC', 'ليس في مكتبة الكونغرس')}</button>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
