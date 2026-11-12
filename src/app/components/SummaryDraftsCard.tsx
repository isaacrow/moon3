/**
 * "Summaries to write" (OPAC plan, stage 1 step 6): the published books with no summary. Claude drafts one from the
 * record's own facts; a reviewer reads it, edits it if needed, and approves it, which writes it into the record as a
 * new version. Nothing is published without that approval. Books with too few facts are marked, not drafted.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, FileText, Loader2, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { moonFetch } from '../utils/moonApi';

interface Draft { summary: string; language: 'ar' | 'en'; model: string; at: string; facts: string }
interface Row { id: string; title: string; language: 'ar' | 'en'; enoughFacts: boolean; draft: Draft | null; text?: string; busy?: boolean; error?: string }

const GLASS: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.58)', borderRadius: '28px',
  boxShadow: '0 20px 50px -10px rgba(15, 23, 42, 0.08), inset 0 1px 1px 0 rgba(255, 255, 255, 0.9)',
  backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid rgba(255, 255, 255, 0.78)',
};

export function SummaryDraftsCard({ isAr }: { isAr: boolean }) {
  const t = (a: string, e: string) => (isAr ? a : e);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [batch, setBatch] = useState(false);
  const patch = (id: string, p: Partial<Row>) => setRows((rs) => rs && rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const load = async () => {
    const r = await moonFetch<any>('/records/summary-drafts').catch(() => null);
    if (r?.status === 403) { setForbidden(true); return; }
    if (!r?.ok) return;
    setEnabled(!!r.data.enabled);
    setRows((r.data.rows || []).map((x: Row) => ({ ...x, text: x.draft?.summary })));
  };
  useEffect(() => { load(); }, []);

  const draft = async (row: Row): Promise<boolean> => {
    patch(row.id, { busy: true, error: undefined });
    const r = await moonFetch<any>(`/records/${encodeURIComponent(row.id)}/summary-draft`, { method: 'POST' }).catch(() => null);
    if (r?.ok) { patch(row.id, { busy: false, draft: r.data.draft, text: r.data.draft.summary }); return true; }
    if (r?.status === 422) { patch(row.id, { busy: false, enoughFacts: false }); return false; }
    patch(row.id, { busy: false, error: r?.data?.error || t('تعذّرت الصياغة', 'Could not draft') });
    return false;
  };

  const draftNext = async () => {
    if (!rows) return;
    setBatch(true);
    let made = 0;
    for (const row of rows.filter((r) => r.enoughFacts && !r.draft).slice(0, 10)) if (await draft(row)) made++;
    setBatch(false);
    toast.success(t(`صيغت ${made} مسودة`, `${made} drafts written`));
  };

  const approve = async (row: Row) => {
    patch(row.id, { busy: true, error: undefined });
    const r = await moonFetch<any>(`/records/${encodeURIComponent(row.id)}/summary`, { method: 'POST', body: { summary: row.text, language: row.draft?.language || row.language } }).catch(() => null);
    if (r?.ok) { setRows((rs) => rs && rs.filter((x) => x.id !== row.id)); toast.success(t('حُفظ الملخص', 'Summary saved')); return; }
    patch(row.id, { busy: false, error: r?.data?.error || t('تعذّر الحفظ', 'Could not save') });
  };

  const discard = async (row: Row) => {
    await moonFetch<any>(`/records/${encodeURIComponent(row.id)}/summary-draft`, { method: 'DELETE' }).catch(() => null);
    patch(row.id, { draft: null, text: undefined });
  };

  if (forbidden) return null;
  const withDraft = (rows || []).filter((r) => r.draft);
  const waiting = (rows || []).filter((r) => r.enoughFacts && !r.draft);
  const thin = (rows || []).filter((r) => !r.enoughFacts);

  return (
    <div className="p-6 space-y-4" style={GLASS} dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="me-auto">
          <div className="flex items-center gap-2 text-base font-bold" style={{ color: '#1a202c' }}>
            <FileText className="h-5 w-5" style={{ color: '#0369a1' }} /> {t('ملخصات للكتابة', 'Summaries to write')}
          </div>
          <p className="text-xs" style={{ color: '#64748b' }}>
            {t('كتب منشورة بلا ملخص. يصوغ Claude مسودة من حقائق التسجيلة وحدها؛ لا يُنشر شيء قبل أن تقرأه وتوافق عليه.',
              'Published books with no summary. Claude drafts from the record\'s own facts only; nothing is published until you read and approve it.')}
          </p>
        </div>
        <button type="button" onClick={load} className="rounded-full p-2 hover:bg-white/60" aria-label={t('تحديث', 'Refresh')}><RefreshCw className="h-4 w-4 text-slate-600" /></button>
        {enabled && waiting.length > 0 && (
          <button type="button" disabled={batch} onClick={draftNext} className="inline-flex items-center gap-2 rounded-full bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {batch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {t('صُغ العشر التالية', 'Draft the next 10')}
          </button>
        )}
      </div>

      {!rows && <p className="text-xs text-slate-500">{t('جارٍ التحميل…', 'Loading…')}</p>}
      {rows && !enabled && <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{t('الصياغة متوقفة حتى يُضبط سر ANTHROPIC_API_KEY في Supabase.', 'Drafting is off until the ANTHROPIC_API_KEY secret is set in Supabase.')}</p>}

      {rows && (
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white px-3 py-1 text-slate-700">{t(`بلا ملخص ${rows.length}`, `Without a summary ${rows.length}`)}</span>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">{t(`مسودات للمراجعة ${withDraft.length}`, `Drafts to review ${withDraft.length}`)}</span>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-800">{t(`تنتظر الصياغة ${waiting.length}`, `Waiting to be drafted ${waiting.length}`)}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{t(`حقائق قليلة ${thin.length}`, `Too few facts ${thin.length}`)}</span>
        </div>
      )}

      {withDraft.length > 0 && (
        <ul className="space-y-3">
          {withDraft.map((r) => (
            <li key={r.id} className="rounded-2xl bg-white/70 p-3 space-y-2">
              <div className="text-sm font-semibold text-slate-800" dir="auto">{r.title}</div>
              <textarea value={r.text || ''} onChange={(e) => patch(r.id, { text: e.target.value })} rows={4} dir={r.draft?.language === 'ar' ? 'rtl' : 'ltr'}
                className="w-full rounded-xl border border-white bg-white p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-300" />
              <details className="text-[11px] text-slate-500"><summary className="cursor-pointer">{t('الحقائق التي كُتبت منها', 'The facts it was written from')}</summary><pre className="whitespace-pre-wrap" dir="auto">{r.draft?.facts}</pre></details>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={r.busy} onClick={() => approve(r)} className="inline-flex items-center gap-1 rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                  {r.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {t('وافق واحفظ', 'Approve and save')}
                </button>
                <button type="button" disabled={r.busy} onClick={() => discard(r)} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-700">
                  <Trash2 className="h-3.5 w-3.5" /> {t('تجاهل', 'Discard')}
                </button>
                <span className="ms-auto text-[11px] text-slate-400">{t('مسودة من', 'Drafted by')} Claude · {new Date(r.draft!.at).toLocaleDateString()}</span>
                {r.error && <span className="text-xs text-rose-700">{r.error}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {enabled && waiting.length > 0 && (
        <details className="rounded-2xl bg-white/50 p-3 text-sm">
          <summary className="cursor-pointer text-xs font-bold text-slate-700">{t(`تنتظر الصياغة (${waiting.length})`, `Waiting to be drafted (${waiting.length})`)}</summary>
          <ul className="mt-2 space-y-1">
            {waiting.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span dir="auto" className="truncate text-slate-700">{r.title}</span>
                <button type="button" disabled={r.busy || batch} onClick={() => draft(r)} className="ms-auto inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-sky-800 disabled:opacity-50">
                  {r.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {t('صُغ', 'Draft')}
                </button>
                {r.error && <span className="text-xs text-rose-700">{r.error}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default SummaryDraftsCard;
