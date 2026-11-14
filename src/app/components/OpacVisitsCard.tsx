/**
 * The Super Admin dashboard's "OPAC visitors" card: how many readers opened the public catalogue today, in the last 7 and
 * 30 days, a bar for each day, and what they read and searched for most. From the edge function's /opac/visits.
 * A visitor is counted once a day (the server keeps no address); robots and signed-in staff are not counted.
 */
import React, { useEffect, useState } from 'react';
import { Eye, RefreshCw, Users, Search, BookOpen } from 'lucide-react';
import { moonFetch } from '../utils/moonApi';

interface Count { visitors: number; views: number }
interface VisitStats {
  today: Count;
  week: Count;
  period: Count & { days: number };
  days: Array<{ day: string } & Count>;
  topRecords: Array<{ id: string; title: string } & Count>;
  topSearches: Array<{ query: string } & Count>;
  topEntities: Array<{ kind: string; key: string } & Count>;
}

const GLASS: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.58)',
  borderRadius: '28px',
  boxShadow: '0 20px 50px -10px rgba(15, 23, 42, 0.08), inset 0 1px 1px 0 rgba(255, 255, 255, 0.9)',
  backdropFilter: 'blur(24px) saturate(160%)',
  WebkitBackdropFilter: 'blur(24px) saturate(160%)',
  border: '1px solid rgba(255, 255, 255, 0.78)',
};

function Stat({ label, count, isAr }: { label: string; count: Count; isAr: boolean }) {
  return (
    <div className="flex-1 min-w-[140px]">
      <div className="text-xs font-semibold" style={{ color: '#64748b' }}>{label}</div>
      <div className="text-3xl font-black tracking-tight" style={{ color: '#0369a1' }}>{count.visitors.toLocaleString()}</div>
      <div className="text-xs" style={{ color: '#64748b' }}>
        {isAr ? `زائر · ${count.views.toLocaleString()} صفحة` : `visitors · ${count.views.toLocaleString()} pages`}
      </div>
    </div>
  );
}

export function OpacVisitsCard({ isAr }: { isAr: boolean }) {
  const [stats, setStats] = useState<VisitStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await moonFetch<VisitStats & { error?: string }>('/opac/visits?days=30');
      if (res.ok) { setStats(res.data); setError(null); }
      else setError(res.data?.error || `Error ${res.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const peak = Math.max(1, ...(stats?.days || []).map((d) => d.visitors));

  return (
    <div className="p-6" style={GLASS}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-base font-bold" style={{ color: '#1a202c' }}>
          <Eye className="h-5 w-5" style={{ color: '#0369a1' }} />
          {isAr ? 'زوار الفهرس العام (OPAC)' : 'OPAC visitors'}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="p-2 rounded-full hover:bg-white/60 transition-colors disabled:opacity-50"
          title={isAr ? 'تحديث' : 'Refresh'}
          aria-label={isAr ? 'تحديث' : 'Refresh'}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} style={{ color: '#475569' }} />
        </button>
      </div>

      {error && !stats && <div className="text-sm" style={{ color: '#be123c' }}>{isAr ? 'تعذرت قراءة الزيارات: ' : 'Could not read the visits: '}{error}</div>}
      {!error && !stats && <div className="text-sm" style={{ color: '#64748b' }}>{isAr ? 'جارٍ القراءة…' : 'Reading…'}</div>}

      {stats && (
        <>
          <div className="flex flex-wrap gap-6 mb-5">
            <Stat label={isAr ? 'اليوم' : 'Today'} count={stats.today} isAr={isAr} />
            <Stat label={isAr ? 'آخر 7 أيام' : 'Last 7 days'} count={stats.week} isAr={isAr} />
            <Stat label={isAr ? `آخر ${stats.period.days} يوماً` : `Last ${stats.period.days} days`} count={stats.period} isAr={isAr} />
          </div>

          <div className="flex items-end gap-[3px] h-24 mb-1" role="img" aria-label={isAr ? 'الزوار كل يوم' : 'Visitors each day'} dir="ltr">
            {stats.days.map((d) => (
              <div
                key={d.day}
                className="flex-1 rounded-t"
                title={`${d.day}: ${d.visitors} ${isAr ? 'زائر' : 'visitors'}, ${d.views} ${isAr ? 'صفحة' : 'pages'}`}
                style={{ height: `${Math.max(d.visitors ? 6 : 2, (100 * d.visitors) / peak)}%`, background: d.visitors ? '#0369a1' : 'rgba(15, 23, 42, 0.08)' }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[11px] mb-5" style={{ color: '#94a3b8' }} dir="ltr">
            <span>{stats.days[0]?.day}</span>
            <span>{stats.days[stats.days.length - 1]?.day}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-sm">
            <TopList icon={BookOpen} title={isAr ? 'أكثر الكتب قراءة' : 'Most-read records'} empty={isAr ? 'لا شيء بعد' : 'Nothing yet'}
              rows={stats.topRecords.map((r) => ({ key: r.id, label: r.title, n: r.visitors }))} />
            <TopList icon={Search} title={isAr ? 'أكثر عمليات البحث' : 'Top searches'} empty={isAr ? 'لا شيء بعد' : 'Nothing yet'}
              rows={stats.topSearches.map((r) => ({ key: r.query, label: r.query, n: r.visitors }))} />
            <TopList icon={Users} title={isAr ? 'أكثر المؤلفين والموضوعات زيارة' : 'Top authors, subjects, places'} empty={isAr ? 'لا شيء بعد' : 'Nothing yet'}
              rows={stats.topEntities.map((r) => ({ key: `${r.kind}|${r.key}`, label: r.key, n: r.visitors }))} />
          </div>
          <div className="mt-4 text-xs" style={{ color: '#94a3b8' }}>
            {isAr
              ? 'يُعدّ الزائر مرة في اليوم، ولا يُحفظ عنوانه. لا تُعدّ زيارات محركات البحث ولا الموظفين المسجلين.'
              : 'A visitor counts once a day and no address is kept. Search-engine robots and signed-in staff are not counted.'}
          </div>
        </>
      )}
    </div>
  );
}

function TopList({ icon: Icon, title, rows, empty }: { icon: any; title: string; rows: Array<{ key: string; label: string; n: number }>; empty: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-bold mb-2" style={{ color: '#475569' }}><Icon className="h-3.5 w-3.5" /> {title}</div>
      {rows.length === 0 ? (
        <div className="text-xs" style={{ color: '#94a3b8' }}>{empty}</div>
      ) : (
        <ol className="space-y-1">
          {rows.map((r) => (
            <li key={r.key} className="flex justify-between gap-2">
              <span className="truncate" dir="auto" style={{ color: '#334155' }}>{r.label}</span>
              <span className="font-semibold shrink-0" style={{ color: '#0369a1' }}>{r.n}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
