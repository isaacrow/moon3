/**
 * The dashboard's "What readers do" card: the searches that found nothing (what to fix first), what is searched
 * most and whether readers open a result, and the devices, languages, countries and sources of the public
 * catalogue's visitors. From /opac/insights. Everything is anonymous: a visitor is a hashed key that changes every
 * day, and no address, browser name or cookie is kept (see supabase/functions/server/opacInsights.tsx).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Compass, RefreshCw, SearchX, TrendingUp } from 'lucide-react';
import { moonFetch } from '../utils/moonApi';

interface Insights {
  days: number;
  visitors: number;
  searches: { total: number; foundNothing: number; distinct: number; openedShare: number | null };
  nothingFound: Array<{ query: string; times: number; visitors: number; script: string }>;
  topSearches: Array<{ query: string; times: number; visitors: number; results: number; openedShare: number; bestRank: number | null }>;
  scripts: Record<string, number>;
  devices: Record<string, number>;
  languages: Record<string, number>;
  browserLanguages: Array<{ lang: string; visitors: number }>;
  countries: Array<{ country: string; visitors: number }>;
  sources: Array<{ source: string; visitors: number }>;
  entries: Record<string, number>;
  hours?: Record<string, number>;
  daily?: Array<{ day: string; visitors: number }>;
  actions?: Array<{ action: string; visitors: number; times: number }>;
  depth?: { avgPages: number; onePageShare: number; avgSeconds: number };
}

const GLASS: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.58)',
  borderRadius: '28px',
  boxShadow: '0 20px 50px -10px rgba(15, 23, 42, 0.08), inset 0 1px 1px 0 rgba(255, 255, 255, 0.9)',
  backdropFilter: 'blur(24px) saturate(160%)',
  WebkitBackdropFilter: 'blur(24px) saturate(160%)',
  border: '1px solid rgba(255, 255, 255, 0.78)',
};
const INNER: React.CSSProperties = { background: 'rgba(255, 255, 255, 0.5)', borderRadius: 18, border: '1px solid rgba(255, 255, 255, 0.9)' };

/** Share of the total as a whole percent, 0 when there is nothing. */
export const percent = (part: number, total: number) => (total > 0 ? Math.round((100 * part) / total) : 0);

/** Columns for a series of counts (busiest hours, visitors per day); the tallest is full height. */
function Columns({ title, note, values, labels, tip }: { title: string; note?: string; values: number[]; labels: [string, string]; tip: (i: number, n: number) => string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="p-4 min-w-0" style={INNER}>
      <div className="text-xs font-bold" style={{ color: '#334155' }}>{title}</div>
      {note && <div className="text-[11px] mb-2" style={{ color: '#64748b' }}>{note}</div>}
      <div className="flex items-end gap-[2px] h-16" dir="ltr">
        {values.map((n, i) => (
          <div key={i} title={tip(i, n)} className="flex-1 rounded-sm" style={{ height: `${Math.max(n > 0 ? 6 : 2, (100 * n) / max)}%`, background: n > 0 ? '#0369a1' : 'rgba(15,23,42,0.12)' }} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] mt-1" style={{ color: '#94a3b8' }} dir="ltr"><span>{labels[0]}</span><span>{labels[1]}</span></div>
    </div>
  );
}

function Bars({ title, rows, total, label }: { title: string; rows: Array<[string, number]>; total: number; label?: (k: string) => string }) {
  return (
    <div className="p-4 min-w-0" style={INNER}>
      <div className="text-xs font-bold mb-2" style={{ color: '#334155' }}>{title}</div>
      {rows.length === 0 ? <div className="text-xs" style={{ color: '#94a3b8' }}>—</div> : (
        <ul className="space-y-1.5">
          {rows.map(([k, n]) => (
            <li key={k} className="text-xs">
              <div className="flex justify-between gap-2" style={{ color: '#1e293b' }}>
                <span className="truncate" dir="auto">{label ? label(k) : k}</span>
                <span className="tabular-nums font-semibold">{percent(n, total)}%</span>
              </div>
              <div className="h-1.5 rounded-full mt-0.5" style={{ background: 'rgba(15,23,42,0.08)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(3, percent(n, total))}%`, background: '#0369a1' }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OpacInsightsCard({ isAr }: { isAr: boolean }) {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const t = (a: string, e: string) => (isAr ? a : e);

  const load = async () => {
    setLoading(true);
    try {
      const res = await moonFetch<Insights & { error?: string }>('/opac/insights?days=30');
      if (res.ok) { setData(res.data); setError(null); } else setError(res.data?.error || `Error ${res.status}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const names = useMemo(() => {
    try { return new Intl.DisplayNames([isAr ? 'ar' : 'en'], { type: 'region' }); } catch { return null; }
  }, [isAr]);
  const langNames = useMemo(() => {
    try { return new Intl.DisplayNames([isAr ? 'ar' : 'en'], { type: 'language' }); } catch { return null; }
  }, [isAr]);
  const deviceLabel = (k: string) => ({ phone: t('هاتف', 'Phone'), tablet: t('لوحي', 'Tablet'), desktop: t('حاسوب', 'Computer') } as Record<string, string>)[k] || k;
  const scriptLabel = (k: string) => ({ arabic: t('عربي', 'Arabic'), latin: t('لاتيني', 'Latin letters'), mixed: t('مختلط', 'Mixed'), digits: t('أرقام', 'Numbers'), other: t('غير ذلك', 'Other') } as Record<string, string>)[k] || k;
  const entryLabel = (k: string) => ({ home: t('الرئيسية', 'Home'), search: t('بحث', 'A search'), work: t('كتاب', 'A book'), person: t('شخص', 'A person'), subject: t('موضوع', 'A subject'), hub: t('عمل', 'A work group'), place: t('مكان', 'A place'), authors: t('المؤلفون', 'Authors'), subjects: t('المواضيع', 'Subjects') } as Record<string, string>)[k] || k;
  const sourceLabel = (k: string) => (k === 'direct' ? t('مباشر (رابط أو كتابة العنوان)', 'Direct (a link or typed address)') : k);
  const actionLabel = (k: string) => ({
    save: t('حفظ في القائمة', 'Saved to a list'), cite: t('استشهاد', 'Opened Cite'), copy_link: t('نسخ رابط', 'Copied a link'),
    marc: t('تنزيل MARC', 'Downloaded MARC'), export: t('تصدير BibTeX/RIS', 'Exported BibTeX/RIS'), switch_lang: t('تبديل اللغة', 'Switched language'),
    ask_moon: t('اسأل مون', 'Opened Ask Moon'), sign_in: t('ضغط دخول المفهرسين', 'Clicked cataloguer sign-in'), filter: t('استخدم فلتراً', 'Used a filter'),
  } as Record<string, string>)[k] || k;
  const minutes = (s: number) => (s < 90 ? `${s} ${t('ثانية', 'sec')}` : `${Math.round(s / 60)} ${t('دقيقة', 'min')}`);
  const entries = (o: Record<string, number>): Array<[string, number]> => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

  const searches = data?.searches;
  const nothingShare = searches ? percent(searches.foundNothing, searches.total) : 0;

  return (
    <div className="p-6" style={GLASS}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-base font-bold" style={{ color: '#1a202c' }}>
          <Compass className="h-5 w-5" style={{ color: '#0369a1' }} />
          {t('ماذا يفعل القرّاء في الفهرس العام', 'What readers do in the catalogue')}
        </div>
        <button type="button" onClick={load} disabled={loading} className="p-2 rounded-full hover:bg-white/60 transition-colors disabled:opacity-50"
          title={t('تحديث', 'Refresh')} aria-label={t('تحديث', 'Refresh')}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} style={{ color: '#475569' }} />
        </button>
      </div>
      <p className="text-xs mb-4" style={{ color: '#64748b' }}>
        {t('آخر ٣٠ يوماً. مجهول الهوية: لا أسماء ولا عناوين ولا ملفات تعريف، ومفتاح الزائر يتغير كل يوم.',
          'Last 30 days. Anonymous: no names, addresses or cookies, and a visitor’s key changes every day.')}
      </p>

      {error && <p className="text-xs mb-3" style={{ color: '#b91c1c' }}>{error}</p>}
      {!data && !error && <p className="text-xs" style={{ color: '#64748b' }}>{t('جارٍ التحميل…', 'Loading…')}</p>}

      {data && data.visitors === 0 && (
        <p className="text-sm py-6 text-center" style={{ color: '#64748b' }}>
          {t('لا بيانات بعد. تظهر هنا بعد أن يفتح القرّاء الفهرس العام.', 'No data yet. It appears here as readers open the public catalogue.')}
        </p>
      )}

      {data && data.visitors > 0 && searches && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              [data.visitors.toLocaleString(), t('زائر (بحسب الأيام)', 'visitors (counted per day)')],
              [searches.total.toLocaleString(), t('عملية بحث', 'searches')],
              [`${nothingShare}%`, t('لم تجد شيئاً', 'found nothing')],
              [searches.openedShare === null ? '—' : `${searches.openedShare}%`, t('فُتحت منها نتيجة', 'opened a result')],
            ].map(([n, l]) => (
              <div key={l} className="p-4" style={INNER}>
                <div className="text-2xl font-black tracking-tight" style={{ color: '#0369a1' }}>{n}</div>
                <div className="text-xs" style={{ color: '#64748b' }}>{l}</div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="p-4" style={INNER}>
              <div className="flex items-center gap-1.5 text-sm font-bold mb-1" style={{ color: '#1a202c' }}>
                <SearchX className="h-4 w-4" style={{ color: '#b45309' }} />{t('بحث لم يجد شيئاً — ابدأ من هنا', 'Searches that found nothing — start here')}
              </div>
              <p className="text-[11px] mb-2" style={{ color: '#64748b' }}>{t('كل بحث هنا يعني كتاباً أو اسماً أو كتابةً ينقص الفهرس أو لا يفهمها البحث.', 'Each one is a book, a name or a spelling the catalogue lacks or the search does not understand.')}</p>
              {data.nothingFound.length === 0 ? <p className="text-xs" style={{ color: '#64748b' }}>{t('لا شيء. كل بحث وجد نتائج.', 'None. Every search found something.')}</p> : (
                <ul className="space-y-1">
                  {data.nothingFound.map((s) => (
                    <li key={s.query} className="flex justify-between gap-3 text-sm" style={{ color: '#1e293b' }}>
                      <span dir="auto" className="truncate">{s.query}</span>
                      <span className="text-xs tabular-nums shrink-0" style={{ color: '#64748b' }}>{s.times}× · {scriptLabel(s.script)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-4" style={INNER}>
              <div className="flex items-center gap-1.5 text-sm font-bold mb-1" style={{ color: '#1a202c' }}>
                <TrendingUp className="h-4 w-4" style={{ color: '#0369a1' }} />{t('الأكثر بحثاً', 'Searched most')}
              </div>
              <p className="text-[11px] mb-2" style={{ color: '#64748b' }}>{t('وكم مرة فُتحت نتيجة، وأفضل ترتيب بلغه ما فُتح.', 'How often a result was opened, and the best place of one that was.')}</p>
              {data.topSearches.length === 0 ? <p className="text-xs" style={{ color: '#64748b' }}>—</p> : (
                <ul className="space-y-1">
                  {data.topSearches.map((s) => (
                    <li key={s.query} className="flex justify-between gap-3 text-sm" style={{ color: '#1e293b' }}>
                      <span dir="auto" className="truncate">{s.query}</span>
                      <span className="text-xs tabular-nums shrink-0" style={{ color: '#64748b' }}>
                        {s.times}× · {s.results} {t('نتيجة', 'results')} · {s.openedShare}%{s.bestRank ? ` · #${s.bestRank}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {data.depth && (
            <div className="grid grid-cols-3 gap-3">
              {[
                [String(data.depth.avgPages), t('صفحة في الزيارة', 'pages per visit')],
                [`${data.depth.onePageShare}%`, t('نظروا إلى صفحة واحدة فقط', 'looked at one page only')],
                [data.depth.avgSeconds ? minutes(data.depth.avgSeconds) : '—', t('مدة الزيارة (المتوسط)', 'time on the site (average)')],
              ].map(([n, l]) => (
                <div key={l} className="p-4" style={INNER}>
                  <div className="text-xl font-black tracking-tight" style={{ color: '#0369a1' }}>{n}</div>
                  <div className="text-xs" style={{ color: '#64748b' }}>{l}</div>
                </div>
              ))}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <Columns title={t('الزوار يوماً بيوم', 'Visitors, day by day')} values={(data.daily || []).map((d) => d.visitors)}
              labels={[(data.daily || [])[0]?.day.slice(5) || '', (data.daily || []).slice(-1)[0]?.day.slice(5) || '']}
              tip={(i, n) => `${(data.daily || [])[i]?.day}: ${n}`} />
            <Columns title={t('أوقات الذروة (بتوقيت بغداد)', 'Busiest hours (Baghdad time)')} note={t('الساعة التي بدأت فيها الزيارة', 'The hour a visit started')}
              values={Array.from({ length: 24 }, (_, h) => (data.hours || {})[String(h)] || 0)} labels={['00:00', '23:00']}
              tip={(h, n) => `${String(h).padStart(2, '0')}:00 — ${n}`} />
          </div>

          {(data.actions || []).length > 0 && (
            <div className="p-4" style={INNER}>
              <div className="text-sm font-bold mb-2" style={{ color: '#1a202c' }}>{t('ماذا يفعلون في الكتب', 'What readers do')}</div>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                {(data.actions || []).map((a) => (
                  <li key={a.action} className="flex justify-between gap-3 text-sm" style={{ color: '#1e293b' }}>
                    <span>{actionLabel(a.action)}</span>
                    <span className="text-xs tabular-nums" style={{ color: '#64748b' }}>{a.visitors} {t('زائر', 'visitors')} · {a.times}×</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Bars title={t('الجهاز', 'Device')} rows={entries(data.devices)} total={sum(data.devices)} label={deviceLabel} />
            <Bars title={t('لغة الصفحة', 'Page language')} rows={entries(data.languages)} total={sum(data.languages)} label={(k) => langNames?.of(k) || k} />
            <Bars title={t('خط البحث', 'Script searched in')} rows={entries(data.scripts)} total={sum(data.scripts)} label={scriptLabel} />
            <Bars title={t('أول صفحة', 'First page opened')} rows={entries(data.entries)} total={sum(data.entries)} label={entryLabel} />
            <Bars title={t('البلد', 'Country')} rows={data.countries.map((c) => [c.country, c.visitors] as [string, number])} total={data.visitors}
              label={(k) => (k === 'ZZ' ? t('غير معروف', 'Unknown') : names?.of(k) || k)} />
            <Bars title={t('لغة المتصفح', 'Browser language')} rows={data.browserLanguages.map((c) => [c.lang, c.visitors] as [string, number])} total={data.visitors} label={(k) => langNames?.of(k) || k} />
            <Bars title={t('من أين جاؤوا', 'Where they came from')} rows={data.sources.map((c) => [c.source, c.visitors] as [string, number])} total={data.visitors} label={sourceLabel} />
          </div>
        </div>
      )}
    </div>
  );
}

export default OpacInsightsCard;
