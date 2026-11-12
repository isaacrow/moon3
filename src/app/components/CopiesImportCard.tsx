/**
 * The Super Admin's "Import copies" card (OPAC plan, stage 1 step 3). The library's shelf list, one row per copy,
 * becomes copies on the right records, so the catalogue can say where each book is. Upload a CSV or paste from
 * Excel; "Preview" shows what would happen to every row without changing anything; "Import" adds the copies.
 * A copy already on a record is never added twice, so the same sheet can be imported again safely.
 */
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { moonFetch } from '../utils/moonApi';

interface Planned { line: number; status: string; recordId?: string; title?: string; isbn?: string; shelfMark?: string; library?: string }
interface Result { dryRun: boolean; summary: { rows: number; add: number; alreadyThere: number; noSuchBook: number; severalBooks: number; repeated: number }; problems: string[]; plan: Planned[]; savedRecords?: number; addedCopies?: number; failed?: string[] }

const GLASS: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.58)', borderRadius: '28px',
  boxShadow: '0 20px 50px -10px rgba(15, 23, 42, 0.08), inset 0 1px 1px 0 rgba(255, 255, 255, 0.9)',
  backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid rgba(255, 255, 255, 0.78)',
};
const TEMPLATE = 'ISBN,Record,Library,Location,Shelf mark,Barcode,Copy,Reference only,Note\n9780140441000,,Main Library,Arabic collection,PJ7846 .A46 1990,000123,1,,\n';

export function CopiesImportCard({ isAr }: { isAr: boolean }) {
  const t = (a: string, e: string) => (isAr ? a : e);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const send = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const r = await moonFetch<Result & { error?: string }>('/records/copies-import', { method: 'POST', body: { text, dryRun } });
      if (!r.ok) { toast.error(r.data?.error || `Error ${r.status}`); return; }
      setResult(r.data);
      if (!dryRun) toast.success(t(`أُضيفت ${r.data.addedCopies} نسخة إلى ${r.data.savedRecords} تسجيلة`, `${r.data.addedCopies} copies added to ${r.data.savedRecords} records`));
    } finally { setBusy(false); }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) { toast.error(t('الملف كبير جداً (الحد ٢ م.ب.)', 'The file is too large (2 MB at most)')); return; }
    setText(await f.text());
    setResult(null);
  };

  const template = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' }));
    a.download = 'moon-copies-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const STATUS: Record<string, [string, string, string]> = {
    'add': ['تُضاف', 'will be added', 'bg-emerald-100 text-emerald-800'],
    'already there': ['موجودة', 'already there', 'bg-slate-100 text-slate-700'],
    'no such book': ['لا كتاب بهذا', 'no such book', 'bg-rose-100 text-rose-800'],
    'several books': ['أكثر من كتاب', 'several books', 'bg-amber-100 text-amber-800'],
    'repeated in the sheet': ['مكررة في الجدول', 'repeated in the sheet', 'bg-amber-100 text-amber-800'],
  };
  const s = result?.summary;
  const notAdded = (result?.plan || []).filter((p) => p.status !== 'add');

  return (
    <div className="p-6 space-y-4" style={GLASS} dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="me-auto">
          <div className="flex items-center gap-2 text-base font-bold" style={{ color: '#1a202c' }}>
            <FileSpreadsheet className="h-5 w-5" style={{ color: '#0369a1' }} /> {t('استيراد النسخ من جدول', 'Import copies from a spreadsheet')}
          </div>
          <p className="text-xs" style={{ color: '#64748b' }}>
            {t('سطر لكل نسخة: ردمك أو رقم التسجيلة، والمكتبة، والمكان، ورقم الرف، والباركود. اعرض أولاً، ثم استورد. لا تُضاف نسخة موجودة مرتين.',
              'One row per copy: ISBN or record id, library, location, shelf mark, barcode. Preview first, then import. A copy already there is never added twice.')}
          </p>
        </div>
        <button type="button" onClick={template} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
          <Download className="h-3.5 w-3.5" /> {t('نموذج الجدول', 'Template')}
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
          <Upload className="h-3.5 w-3.5" /> {t('ارفع CSV', 'Upload CSV')}
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>

      <textarea value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} rows={5} dir="ltr"
        placeholder={t('أو الصق الجدول هنا من Excel (مع سطر العناوين)', 'Or paste the sheet here from Excel (with its header row)')}
        className="w-full rounded-2xl border border-white bg-white/70 p-3 font-mono text-xs text-slate-800 outline-none focus:ring-2 focus:ring-sky-300" />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!text.trim() || busy} onClick={() => send(true)}
          className="inline-flex items-center gap-2 rounded-full bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t('اعرض ما سيحدث', 'Preview')}
        </button>
        {result?.dryRun && s && s.add > 0 && (
          <button type="button" disabled={busy} onClick={() => send(false)}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {t(`استورد ${s.add} نسخة`, `Import ${s.add} copies`)}
          </button>
        )}
      </div>

      {result && s && (
        <div className="space-y-3">
          {result.problems.map((p) => <p key={p} className="text-xs text-amber-800">{p}</p>)}
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-white px-3 py-1 text-slate-700">{t(`أسطر ${s.rows}`, `Rows ${s.rows}`)}</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">{result.dryRun ? t(`تُضاف ${s.add}`, `To add ${s.add}`) : t(`أُضيفت ${result.addedCopies}`, `Added ${result.addedCopies}`)}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{t(`موجودة ${s.alreadyThere}`, `Already there ${s.alreadyThere}`)}</span>
            <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-800">{t(`بلا كتاب ${s.noSuchBook}`, `No such book ${s.noSuchBook}`)}</span>
            {s.severalBooks > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">{t(`أكثر من كتاب ${s.severalBooks}`, `Several books ${s.severalBooks}`)}</span>}
            {s.repeated > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">{t(`مكررة ${s.repeated}`, `Repeated ${s.repeated}`)}</span>}
          </div>
          {!!result.failed?.length && <p className="text-xs text-rose-700">{t('تعذّر حفظ:', 'Could not save:')} {result.failed.join(', ')}</p>}
          {notAdded.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-2xl bg-white/60 p-3">
              <div className="mb-1 text-xs font-bold text-slate-700">{t('أسطر لن تُضاف', 'Rows that will not be added')}</div>
              <ul className="space-y-1 text-xs">
                {notAdded.slice(0, 200).map((p) => (
                  <li key={p.line} className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums text-slate-500">{t('سطر', 'line')} {p.line}</span>
                    <span className={`rounded-full px-2 py-0.5 ${STATUS[p.status]?.[2] || ''}`}>{isAr ? STATUS[p.status]?.[0] : STATUS[p.status]?.[1]}</span>
                    <span dir="auto" className="text-slate-700">{p.title || p.isbn || p.recordId || ''}</span>
                    {p.shelfMark && <span className="text-slate-500" dir="ltr">{p.shelfMark}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CopiesImportCard;
