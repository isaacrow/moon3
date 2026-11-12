/**
 * "Link works" (OPAC plan, stage 1 step 4): a cataloguer says how two books' works relate (translation of,
 * commentary on, contained in, continuation of, other edition …), by picking both books by title. Moon writes the
 * relation on the first book as BIBFRAME 2 does (bf:relation with LC's relationship term); the second book's page
 * shows the inverse ("Translated as") by itself. Each change is a new version of the record, undone from its history.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeftRight, Link2, Loader2, Search, Trash2, X } from 'lucide-react';
import { moonFetch } from '../utils/moonApi';
import { RELATIONS, readWorkRelations, workNodeOf, type WorkRelation } from '../../../supabase/functions/server/workRelations.tsx';

interface Rec { id: string; title: string; document?: any }

function BookPicker({ ar, label, value, onPick }: { ar: boolean; label: string; value: Rec | null; onPick: (r: Rec | null) => void }) {
  const t = (a: string, e: string) => (ar ? a : e);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Rec[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (value || q.trim().length < 2) { setFound([]); return; }
    const timer = window.setTimeout(async () => {
      setBusy(true);
      const r = await moonFetch<any>(`/records/search?q=${encodeURIComponent(q.trim())}&limit=8`).catch(() => null);
      setFound(r?.ok ? (r.data.records || []).map((x: any) => ({ id: x.id, title: x.title, document: x.document })) : []);
      setBusy(false);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [q, value]);
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="text-xs font-bold text-slate-600">{label}</div>
      {value ? (
        <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
          <span dir="auto" className="truncate font-semibold text-slate-800">{value.title}</span>
          <button type="button" onClick={() => { onPick(null); setQ(''); }} className="ms-auto rounded-full p-1 hover:bg-slate-100" aria-label={t('غيّر', 'Change')}><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث بالعنوان', 'Search by title')} dir="auto"
            className="w-full rounded-xl border border-white bg-white/80 py-2 ps-9 pe-3 text-sm outline-none focus:ring-2 focus:ring-sky-300" />
          {busy && <Loader2 className="absolute end-3 top-2.5 h-4 w-4 animate-spin text-sky-600" />}
          {found.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl bg-white shadow-lg">
              {found.map((r) => (
                <li key={r.id}><button type="button" onClick={() => onPick(r)} className="w-full px-3 py-2 text-start text-sm hover:bg-sky-50" dir="auto">{r.title}</button></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkLinksPanel({ ar, onClose }: { ar: boolean; onClose: () => void }) {
  const t = (a: string, e: string) => (ar ? a : e);
  const [source, setSource] = useState<Rec | null>(null);
  const [target, setTarget] = useState<Rec | null>(null);
  const [term, setTerm] = useState('translationof');
  const [relations, setRelations] = useState<WorkRelation[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setRelations(source?.document ? readWorkRelations(workNodeOf(source.document)) : []); }, [source]);

  const send = async (body: Record<string, unknown>) => {
    if (!source) return;
    setBusy(true);
    const r = await moonFetch<any>(`/records/${encodeURIComponent(source.id)}/work-links`, { method: 'POST', body }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { toast.error(r?.data?.error || t('تعذّر الحفظ', 'Could not save')); return; }
    setRelations(r.data.relations || []);
    toast.success(r.data.unchanged ? t('موجود من قبل', 'Already there') : body.remove ? t('أُزيل الرابط', 'Link removed') : t('رُبط العملان', 'Works linked'));
    if (!body.remove) setTarget(null);
  };

  const words = (k: string) => { const r = RELATIONS.find((x) => x.term === k); return r ? (ar ? r.ar : r.en) : k; };
  const box: React.CSSProperties = { background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.9)', borderRadius: 24 };

  return (
    <div className="p-5 space-y-4" style={box} dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3">
        <div className="me-auto">
          <div className="flex items-center gap-2 text-base font-bold text-slate-800"><ArrowLeftRight className="h-5 w-5 text-sky-700" /> {t('اربط الأعمال', 'Link works')}</div>
          <div className="text-xs text-slate-500">{t('ترجمة، شرح، جزء من، تكملة، طبعة أخرى… يُكتب على الكتاب الأول، ويظهر العكس على الثاني في الفهرس.',
            'Translation, commentary, part of, continuation, other edition … Written on the first book; the catalogue shows the inverse on the second.')}</div>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white" aria-label={t('إغلاق', 'Close')}><X className="h-4 w-4" /></button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <BookPicker ar={ar} label={t('هذا الكتاب', 'This book')} value={source} onPick={setSource} />
        <label className="space-y-1">
          <div className="text-xs font-bold text-slate-600">{t('العلاقة', 'Is')}</div>
          <select value={term} onChange={(e) => setTerm(e.target.value)} className="rounded-xl border border-white bg-white/80 px-3 py-2 text-sm">
            {RELATIONS.map((r) => <option key={r.term} value={r.term}>{ar ? r.ar : r.en}</option>)}
          </select>
        </label>
        <BookPicker ar={ar} label={t('الكتاب الآخر', 'The other book')} value={target} onPick={setTarget} />
        <button type="button" disabled={!source || !target || busy || source.id === target?.id} onClick={() => send({ target: target!.id, relationship: term })}
          className="inline-flex items-center gap-2 rounded-full bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} {t('اربط', 'Link')}
        </button>
      </div>

      {source && (
        <div className="rounded-2xl bg-white/60 p-3">
          <div className="mb-1 text-xs font-bold text-slate-700">{t('روابط هذا الكتاب', 'This book\'s links')}</div>
          {relations.length === 0 ? <p className="text-xs text-slate-500">{t('لا روابط بعد.', 'No links yet.')}</p> : (
            <ul className="space-y-1">
              {relations.map((r) => (
                <li key={`${r.term}|${r.targetUri || r.targetTitle}`} className="flex items-center gap-2 text-sm">
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-900">{words(r.term)}</span>
                  <span dir="auto" className="truncate text-slate-800">{r.targetTitle || r.targetUri}</span>
                  {r.targetUri && (
                    <button type="button" disabled={busy} onClick={() => send({ target: r.targetUri, relationship: r.term, remove: true })}
                      className="ms-auto rounded-full p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700" aria-label={t('أزل الرابط', 'Remove the link')}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
