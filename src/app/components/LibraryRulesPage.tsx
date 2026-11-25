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
    </div>
  );
}
