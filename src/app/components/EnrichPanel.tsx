/**
 * "Fill names and dates from links" (OPAC plan, stage 1 step 2). For every entity already linked to LC or Wikidata,
 * Moon reads those records and offers what they add: the entity's names in the other script and its other known
 * forms, and a person's birth and death dates when the entity has none. Nothing is replaced.
 *
 * An entity whose linked record's names look like its own is ticked; one whose names differ or cannot be compared
 * (different scripts) is not, and says "check this link": the link itself may be wrong, and filling from it would
 * spread the mistake. The cataloguer looks, unticks what they do not want, and fills the ticked ones.
 */
import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Languages, Loader2, X } from 'lucide-react';
import { moonFetch } from '../utils/moonApi';
import { fetchOutsideEntity, outsideRef } from '../../services/entityImport';
import { enrichedEntityBody, enrichmentOf, type EnrichEntity, type Enrichment } from '../../services/entityEnrich';

const ARABIC = /[؀-ۿ]/;
type State = 'ready' | 'saving' | 'saved' | 'error';
interface Row { entity: EnrichEntity & { uri?: string }; x: Enrichment; checked: boolean; state: State; error?: string }

/** The LC and Wikidata records an entity links to (one of each is enough; VIAF adds nothing these two lack). */
function readableLinks(sameAs: string[] = []): string[] {
  const refs = sameAs.map(outsideRef).filter((r): r is NonNullable<ReturnType<typeof outsideRef>> => !!r);
  const lc = refs.find((r) => r.source === 'lc'), wd = refs.find((r) => r.source === 'wikidata');
  return [lc?.uri, wd?.uri].filter((u): u is string => !!u);
}

export function EnrichPanel({ ar, onClose, onSaved }: { ar: boolean; onClose: () => void; onSaved?: () => void }) {
  const t = (a: string, e: string) => (ar ? a : e);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const stopRef = useRef(false);
  const patch = (id: string, p: Partial<Row>) => setRows((rs) => rs && rs.map((r) => (r.entity.id === id ? { ...r, ...p } : r)));

  const start = async () => {
    setRunning(true);
    stopRef.current = false;
    const r = await moonFetch<any>('/authorities/reconcile-queue').catch(() => null);
    if (!r?.ok) { toast.error(t('تعذّر جلب الكيانات', 'Could not load the entities')); setRunning(false); return; }
    const linked: EnrichEntity[] = (r.data.rows || []).filter((e: any) => readableLinks(e.sameAs).length);
    setRows([]);
    setProgress({ done: 0, total: linked.length });
    let next = 0, done = 0;
    const work = async () => {
      while (next < linked.length && !stopRef.current) {
        const e = linked[next++];
        const drafts = await Promise.all(readableLinks(e.sameAs).map((u) => fetchOutsideEntity(u, { lang: ar ? 'ar' : 'en' }).catch(() => null)));
        const x = enrichmentOf(e, drafts);
        if (x) setRows((rs) => [...(rs || []), { entity: e, x, checked: x.agree === 'same', state: 'ready' }]);
        setProgress({ done: ++done, total: linked.length });
      }
    };
    await Promise.all([work(), work()]);
    setRunning(false);
  };

  /** Saves one entity with its additions (the whole entity, as read: the server replaces every field). */
  const save = async (row: Row): Promise<boolean> => {
    patch(row.entity.id, { state: 'saving' });
    const r = await moonFetch<any>(`/authorities/${encodeURIComponent(row.entity.id)}`, { method: 'PUT', body: enrichedEntityBody(row.entity, row.x) }).catch(() => null);
    if (r?.ok) { patch(row.entity.id, { state: 'saved', checked: false }); return true; }
    patch(row.entity.id, { state: 'error', error: r?.data?.error || t('تعذّر الحفظ', 'Could not save') });
    return false;
  };

  const saveChecked = async () => {
    if (!rows) return;
    setSaving(true);
    let ok = 0;
    for (const row of rows.filter((r) => r.checked && r.state === 'ready')) if (await save(row)) ok++;
    setSaving(false);
    toast.success(t(`أُضيفت الأسماء والتواريخ إلى ${ok} كياناً`, `Names and dates added to ${ok} entities`));
    onSaved?.();
  };

  const ticked = (rows || []).filter((r) => r.checked && r.state === 'ready').length;
  const box: React.CSSProperties = { background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.9)', borderRadius: 24 };

  return (
    <div className="p-5 space-y-4" style={box} dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="me-auto">
          <div className="text-base font-bold text-slate-800">{t('أكمل الأسماء والتواريخ من الروابط', 'Fill names and dates from links')}</div>
          <div className="text-xs text-slate-500">{t('لكل كيان مربوط بمكتبة الكونغرس أو ويكي بيانات: اسمه بالخط الآخر وصيغه الأخرى، وتاريخا الميلاد والوفاة إن لم يكونا عنده. لا يُستبدل شيء.',
            'For each entity linked to LC or Wikidata: its name in the other script and its other forms, and birth and death dates when it has none. Nothing is replaced.')}</div>
        </div>
        {!rows && (
          <button type="button" onClick={start} className="inline-flex items-center gap-2 rounded-full bg-sky-700 px-4 py-2 text-sm font-bold text-white">
            <Languages className="h-4 w-4" /> {t('اقرأ الروابط', 'Read the links')}
          </button>
        )}
        {running && (
          <button type="button" onClick={() => { stopRef.current = true; }} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-700">{t('أوقف', 'Stop')}</button>
        )}
        {rows && ticked > 0 && (
          <button type="button" onClick={saveChecked} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {t(`أضف المحدد (${ticked})`, `Fill the ticked (${ticked})`)}
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white" aria-label={t('إغلاق', 'Close')}><X className="h-4 w-4" /></button>
      </div>

      {progress && (
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {running && <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-sky-800"><Loader2 className="h-3 w-3 animate-spin" /> {t(`يقرأ… ${progress.done} من ${progress.total}`, `Reading… ${progress.done} of ${progress.total}`)}</span>}
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">{t(`فيه جديد ${rows?.length || 0}`, `With something new ${rows?.length || 0}`)}</span>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">{t(`راجع الرابط ${(rows || []).filter((r) => r.x.agree !== 'same').length}`, `Check the link ${(rows || []).filter((r) => r.x.agree !== 'same').length}`)}</span>
          <span className="rounded-full bg-white px-3 py-1 text-slate-600">{t(`اسم عربي لأول مرة ${(rows || []).filter((r) => r.x.firstArabic).length}`, `First Arabic name ${(rows || []).filter((r) => r.x.firstArabic).length}`)}</span>
          <span className="rounded-full bg-white px-3 py-1 text-slate-600">{t(`تواريخ ${(rows || []).filter((r) => r.x.dates.birthDate || r.x.dates.deathDate).length}`, `Dates ${(rows || []).filter((r) => r.x.dates.birthDate || r.x.dates.deathDate).length}`)}</span>
        </div>
      )}

      {rows && rows.length > 0 && (
        <ul className="divide-y divide-slate-200/70 max-h-[60vh] overflow-auto">
          {rows.map((r) => (
            <li key={r.entity.id} className="py-3 flex gap-3">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={r.checked} disabled={r.state !== 'ready'}
                onChange={(ev) => patch(r.entity.id, { checked: ev.target.checked })} aria-label={t(`أضف إلى ${r.entity.label}`, `Fill ${r.entity.label}`)} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-slate-800" dir="auto">{r.entity.label}</span>
                  {r.x.agree !== 'same' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      <AlertTriangle className="h-3 w-3" /> {r.x.agree === 'differs' ? t('الأسماء مختلفة: راجع الرابط', 'Names differ: check the link') : t('لا يمكن المقارنة: راجع الرابط', 'Cannot compare: check the link')}
                    </span>
                  )}
                  {r.state === 'saving' && <Loader2 className="h-4 w-4 animate-spin text-sky-600" />}
                  {r.state === 'saved' && <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {t('أُضيف', 'filled')}</span>}
                  {r.state === 'error' && <span className="text-xs text-rose-600">{r.error}</span>}
                  {r.entity.uri && <a href={r.entity.uri} target="_blank" rel="noreferrer" className="ms-auto text-[11px] text-sky-700 hover:underline">{t('الكيان', 'entity')}</a>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {r.x.names.map((n) => (
                    <span key={n} dir="auto" className={`rounded-full px-2 py-0.5 text-xs ${ARABIC.test(n) ? 'bg-emerald-50 text-emerald-900' : 'bg-sky-50 text-sky-900'}`}>+ {n}</span>
                  ))}
                  {r.x.dates.birthDate && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-900">{t('ولد', 'born')} {r.x.dates.birthDate}</span>}
                  {r.x.dates.deathDate && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-900">{t('توفي', 'died')} {r.x.dates.deathDate}</span>}
                </div>
                <div className="text-[11px] text-slate-400">{t('من', 'from')} {r.x.from.map((s) => (s === 'lc' ? 'LC' : s === 'wikidata' ? 'Wikidata' : s)).join(' + ')}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows && !running && rows.length === 0 && (
        <p className="text-sm text-slate-500">{t('لا جديد: الكيانات المربوطة فيها كل ما تقوله روابطها.', 'Nothing new: the linked entities already hold what their links say.')}</p>
      )}
    </div>
  );
}
