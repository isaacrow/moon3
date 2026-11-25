/**
 * Bulk change on the Lists screen (plan step H3; server: listsRoutes.tsx and bulkEdit.tsx): set one field on every
 * row of the list. The preview shows each change, before → after, and what is left alone; nothing is written until
 * "Change N"; every job can be undone from Recent bulk changes, which puts back each row not changed again since.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Wand2, Eye, Check, Undo2, History } from 'lucide-react';
import { moonFetch } from '../utils/moonApi';
import { glass, input, dark, light } from './CirculationDesk';
import { BULK_FIELDS, type BulkField } from '../../../supabase/functions/server/bulkEdit.tsx';
import type { ListQuery } from '../../../supabase/functions/server/lists.tsx';

interface Preview { total: number; changes: Array<{ key: string; label: string; before: unknown; after: unknown }>; unchanged: number; skipped: Array<{ label: string; why: string }>; skippedTotal: number; max: number }
interface Job { id: number; label: string; entity: string; total: number; applied: number; failed: number; created_by: string; created_at: string; undone_at?: string | null; restored?: number | null; kept?: number | null }

const shownValue = (f: BulkField, v: unknown, isAr: boolean) => {
  if (v === null || v === undefined || v === '') return '—';
  if (f.type === 'bool') return v ? (isAr ? 'نعم' : 'Yes') : (isAr ? 'لا' : 'No');
  if (f.type === 'date') return String(v).slice(0, 10);
  if (f.type === 'choice') { const c = f.choices?.find((x) => x.v === v); return c ? (isAr ? c.ar : c.en) : String(v); }
  return String(v);
};

export function BulkChange({ isAr, query, onDone }: { isAr: boolean; query: ListQuery; onDone: () => void }) {
  const fields = BULK_FIELDS.filter((f) => f.entity === query.entity);
  const [key, setKey] = useState(fields[0]?.key || '');
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const L = (en: string, ar: string) => (isAr ? ar : en);
  const field = fields.find((f) => f.key === key);
  useEffect(() => { setKey(fields[0]?.key || ''); setValue(''); setPreview(null); }, [query.entity]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPreview(null); }, [query, key, value]);
  if (!fields.length || !field) return null;

  const body = () => ({ query, field: key, value });
  const look = async () => {
    setBusy(true);
    const r = await moonFetch<any>('/lists/bulk/preview', { body: body() });
    setBusy(false);
    if (!r.ok) { toast.error(r.data?.error || L('The preview could not be made', 'تعذر إعداد المعاينة')); return; }
    setPreview(r.data);
  };
  const apply = async () => {
    if (!preview?.total) return;
    if (!window.confirm(L(`Change ${preview.total} rows? You can undo it from Recent bulk changes.`, `تغيير ${preview.total} صفًا؟ يمكنك التراجع عنه من «آخر التغييرات الجماعية».`))) return;
    setBusy(true);
    const r = await moonFetch<any>('/lists/bulk/apply', { body: { ...body(), expect: preview.total } });
    setBusy(false);
    if (!r.ok) { toast.error(r.data?.error || L('The change could not be made', 'تعذر التغيير')); return; }
    const j = r.data.job;
    toast.success(L(`${j.applied} changed${j.failed ? `, ${j.failed} left as they were (changed meanwhile)` : ''}`, `تغيّر ${j.applied}${j.failed ? `، وبقي ${j.failed} كما هو (تغيّر في الأثناء)` : ''}`));
    setPreview(null);
    onDone();
  };

  return (
    <section className="p-4 moon-enter" style={glass}>
      <h3 className="font-bold text-slate-900 flex items-center gap-1.5 mb-2"><Wand2 className="h-4 w-4" />{L('Change in bulk', 'تغيير جماعي')}</h3>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-700">{L('Set', 'اجعل')}</span>
        <select className={`${input} w-auto`} value={key} onChange={(e) => { setKey(e.target.value); setValue(''); }}>
          {fields.map((f) => <option key={f.key} value={f.key}>{isAr ? f.ar : f.en}</option>)}
        </select>
        <span className="text-sm text-slate-700">{L('to', 'إلى')}</span>
        {field.type === 'bool' || field.type === 'choice' ? (
          <select className={`${input} w-auto`} value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">—</option>
            {field.type === 'bool'
              ? <><option value="true">{L('Yes', 'نعم')}</option><option value="false">{L('No', 'لا')}</option></>
              : field.choices!.map((c) => <option key={c.v} value={c.v}>{isAr ? c.ar : c.en}</option>)}
          </select>
        ) : (
          <input className={`${input} w-56`} dir={field.type === 'date' ? 'ltr' : undefined} value={value} onChange={(e) => setValue(e.target.value)} maxLength={120}
            placeholder={field.type === 'date' ? L('2026-12-01, or today+14', '2026-12-01 أو today+14') : ''} />
        )}
        <span className="text-sm text-slate-700">{L('on every row of this list', 'في كل صفوف هذه القائمة')}</span>
        <button className={light} disabled={busy || !value} onClick={look}><Eye className="h-4 w-4" />{L('Preview', 'عاين')}</button>
      </div>

      {preview && (
        <div className="mt-3 moon-enter">
          <p className="text-sm text-slate-800">
            {L(`${preview.total} will change`, `سيتغيّر ${preview.total}`)}
            {preview.unchanged ? L(` · ${preview.unchanged} already have it`, ` · ${preview.unchanged} عليها القيمة نفسها`) : ''}
            {preview.skippedTotal ? L(` · ${preview.skippedTotal} left alone`, ` · ${preview.skippedTotal} تُترك`) : ''}
          </p>
          {preview.total > preview.max && <p className="text-xs text-amber-800">{L(`At most ${preview.max} in one job; narrow the list.`, `الحد ${preview.max} في المرة الواحدة؛ ضيّق القائمة.`)}</p>}
          {preview.changes.length > 0 && (
            <div className="overflow-x-auto max-h-72 mt-2 border border-slate-200 rounded-xl">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-slate-600 border-b border-slate-200">
                  <th className="py-1.5 px-2 text-start">{L('Row', 'الصف')}</th><th className="py-1.5 px-2 text-start">{L('Now', 'الآن')}</th><th className="py-1.5 px-2 text-start">{L('Will be', 'سيصبح')}</th>
                </tr></thead>
                <tbody>
                  {preview.changes.map((ch) => (
                    <tr key={ch.key} className="border-b border-slate-100">
                      <td className="py-1 px-2 text-slate-900" dir="auto">{ch.label}</td>
                      <td className="py-1 px-2 text-slate-500 line-through">{shownValue(field, ch.before, isAr)}</td>
                      <td className="py-1 px-2 text-emerald-800 font-bold">{shownValue(field, ch.after, isAr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.total > preview.changes.length && <p className="text-xs text-slate-600 mt-1">{L(`The first ${preview.changes.length} shown.`, `تظهر أول ${preview.changes.length}.`)}</p>}
          {preview.skipped.length > 0 && (
            <details className="mt-2 text-xs text-slate-700"><summary className="cursor-pointer">{L('Left alone, and why', 'ما يُترك ولماذا')}</summary>
              <ul className="mt-1 space-y-0.5">{preview.skipped.map((s, i) => <li key={i} dir="auto">{s.label}: {s.why}</li>)}</ul>
            </details>
          )}
          <div className="mt-3 flex gap-2">
            <button className={dark} disabled={busy || !preview.total || preview.total > preview.max} onClick={apply}><Check className="h-4 w-4" />{L(`Change ${preview.total}`, `غيّر ${preview.total}`)}</button>
            <button className={light} onClick={() => setPreview(null)}>{L('Cancel', 'إلغاء')}</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The library's recent bulk changes, each with Undo while it can be undone. */
export function RecentBulk({ isAr, reload, onUndone }: { isAr: boolean; reload: number; onUndone: () => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const L = (en: string, ar: string) => (isAr ? ar : en);
  const load = useCallback(() => { moonFetch<any>('/lists/bulk').then((r) => { if (r.ok) setJobs(r.data.jobs || []); }); }, []);
  useEffect(load, [load, reload]);
  if (!jobs.length) return null;
  const undo = async (j: Job) => {
    if (!window.confirm(L(`Undo “${j.label}” on ${j.applied} rows? Rows changed again since are left as they are.`, `التراجع عن «${j.label}» في ${j.applied} صفًا؟ الصفوف التي تغيّرت بعده تبقى كما هي.`))) return;
    const r = await moonFetch<any>(`/lists/bulk/${j.id}/undo`, { method: 'POST' });
    if (!r.ok) { toast.error(r.data?.error || L('The undo could not be made', 'تعذر التراجع')); return; }
    toast.success(L(`${r.data.restored} put back${r.data.kept ? `, ${r.data.kept} changed since and left` : ''}`, `أُعيد ${r.data.restored}${r.data.kept ? `، وتُرك ${r.data.kept} تغيّر بعده` : ''}`));
    load(); onUndone();
  };
  return (
    <div className="mt-4">
      <h2 className="font-bold text-slate-900 flex items-center gap-1.5 mb-2"><History className="h-4 w-4" />{L('Recent bulk changes', 'آخر التغييرات الجماعية')}</h2>
      <ul className="space-y-1.5 moon-stagger">
        {jobs.map((j) => (
          <li key={j.id} className="rounded-xl px-2 py-1.5 bg-white/50 text-slate-900">
            <div className="text-xs font-bold" dir="auto">{j.label}</div>
            <div className="text-[11px] opacity-70">
              {j.applied} · {j.created_by} · {new Date(j.created_at).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short' })}
              {j.undone_at ? L(` · undone (${j.restored ?? 0} put back)`, ` · تُرُوجع عنه (أُعيد ${j.restored ?? 0})`) : ''}
            </div>
            {!j.undone_at && j.applied > 0 && (
              <button className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold underline cursor-pointer" onClick={() => undo(j)}><Undo2 className="h-3 w-3" />{L('Undo', 'تراجع')}</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
