/**
 * Lists (/lists/): build a list of books, copies, loans, borrowers, holds, orders, invoices, subscriptions, vendors
 * or funds from conditions, see it, save it, refresh it later and export it as CSV. The fields, operators and
 * query engine are the server's own (supabase/functions/server/lists.tsx), so what is offered here is exactly what
 * the server accepts; listsRoutes.tsx reads the library's rows.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ListFilter, Plus, X, Play, Save, RefreshCw, Download, Trash2, Lock, ShieldAlert, ArrowDownAZ, ArrowUpAZ } from 'lucide-react';
import { moonFetch, moonHeaders, MOON_API } from '../utils/moonApi';
import { glass, input, dark, light } from './CirculationDesk';
import {
  ENTITIES, ENTITY_IDS, OPS_BY_TYPE, OP_NAMES, shown,
  type Condition, type EntityId, type ListField, type ListQuery, type Op,
} from '../../../supabase/functions/server/lists.tsx';

interface Saved { id: string; name: string; description?: string | null; entity: EntityId; query: ListQuery; private: boolean; row_count?: number | null; refreshed_at?: string | null; created_by: string; updated_at: string }
interface Result { total: number; rows: Array<Record<string, unknown>>; capped: boolean }

const entityFromUrl = (): EntityId => {
  const t = new URLSearchParams(window.location.search).get('tab') as EntityId;
  return ENTITIES[t] ? t : 'books';
};
const blank = (entity: EntityId): ListQuery => ({ entity, match: 'all', conditions: [], columns: ENTITIES[entity].columns });

export function ListsPage({ isAr, onOpenRecord }: { isAr: boolean; onOpenRecord?: (id: string) => void }) {
  const [query, setQuery] = useState<ListQuery>(() => blank(entityFromUrl()));
  const [result, setResult] = useState<Result | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [current, setCurrent] = useState<Saved | null>(null);
  const [name, setName] = useState('');
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const entity = ENTITIES[query.entity];
  const L = (en: string, ar: string) => (isAr ? ar : en);
  const fieldOf = (k: string) => entity.fields.find((f) => f.key === k)!;
  const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(isAr ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '');

  const loadSaved = useCallback(() => {
    moonFetch<any>('/lists').then((r) => {
      if (r.status === 403) setDenied(true);
      else if (r.ok) setSaved(r.data.lists || []);
    });
  }, []);
  useEffect(loadSaved, [loadSaved]);
  // A section menu opens Lists on another kind of row (?tab=); start a new list of that kind.
  useEffect(() => {
    const onPop = () => { const id = entityFromUrl(); setQuery((q) => (q.entity === id ? q : blank(id))); setResult(null); setCurrent(null); setName(''); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const setEntity = (id: EntityId) => {
    setQuery(blank(id)); setResult(null); setCurrent(null); setName('');
    const u = new URL(window.location.href); u.searchParams.set('tab', id); window.history.replaceState(null, '', u.pathname + u.search);
  };
  const setCond = (i: number, patch: Partial<Condition>) => setQuery((q) => ({ ...q, conditions: q.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const addCond = () => {
    const f = entity.fields[0];
    setQuery((q) => ({ ...q, conditions: [...q.conditions, { field: f.key, op: OPS_BY_TYPE[f.type][0], value: '' }] }));
  };
  const toggleColumn = (k: string) => setQuery((q) => ({ ...q, columns: q.columns.includes(k) ? q.columns.filter((x) => x !== k) : [...q.columns, k] }));

  const run = async (q = query) => {
    setBusy(true);
    const r = await moonFetch<any>('/lists/run', { body: { query: q } });
    setBusy(false);
    if (r.status === 403) { setDenied(true); return; }
    if (!r.ok) { toast.error(r.data?.error || L('The list could not be made', 'تعذر إنشاء القائمة')); return; }
    setResult({ total: r.data.total, rows: r.data.rows, capped: r.data.capped });
  };

  const open = (s: Saved) => {
    setCurrent(s); setName(s.name); setPriv(s.private); setQuery(s.query); setResult(null);
    void run(s.query);
  };

  const save = async () => {
    if (!name.trim()) { toast.error(L('Give the list a name', 'اكتب اسمًا للقائمة')); return; }
    const body = { name, query, private: priv };
    const r = current ? await moonFetch<any>(`/lists/${current.id}`, { method: 'PUT', body }) : await moonFetch<any>('/lists', { body });
    if (!r.ok) { toast.error(r.data?.error || L('The list could not be saved', 'تعذر حفظ القائمة')); return; }
    setCurrent(r.data.list);
    toast.success(L('List saved', 'حُفظت القائمة'));
    loadSaved();
  };

  const refresh = async () => {
    if (!current) return;
    setBusy(true);
    const r = await moonFetch<any>(`/lists/${current.id}/refresh`, { method: 'POST' });
    setBusy(false);
    if (!r.ok) { toast.error(r.data?.error || L('The list could not be refreshed', 'تعذر تحديث القائمة')); return; }
    setResult({ total: r.data.total, rows: r.data.rows, capped: r.data.capped });
    setCurrent(r.data.list);
    loadSaved();
  };

  const remove = async (s: Saved) => {
    if (!window.confirm(L(`Delete the list “${s.name}”? The rows themselves are not touched.`, `حذف القائمة «${s.name}»؟ لا يُمسّ شيء من البيانات نفسها.`))) return;
    const r = await moonFetch<any>(`/lists/${s.id}`, { method: 'DELETE' });
    if (!r.ok) { toast.error(r.data?.error || L('The list could not be deleted', 'تعذر حذف القائمة')); return; }
    if (current?.id === s.id) { setCurrent(null); setName(''); }
    loadSaved();
  };

  const exportCsv = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${MOON_API}/lists/export`, { method: 'POST', headers: moonHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ query, lang: isAr ? 'ar' : 'en' }) });
      if (!res.ok) { toast.error(L('The list could not be exported', 'تعذر تصدير القائمة')); return; }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(name || (isAr ? entity.ar : entity.en)).replace(/[\\/:*?"<>|]+/g, ' ').trim()}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally { setBusy(false); }
  };

  const columns = useMemo(() => query.columns.map(fieldOf).filter(Boolean), [query]); // eslint-disable-line react-hooks/exhaustive-deps

  if (denied) {
    return (
      <div className="max-w-xl mx-auto mt-16 p-6 text-center moon-enter" style={glass}>
        <ShieldAlert className="mx-auto h-8 w-8 mb-2 text-slate-700" />
        <p className="font-bold text-slate-900">{L('Lists are for library staff', 'القوائم لموظفي المكتبة')}</p>
        <p className="text-sm text-slate-600 mt-1">{L('Sign in as a cataloguer, a reviewer or the Super Admin.', 'سجّل الدخول مفهرسًا أو مراجعًا أو مديرًا عامًا.')}</p>
      </div>
    );
  }

  const valueInput = (c: Condition, i: number, f: ListField) => {
    if (c.op === 'empty') return null;
    if (f.type === 'bool') {
      return (
        <select className={input} value={String(c.value || '')} onChange={(e) => setCond(i, { value: e.target.value })}>
          <option value="">—</option><option value="true">{L('Yes', 'نعم')}</option><option value="false">{L('No', 'لا')}</option>
        </select>
      );
    }
    if (f.type === 'choice' && c.op === 'is') {
      return (
        <select className={input} value={String(c.value || '')} onChange={(e) => setCond(i, { value: e.target.value })}>
          <option value="">—</option>
          {f.choices!.map((ch) => <option key={ch.v} value={ch.v}>{isAr ? ch.ar : ch.en}</option>)}
        </select>
      );
    }
    if (f.type === 'choice' && c.op === 'anyOf') {
      const vs = Array.isArray(c.value) ? c.value : [];
      return (
        <div className="flex flex-wrap gap-1">
          {f.choices!.map((ch) => {
            const on = vs.includes(ch.v);
            return (
              <button key={ch.v} type="button" onClick={() => setCond(i, { value: on ? vs.filter((x) => x !== ch.v) : [...vs, ch.v] })}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border cursor-pointer transition-colors ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white/80 text-slate-800 border-slate-300'}`}>
                {isAr ? ch.ar : ch.en}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <input className={input}
        type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
        placeholder={c.op === 'anyOf' ? L('Values, separated by commas', 'قيم تفصل بينها فواصل') : ''}
        value={Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '')}
        onChange={(e) => setCond(i, { value: e.target.value })} />
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 py-4 grid gap-4 lg:grid-cols-[260px_1fr]" dir={isAr ? 'rtl' : 'ltr'}>
      <aside className="p-3 h-fit moon-enter" style={glass}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-slate-900 flex items-center gap-1.5"><ListFilter className="h-4 w-4" />{L('Saved lists', 'القوائم المحفوظة')}</h2>
          <button className="p-1 rounded-full hover:bg-white cursor-pointer" title={L('New list', 'قائمة جديدة')} onClick={() => setEntity(query.entity)}><Plus className="h-4 w-4" /></button>
        </div>
        {!saved.length && <p className="text-xs text-slate-600">{L('None yet. Build a list and save it to see it here for everyone in the library.', 'لا شيء بعد. أنشئ قائمة واحفظها لتظهر هنا لكل من في المكتبة.')}</p>}
        <ul className="space-y-1 moon-stagger">
          {saved.map((s) => (
            <li key={s.id}>
              <div className={`group flex items-start gap-1 rounded-xl px-2 py-1.5 cursor-pointer transition-colors ${current?.id === s.id ? 'bg-slate-900 text-white' : 'hover:bg-white/80 text-slate-900'}`} onClick={() => open(s)}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate flex items-center gap-1">{s.private && <Lock className="h-3 w-3 shrink-0" />}{s.name}</div>
                  <div className="text-[11px] opacity-70">
                    {isAr ? ENTITIES[s.entity]?.ar : ENTITIES[s.entity]?.en}
                    {s.row_count != null && ` · ${s.row_count.toLocaleString(isAr ? 'ar-EG' : 'en')}`}
                  </div>
                </div>
                <button className="opacity-0 group-hover:opacity-70 hover:opacity-100 cursor-pointer" title={L('Delete', 'حذف')} onClick={(e) => { e.stopPropagation(); void remove(s); }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <main className="space-y-4 min-w-0">
        <section className="p-4 moon-enter" style={glass}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-sm font-bold text-slate-700">{L('List', 'اعرض')}</span>
            <select className={`${input} w-auto`} value={query.entity} onChange={(e) => setEntity(e.target.value as EntityId)}>
              {ENTITY_IDS.map((id) => <option key={id} value={id}>{isAr ? ENTITIES[id].ar : ENTITIES[id].en}</option>)}
            </select>
            {query.conditions.length > 1 && (
              <>
                <span className="text-sm font-bold text-slate-700">{L('matching', 'التي تطابق')}</span>
                <select className={`${input} w-auto`} value={query.match} onChange={(e) => setQuery((q) => ({ ...q, match: e.target.value as 'all' | 'any' }))}>
                  <option value="all">{L('all conditions', 'كل الشروط')}</option>
                  <option value="any">{L('any condition', 'أي شرط')}</option>
                </select>
              </>
            )}
          </div>

          <div className="space-y-2 moon-stagger">
            {query.conditions.map((c, i) => {
              const f = fieldOf(c.field);
              return (
                <div key={i} className="grid gap-2 items-center md:grid-cols-[1fr_auto_1fr_1.4fr_auto]">
                  <select className={input} value={c.field} onChange={(e) => { const nf = fieldOf(e.target.value); setCond(i, { field: nf.key, op: OPS_BY_TYPE[nf.type][0], value: '' }); }}>
                    {entity.fields.map((x) => <option key={x.key} value={x.key}>{isAr ? x.ar : x.en}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs font-bold text-slate-700 cursor-pointer" title={L('Turn the condition around', 'اعكس الشرط')}>
                    <input type="checkbox" checked={!!c.not} onChange={(e) => setCond(i, { not: e.target.checked })} />{L('NOT', 'ليس')}
                  </label>
                  <select className={input} value={c.op} onChange={(e) => setCond(i, { op: e.target.value as Op, value: e.target.value === 'anyOf' ? [] : '' })}>
                    {OPS_BY_TYPE[f.type].map((op) => <option key={op} value={op}>{isAr ? OP_NAMES[op].ar : OP_NAMES[op].en}</option>)}
                  </select>
                  <div>{valueInput(c, i, f)}</div>
                  <button className="p-1.5 rounded-full hover:bg-white cursor-pointer" title={L('Remove', 'إزالة')} onClick={() => setQuery((q) => ({ ...q, conditions: q.conditions.filter((_, j) => j !== i) }))}><X className="h-4 w-4" /></button>
                </div>
              );
            })}
          </div>
          <button className={`${light} mt-3`} onClick={addCond}><Plus className="h-4 w-4" />{L('Add a condition', 'أضف شرطًا')}</button>

          <div className="mt-4">
            <div className="text-xs font-bold text-slate-700 mb-1">{L('Columns', 'الأعمدة')}</div>
            <div className="flex flex-wrap gap-1">
              {entity.fields.map((f) => {
                const on = query.columns.includes(f.key);
                return (
                  <button key={f.key} type="button" onClick={() => toggleColumn(f.key)}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold border cursor-pointer transition-colors ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white/70 text-slate-700 border-slate-300'}`}>
                    {isAr ? f.ar : f.en}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700">{L('Sort by', 'رتّب حسب')}</span>
            <select className={`${input} w-auto`} value={query.sort?.field || ''} onChange={(e) => setQuery((q) => ({ ...q, sort: e.target.value ? { field: e.target.value, desc: q.sort?.desc } : undefined }))}>
              <option value="">{L('as stored', 'كما هي')}</option>
              {entity.fields.map((f) => <option key={f.key} value={f.key}>{isAr ? f.ar : f.en}</option>)}
            </select>
            {query.sort && (
              <button className={light} onClick={() => setQuery((q) => ({ ...q, sort: q.sort && { ...q.sort, desc: !q.sort.desc } }))}>
                {query.sort.desc ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}{query.sort.desc ? L('Descending', 'تنازلي') : L('Ascending', 'تصاعدي')}
              </button>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap items-center gap-2">
            <button className={dark} disabled={busy} onClick={() => run()}><Play className="h-4 w-4" />{L('Show the list', 'اعرض القائمة')}</button>
            <input className={`${input} w-56`} placeholder={L('Name, to save it', 'اسم لحفظها')} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            <label className="flex items-center gap-1 text-xs font-bold text-slate-700 cursor-pointer"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />{L('Only me', 'لي وحدي')}</label>
            <button className={light} disabled={busy} onClick={save}><Save className="h-4 w-4" />{current ? L('Save changes', 'احفظ التغييرات') : L('Save', 'احفظ')}</button>
            {current && <button className={light} disabled={busy} onClick={refresh}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />{L('Refresh', 'حدّث')}</button>}
            <button className={light} disabled={busy} onClick={exportCsv}><Download className="h-4 w-4" />CSV</button>
            {current?.refreshed_at && <span className="text-[11px] text-slate-600">{L('Refreshed', 'حُدّثت')} {fmtDate(current.refreshed_at)}</span>}
          </div>
        </section>

        {result && (
          <section className="p-4 moon-enter" style={glass}>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="font-bold text-slate-900">
                {result.total.toLocaleString(isAr ? 'ar-EG' : 'en')} {isAr ? entity.ar : entity.en.toLowerCase()}
              </h3>
              {result.total > result.rows.length && <span className="text-xs text-slate-600">{L(`The first ${result.rows.length} shown; the CSV has them all.`, `تظهر أول ${result.rows.length}؛ ملف CSV فيه الكل.`)}</span>}
            </div>
            {result.capped && <p className="text-xs text-amber-800 mb-2">{L('Only the first 5,000 rows of this kind were read.', 'قُرئت أول ٥٠٠٠ فقط من هذا النوع.')}</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-600 text-xs border-b border-slate-200">
                    {columns.map((f) => <th key={f.key} className="py-1.5 px-2 text-start font-bold whitespace-nowrap">{isAr ? f.ar : f.en}</th>)}
                  </tr>
                </thead>
                <tbody className="moon-stagger">
                  {result.rows.map((r, i) => {
                    const rec = typeof r.record_id === 'string' ? r.record_id : query.entity === 'books' ? String(r.id) : '';
                    return (
                      <tr key={i} className={`border-b border-slate-100 ${rec && onOpenRecord ? 'cursor-pointer hover:bg-white/70' : ''}`} onClick={() => rec && onOpenRecord?.(rec)}>
                        {columns.map((f) => <td key={f.key} className="py-1.5 px-2 text-slate-900">{shown(r, f, isAr)}</td>)}
                      </tr>
                    );
                  })}
                  {!result.rows.length && <tr><td className="py-4 px-2 text-slate-600" colSpan={columns.length || 1}>{L('Nothing matches.', 'لا شيء يطابق.')}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
