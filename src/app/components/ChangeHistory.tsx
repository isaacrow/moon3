/**
 * Who changed what and when, for a vendor, fund, order, invoice, subscription or borrower (plan step H5; written by
 * the database's history trigger, read from GET /history/:entity/:id). Opens on demand under the entry's form.
 */
import React, { useState } from 'react';
import { History } from 'lucide-react';
import { moonFetch } from '../utils/moonApi';

interface Entry { id: number; action: 'created' | 'changed' | 'deleted'; at: string; actor: string | null; changed: string[]; before: Record<string, unknown> | null; after: Record<string, unknown> | null }

const shown = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function ChangeHistory({ entity, id, isAr, labels = {} }: { entity: string; id: string | number; isAr: boolean; labels?: Record<string, string> }) {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [open, setOpen] = useState(false);
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && rows === null) {
      const r = await moonFetch<any>(`/history/${entity}/${encodeURIComponent(String(id))}`);
      setRows(r.ok ? r.data.history : []);
    }
  };
  const when = (iso: string) => new Date(iso).toLocaleString(isAr ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="sm:col-span-2 text-xs">
      <button type="button" onClick={toggle} className="inline-flex items-center gap-1 font-bold text-slate-700 underline cursor-pointer">
        <History className="h-3.5 w-3.5" />{isAr ? 'سجل التغييرات' : 'History of changes'}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 moon-stagger">
          {rows === null && <li className="text-slate-500">…</li>}
          {rows?.length === 0 && <li className="text-slate-500">{isAr ? 'لا تغييرات مسجلة بعد.' : 'No changes recorded yet.'}</li>}
          {rows?.map((h) => (
            <li key={h.id} className="rounded-lg bg-white/60 px-2 py-1">
              <span className="font-bold text-slate-800">{when(h.at)}</span>
              <span className="text-slate-600"> · {h.actor || (isAr ? 'غير معروف' : 'unknown')} · </span>
              <span className="text-slate-800">{h.action === 'created' ? (isAr ? 'أُنشئ' : 'created') : h.action === 'deleted' ? (isAr ? 'حُذف' : 'deleted') : ''}</span>
              {h.action === 'changed' && (
                <span className="text-slate-800">
                  {h.changed.map((k) => (
                    <span key={k} className="me-2">
                      <b>{labels[k] || k}</b>: {h.before ? <span className="line-through text-slate-500">{shown(h.before[k])}</span> : null} → {h.after ? shown(h.after[k]) : (isAr ? '(محذوف)' : '(removed)')}
                    </span>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
