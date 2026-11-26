/**
 * Quality checks (/quality/, plan step D3; server: quality.tsx): what the nightly checker flagged, each with its
 * reason: links gone or pointing at another name, likely duplicate records, entities with the same name. It never
 * changes anything; a person opens each item and decides.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ScanSearch, RefreshCw, ExternalLink } from 'lucide-react';
import { moonFetch } from '../utils/moonApi';
import { glass, dark } from './CirculationDesk';

interface Finding { kind: string; severity: 'check' | 'look'; en: string; ar: string; items: Array<{ type: 'record' | 'entity' | 'link'; id: string; label: string }> }
interface Report { at: string; findings: Finding[]; counts: Record<string, number>; checked: { records: number; entities: number; links: number } }

const KINDS: Record<string, [string, string]> = {
  'link-gone': ['Links that no longer exist', 'روابط لم تعد موجودة'],
  'link-different': ['Links to another name', 'روابط إلى اسم آخر'],
  'link-malformed': ['Addresses of no known file', 'عناوين لا تتبع ملفًا معروفًا'],
  'record-same-identifier': ['Records with the same ISBN or LCCN', 'تسجيلات بالردمك أو LCCN نفسه'],
  'record-same-title': ['Same title and first contributor', 'العنوان والمساهم الأول نفسهما'],
  'entity-same-name': ['Entities with the same name', 'كيانات بالاسم نفسه'],
};

export function QualityPage({ isAr, onOpenRecord, onOpenEntities }: { isAr: boolean; onOpenRecord?: (id: string) => void; onOpenEntities?: () => void }) {
  const [report, setReport] = useState<Report | null | undefined>(undefined);
  const [canRun, setCanRun] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<string>('all');
  const L = (en: string, ar: string) => (isAr ? ar : en);
  useEffect(() => { moonFetch<any>('/quality').then((r) => { if (r.ok) { setReport(r.data.report); setCanRun(r.data.canRun); } else setReport(null); }); }, []);
  const run = async () => {
    setBusy(true);
    const r = await moonFetch<any>('/quality/run', { method: 'POST' });
    setBusy(false);
    if (!r.ok) { toast.error(r.data?.error || L('The check failed', 'تعذّر الفحص')); return; }
    setReport(r.data);
  };
  const shown = useMemo(() => (report?.findings || []).filter((f) => kind === 'all' || f.kind === kind), [report, kind]);

  return (
    <div className="max-w-5xl mx-auto px-3 md:px-6 py-4 space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
      <section className="p-5 moon-enter" style={glass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2"><ScanSearch className="h-5 w-5" />{L('Quality checks', 'فحص الجودة')}</h2>
            <p className="text-sm text-slate-700 mt-1">{L('Each night Moon reads the catalogue and flags what a person should look at, with the reason. It never changes anything.', 'يقرأ مون الفهرس كل ليلة ويشير إلى ما ينبغي أن يراه شخص، مع السبب. ولا يغيّر شيئًا.')}</p>
            {report && <p className="text-xs text-slate-600 mt-1">{L(`Last checked ${new Date(report.at).toLocaleString('en-GB')}: ${report.checked.records} records, ${report.checked.entities} entities, ${report.checked.links} outside links.`, `آخر فحص ${new Date(report.at).toLocaleString('ar-EG')}: ${report.checked.records} تسجيلة، ${report.checked.entities} كيانًا، ${report.checked.links} رابطًا خارجيًا.`)}</p>}
          </div>
          {canRun && <button className={dark} disabled={busy} onClick={run}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />{L('Check now', 'افحص الآن')}</button>}
        </div>
        {report === null && <p className="text-sm text-slate-600 mt-3">{L('No check has run yet; it runs each night.', 'لم يُجرَ فحص بعد؛ يجري كل ليلة.')}</p>}
        {report && (
          <div className="flex flex-wrap gap-1 mt-3">
            <button onClick={() => setKind('all')} className={`px-2.5 py-1 rounded-full text-xs font-bold border cursor-pointer ${kind === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white/70 text-slate-700 border-slate-300'}`}>{L('All', 'الكل')} · {report.findings.length}</button>
            {Object.entries(KINDS).map(([k, [en, ar]]) => (
              <button key={k} onClick={() => setKind(k)} disabled={!report.counts[k]} className={`px-2.5 py-1 rounded-full text-xs font-bold border cursor-pointer disabled:opacity-40 disabled:cursor-default ${kind === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white/70 text-slate-700 border-slate-300'}`}>
                {isAr ? ar : en} · {report.counts[k] || 0}
              </button>
            ))}
          </div>
        )}
      </section>

      {report && (
        <section className="p-4 moon-enter" style={glass}>
          {!shown.length && <p className="text-sm text-slate-700">{L('Nothing flagged.', 'لا شيء.')}</p>}
          <ul className="divide-y divide-slate-200 moon-stagger">
            {shown.slice(0, 300).map((f, i) => (
              <li key={i} className="py-2">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 text-[10px] font-black uppercase rounded-full px-2 ${f.severity === 'check' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>{f.severity === 'check' ? L('check', 'راجِع') : L('look', 'انظر')}</span>
                  <span className="text-sm text-slate-900" dir="auto">{isAr ? f.ar : f.en}</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-1 ms-12">
                  {f.items.map((it) => it.type === 'record'
                    ? <button key={it.id} className="text-xs underline cursor-pointer" dir="auto" onClick={() => onOpenRecord?.(it.id)}>{it.label} ({it.id})</button>
                    : it.type === 'link'
                      ? <a key={it.id} className="text-xs underline inline-flex items-center gap-0.5" href={it.id} target="_blank" rel="noopener" dir="ltr">{it.id}<ExternalLink className="h-3 w-3" /></a>
                      : <button key={it.id} className="text-xs underline cursor-pointer" dir="auto" onClick={() => onOpenEntities?.()}>{it.label}</button>)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
