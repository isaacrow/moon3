/**
 * The library's own rules at save (/library-rules/, plan step H10; server: libraryRules.tsx): fields the library
 * also requires before publishing, and checks (ISBN check digit, LCCN form, duplicate ISBN or LCCN) that block
 * publishing, only warn, or are off. Saving is always allowed. Reviewers and the Super Admin change them.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, Save } from 'lucide-react';
import { moonFetch } from '../utils/moonApi';
import { glass, dark } from './CirculationDesk';

type Mode = 'off' | 'warn' | 'block';
interface Rules { required: string[]; checks: Record<string, Mode> }
interface Info { library: string; rules: Rules; fields: Record<string, { en: string; ar: string }>; checks: Record<string, { en: string; ar: string }>; canEdit: boolean }

export function LibraryRulesPage({ isAr }: { isAr: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [busy, setBusy] = useState(false);
  const L = (en: string, ar: string) => (isAr ? ar : en);
  useEffect(() => {
    moonFetch<any>('/library-rules').then((r) => { if (r.ok) { setInfo(r.data); setRules(r.data.rules); } });
  }, []);
  if (!info || !rules) return <p className="text-center mt-16 text-slate-600">…</p>;

  const save = async () => {
    setBusy(true);
    const r = await moonFetch<any>('/library-rules', { method: 'PUT', body: rules });
    setBusy(false);
    if (!r.ok) { toast.error(r.data?.error || L('Not saved', 'لم يُحفظ')); return; }
    setRules(r.data.rules);
    toast.success(L('The library\'s rules are saved', 'حُفظت قواعد المكتبة'));
  };
  const MODES: Array<[Mode, string, string]> = [['off', 'Off', 'معطّل'], ['warn', 'Warn', 'تنبيه'], ['block', 'Block publishing', 'يمنع النشر']];

  return (
    <div className="max-w-3xl mx-auto px-3 md:px-6 py-4 space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
      <section className="p-5 moon-enter" style={glass}>
        <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2"><ShieldCheck className="h-5 w-5" />{L('Library rules at save', 'قواعد المكتبة عند الحفظ')}</h2>
        <p className="text-sm text-slate-700 mt-1">{L(
          `For ${info.library}, on top of what Moon requires. A record is always saved; a rule that blocks keeps it from being published until it is met, a rule that warns only says so.`,
          `لمكتبة ${info.library}، فوق ما يتطلبه مون. تُحفظ التسجيلة دائمًا؛ والقاعدة التي تمنع تؤخر نشرها حتى تُستوفى، والتي تنبّه تكتفي بالتنبيه.`)}</p>
        {!info.canEdit && <p className="text-xs text-amber-800 mt-2">{L('Only a reviewer or the Super Admin changes them.', 'يغيّرها المراجع أو المدير العام فقط.')}</p>}
      </section>

      <section className="p-5 moon-enter" style={glass}>
        <h3 className="font-bold text-slate-900 mb-2">{L('Also required before publishing', 'مطلوب أيضًا قبل النشر')}</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {Object.entries(info.fields).map(([k, f]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
              <input type="checkbox" disabled={!info.canEdit} checked={rules.required.includes(k)}
                onChange={(e) => setRules({ ...rules, required: e.target.checked ? [...rules.required, k] : rules.required.filter((x) => x !== k) })} />
              {isAr ? f.ar : f.en}
            </label>
          ))}
        </div>
      </section>

      <section className="p-5 moon-enter" style={glass}>
        <h3 className="font-bold text-slate-900 mb-2">{L('Checks', 'الفحوص')}</h3>
        <div className="space-y-2">
          {Object.entries(info.checks).map(([k, ch]) => (
            <div key={k} className="flex flex-wrap items-center gap-2 justify-between">
              <span className="text-sm text-slate-800">{isAr ? ch.ar : ch.en}</span>
              <div className="flex gap-1">
                {MODES.map(([m, en, ar]) => (
                  <button key={m} disabled={!info.canEdit} onClick={() => setRules({ ...rules, checks: { ...rules.checks, [k]: m } })}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold border cursor-pointer disabled:cursor-default ${rules.checks[k] === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white/70 text-slate-700 border-slate-300'}`}>
                    {isAr ? ar : en}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      {info.canEdit && <button className={dark} disabled={busy} onClick={save}><Save className="h-4 w-4" />{L('Save the rules', 'احفظ القواعد')}</button>}
      <Sequences isAr={isAr} />
    </div>
  );
}

/** Number sequences (plan step H6): where new barcodes, borrower cards and copies' accession numbers come from. */
function Sequences({ isAr }: { isAr: boolean }) {
  const [data, setData] = useState<any>(null);
  const [draft, setDraft] = useState<Record<string, { prefix: string; next: string; width: string }>>({});
  const L = (en: string, ar: string) => (isAr ? ar : en);
  const load = () => moonFetch<any>('/sequences').then((r) => {
    if (!r.ok) return;
    setData(r.data);
    setDraft(Object.fromEntries(r.data.kinds.map((k: string) => {
      const s = r.data.sequences[k];
      return [k, s ? { prefix: s.prefix, next: String(s.next), width: String(s.width) } : { prefix: k === 'barcode' ? 'B' : k === 'accession' ? 'A' : 'C', next: '1', width: '6' }];
    })));
  });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return null;
  const NAMES: Record<string, [string, string, string, string]> = {
    barcode: ['Copy barcodes', 'باركودات النسخ', 'Used when copies are added from an order without barcodes.', 'تُستعمل عند إضافة نسخ طلب شراء بلا باركود.'],
    accession: ['Accession numbers', 'أرقام التزويد', 'Each copy added from an order takes the next one.', 'تأخذ كل نسخة تُضاف من طلب شراء الرقم التالي.'],
    card: ['Borrower cards', 'بطاقات المستفيدين', 'Used when a new borrower is added without a card number.', 'تُستعمل عند إضافة مستفيد جديد بلا رقم بطاقة.'],
  };
  const save = async (kind: string, off = false) => {
    const d = draft[kind];
    const r = await moonFetch<any>(`/sequences/${kind}`, { method: 'PUT', body: off ? { off: true } : { prefix: d.prefix, next: Number(d.next), width: Number(d.width) } });
    if (!r.ok) { toast.error(r.data?.error || L('Not saved', 'لم يُحفظ')); return; }
    toast.success(off ? L('Sequence turned off', 'أُوقف التسلسل') : L(`Next: ${r.data.sequence.nextValue}`, `التالي: ${r.data.sequence.nextValue}`));
    load();
  };
  const preview = (d: { prefix: string; next: string; width: string }) => d.prefix + String(Number(d.next) || 0).padStart(Number(d.width) || 0, '0');
  return (
    <section className="p-5 moon-enter" style={glass}>
      <h3 className="font-bold text-slate-900 mb-1">{L('Number sequences', 'تسلسل الأرقام')}</h3>
      <p className="text-xs text-slate-600 mb-3">{L('Numbers are handed out by the server, so two desks never get the same one.', 'يوزّع الخادم الأرقام، فلا يأخذ مكتبان الرقم نفسه.')}</p>
      <div className="space-y-4">
        {data.kinds.map((k: string) => {
          const d = draft[k]; const on = !!data.sequences[k];
          return (
            <div key={k}>
              <div className="flex items-baseline justify-between gap-2">
                <b className="text-sm text-slate-900">{isAr ? NAMES[k][1] : NAMES[k][0]}</b>
                <span className={`text-xs font-bold ${on ? 'text-emerald-700' : 'text-slate-500'}`}>{on ? L(`On · next ${data.sequences[k].nextValue}`, `مفعّل · التالي ${data.sequences[k].nextValue}`) : L('Off', 'غير مفعّل')}</span>
              </div>
              <p className="text-xs text-slate-600">{isAr ? NAMES[k][3] : NAMES[k][2]}</p>
              {data.canEdit && d && (
                <div className="flex flex-wrap items-end gap-2 mt-1" dir="ltr">
                  <label className="text-xs">{L('Prefix', 'البادئة')}<input className="block w-20 rounded-lg px-2 py-1 border border-slate-300 bg-white/80" value={d.prefix} onChange={(e) => setDraft({ ...draft, [k]: { ...d, prefix: e.target.value } })} /></label>
                  <label className="text-xs">{L('Next number', 'الرقم التالي')}<input type="number" min={1} className="block w-28 rounded-lg px-2 py-1 border border-slate-300 bg-white/80" value={d.next} onChange={(e) => setDraft({ ...draft, [k]: { ...d, next: e.target.value } })} /></label>
                  <label className="text-xs">{L('Digits', 'عدد الخانات')}<input type="number" min={0} max={12} className="block w-16 rounded-lg px-2 py-1 border border-slate-300 bg-white/80" value={d.width} onChange={(e) => setDraft({ ...draft, [k]: { ...d, width: e.target.value } })} /></label>
                  <span className="text-xs text-slate-600 pb-1.5">→ <code>{preview(d)}</code></span>
                  <button className={dark} onClick={() => save(k)}>{on ? L('Save', 'احفظ') : L('Turn on', 'فعّل')}</button>
                  {on && <button className="text-xs underline pb-1.5" onClick={() => save(k, true)}>{L('Turn off', 'أوقف')}</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
