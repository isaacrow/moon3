/**
 * Linking Moon's entities to LC, VIAF and Wikidata (Phase 12, step 5). Every entity without an outside link
 * is searched (LC with the ALA-LC romanization of an Arabic name, Wikidata, VIAF through both); sure matches
 * (same name, same dates for a person, no close second) are listed to link in one click, the rest with their
 * candidates and the reasons, for the cataloguer to choose. Linking adds every outside address the match's
 * records carry (LC, VIAF, Wikidata, FAST, ISNI …) to the entity.
 */
import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Link2, Loader2, Search, CheckCircle2, X } from 'lucide-react';
import { moonFetch } from '../utils/moonApi';
import { searchLOCAuthorities, searchWikidata, romanizeQuery } from '../../services/authoritySearch';
import { fetchOutsideEntity, SAME_AS_HOSTS } from '../../services/entityImport';
import { reconcileEntity, linksAcross, type AcrossLink, type Candidate, type ReconcileEntity } from '../../services/reconcile';

interface Note { rejected: string[]; noMatch?: { by: string; at: string }; checkedAt?: string }
interface Row { entity: ReconcileEntity & { uri?: string; sameAs?: string[]; note?: Note }; state: 'waiting' | 'searching' | 'sure' | 'review' | 'none' | 'linked' | 'complete' | 'error' | 'nomatch'; candidates: Candidate[]; sure: Candidate | null; across?: AcrossLink[] }

/** A cataloguer's decision, kept on the server so the next run does not ask again (see reconcileQueue.tsx). */
const note = (id: string, body: Record<string, unknown>) =>
  moonFetch<any>(`/authorities/${encodeURIComponent(id)}/reconcile-note`, { method: 'POST', body }).catch(() => null);

const KIND: Record<string, [string, string]> = { agent: ['شخص أو هيئة', 'person or body'], place: ['مكان', 'place'], topic: ['موضوع', 'subject'], genre: ['نوع', 'genre'], hub: ['عمل', 'work'], period: ['فترة', 'period'] };
const deps = {
  searchLc: (q: string, scheme: 'names' | 'subjects') => searchLOCAuthorities(q, scheme),
  searchWikidata: (q: string) => searchWikidata(q, 'item'),
  romanize: (q: string) => romanizeQuery(q),
  details: (uri: string) => fetchOutsideEntity(uri).catch(() => null),
};

export function ReconcilePanel({ ar, onClose, onLinked }: { ar: boolean; onClose: () => void; onLinked?: () => void }) {
  const t = (a: string, e: string) => (ar ? a : e);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [running, setRunning] = useState(false);
  const [linking, setLinking] = useState(false);
  const [total, setTotal] = useState<{ total: number; unlinked: number } | null>(null);
  const stopRef = useRef(false);
  const set = (id: string, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r) => (r.entity.id === id ? { ...r, ...patch } : r)));

  const start = async () => {
    setRunning(true);
    stopRef.current = false;
    // Every entity, unlinked first, with what cataloguers decided before (rejected candidates, "no match"):
    // one with outside links gets the links those records list themselves (LC's record lists VIAF and
    // Wikidata, Wikidata lists ISNI, ORCID …); one with none is searched.
    const r = await moonFetch<any>('/authorities/reconcile-queue').catch(() => null);
    if (!r?.ok) { toast.error(t('تعذّر جلب قائمة الكيانات', 'Could not load the entities')); setRunning(false); return; }
    setTotal({ total: r.data.total, unlinked: r.data.unlinked });
    const initial: Row[] = (r.data.rows || []).map((e: any) => ({ entity: e, state: 'waiting', candidates: [], sure: null }));
    setRows(initial);
    // Two at a time, so LC and Wikidata are not flooded. "Stop" ends the run after the current two.
    let next = 0;
    const work = async () => {
      while (next < initial.length && !stopRef.current) {
        const e = initial[next++].entity;
        set(e.id, { state: 'searching' });
        try {
          if ((e.sameAs || []).length) {
            const across = await linksAcross(e, deps.details);
            set(e.id, { state: across.length ? 'sure' : 'complete', across });
            continue;
          }
          const found = await reconcileEntity(e, deps);
          // A candidate a cataloguer already rejected for this entity is never offered again.
          const rejected = new Set(e.note?.rejected || []);
          const candidates = found.candidates.filter((c) => !rejected.has(c.uri));
          const sure = found.sure && !rejected.has(found.sure.uri) ? found.sure : null;
          set(e.id, { state: sure ? 'sure' : candidates.length ? 'review' : 'none', candidates, sure });
          void note(e.id, { checked: true });
        } catch {
          set(e.id, { state: 'error' });
        }
      }
    };
    await Promise.all([work(), work()]);
    setRunning(false);
  };

  /** "Not this one": the candidate is dropped here and never offered again for this entity. */
  const reject = async (row: Row, c: Candidate) => {
    await note(row.entity.id, { reject: c.uri });
    const candidates = row.candidates.filter((x) => x.uri !== c.uri);
    const sure = row.sure?.uri === c.uri ? null : row.sure;
    set(row.entity.id, { candidates, sure, state: sure ? 'sure' : candidates.length ? 'review' : 'none' });
  };

  /** "No match": not in LC or Wikidata (a local press, a small publisher); leaves the list for six months. */
  const noMatch = async (row: Row) => {
    const r = await note(row.entity.id, { noMatch: true });
    if (r?.ok) set(row.entity.id, { state: 'nomatch', candidates: [], sure: null });
  };

  /** Adds the match's outside addresses to the entity. */
  const link = async (row: Row, c: Candidate, method: 'person' | 'reconcile' = 'person') => {
    const links = c.links.filter((u) => SAME_AS_HOSTS.test(u) && u.length <= 300).slice(0, 12);
    let ok = 0;
    for (const uri of links) {
      const evidence = `Moon match ${Math.round(c.score * 100)}%: ${c.reasons.join(', ')} (${c.source} "${c.label}")`;
      const r = await moonFetch<any>(`/authorities/${encodeURIComponent(row.entity.id)}/same-as`, { method: 'POST', body: { uri, method, confidence: c.score, evidence } }).catch(() => null);
      if (r?.ok) ok++;
    }
    if (ok) set(row.entity.id, { state: 'linked', sure: c });
    return ok;
  };

  /** Adds the links the entity's own outside records list (sure: the source says so). */
  const linkAcross = async (row: Row) => {
    let ok = 0;
    for (const a of row.across || []) {
      const evidence = `Listed in ${a.from} ("${a.fromLabel}")`;
      const r = await moonFetch<any>(`/authorities/${encodeURIComponent(row.entity.id)}/same-as`, { method: 'POST', body: { uri: a.uri, method: 'reconcile', confidence: 1, evidence } }).catch(() => null);
      if (r?.ok) ok++;
    }
    if (ok) set(row.entity.id, { state: 'linked' });
    return ok;
  };

  const linkAllSure = async () => {
    if (!rows) return;
    setLinking(true);
    const sure = rows.filter((r) => r.state === 'sure' && (r.sure || r.across?.length));
    let done = 0;
    for (const r of sure) if (r.across?.length ? await linkAcross(r) : await link(r, r.sure!, 'reconcile')) done++;
    setLinking(false);
    toast.success(t(`رُبط ${done} كياناً`, `${done} entities linked`));
    onLinked?.();
  };

  const count = (s: Row['state']) => (rows || []).filter((r) => r.state === s).length;
  const box: React.CSSProperties = { background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.9)', borderRadius: 24 };

  return (
    <div className="p-5 space-y-4" style={box} dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="me-auto">
          <div className="text-base font-bold text-slate-800">{t('ربط الكيانات بمكتبة الكونغرس وVIAF وويكي بيانات', 'Link entities to LC, VIAF and Wikidata')}</div>
          <div className="text-xs text-slate-500">{t('لكل كيان مربوط: تُضاف الروابط التي يذكرها مصدره نفسه (مؤكدة). ولكل كيان بلا روابط: يُبحث عنه؛ المؤكد هو الاسم نفسه والتواريخ نفسها للأشخاص ولا منافس قريب.', 'An entity with links gets the links its own records list (sure). One with none is searched; sure means the same name, the same dates for a person, and no close second.')}</div>
        </div>
        {!rows && (
          <button type="button" onClick={start} disabled={running} className="inline-flex items-center gap-2 rounded-full bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            <Search className="h-4 w-4" /> {t('ابحث عن الروابط', 'Find the links')}
          </button>
        )}
        {running && (
          <button type="button" onClick={() => { stopRef.current = true; }} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            {t('أوقف', 'Stop')}
          </button>
        )}
        {rows && count('sure') > 0 && (
          <button type="button" onClick={linkAllSure} disabled={linking || running} className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} {t(`اربط المؤكد (${count('sure')})`, `Link all sure matches (${count('sure')})`)}
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white" aria-label={t('إغلاق', 'Close')}><X className="h-4 w-4" /></button>
      </div>

      {rows && (
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {running && <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-sky-800"><Loader2 className="h-3 w-3 animate-spin" /> {t(`يبحث… ${rows.length - count('waiting') - count('searching')} من ${rows.length}`, `Searching… ${rows.length - count('waiting') - count('searching')} of ${rows.length}`)}</span>}
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">{t(`مؤكد ${count('sure')}`, `Sure ${count('sure')}`)}</span>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">{t(`للمراجعة ${count('review')}`, `To review ${count('review')}`)}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{t(`لم يوجد ${count('none')}`, `Not found ${count('none')}`)}</span>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-800">{t(`رُبط ${count('linked')}`, `Linked ${count('linked')}`)}</span>
          <span className="rounded-full bg-white px-3 py-1 text-slate-600">{t(`مكتمل الروابط ${count('complete')}`, `All links already ${count('complete')}`)}</span>
          {count('nomatch') > 0 && <span className="rounded-full bg-white px-3 py-1 text-slate-600">{t(`لا مقابل ${count('nomatch')}`, `No match ${count('nomatch')}`)}</span>}
          {total && <span className="rounded-full bg-white px-3 py-1 text-slate-500">{t(`بلا روابط خارجية: ${total.unlinked} من ${total.total}`, `Without outside links: ${total.unlinked} of ${total.total}`)}</span>}
        </div>
      )}

      {rows && (
        <ul className="divide-y divide-slate-200/70 max-h-[60vh] overflow-auto">
          {rows.filter((r) => r.state !== 'waiting').map((r) => (
            <li key={r.entity.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-slate-800" dir="auto">{r.entity.label}</span>
                <span className="text-xs text-slate-500">{ar ? KIND[r.entity.kind]?.[0] : KIND[r.entity.kind]?.[1]}</span>
                <span className="ms-auto text-xs">
                  {r.state === 'searching' && <Loader2 className="h-4 w-4 animate-spin text-sky-600" />}
                  {r.state === 'linked' && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {t('رُبط', 'linked')}</span>}
                  {r.state === 'none' && <span className="text-slate-500">{t('لم يوجد', 'not found')}</span>}
                  {r.state === 'complete' && <span className="text-slate-500">{t('لديه كل الروابط', 'has every link')}</span>}
                  {r.state === 'error' && <span className="text-rose-600">{t('تعذّر البحث', 'search failed')}</span>}
                  {r.state === 'nomatch' && <span className="text-slate-500">{t('لا مقابل له (حُفظ)', 'no match (saved)')}</span>}
                </span>
                {(r.state === 'none' || r.state === 'review') && (
                  <button type="button" onClick={() => noMatch(r)} title={t('ليس في مكتبة الكونغرس ولا ويكي بيانات؛ لن يُعرض ستة أشهر', 'Not in LC or Wikidata; hidden for six months')}
                    className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    {t('لا مقابل له', 'No match')}
                  </button>
                )}
              </div>
              {r.state === 'sure' && !!r.across?.length && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs">
                  <span className="font-semibold text-emerald-900">{t('روابط يذكرها مصدره:', 'Links its own records list:')}</span>
                  {r.across.map((a) => <a key={a.uri} href={a.uri} target="_blank" rel="noreferrer" dir="ltr" className="text-sky-800 hover:underline">{a.uri.replace(/^https?:\/\/(www\.)?/, '')}</a>)}
                  <button type="button" onClick={async () => { if (await linkAcross(r)) { toast.success(t('رُبط', 'Linked')); onLinked?.(); } }}
                    className="ms-auto inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-sky-800 hover:bg-sky-50">
                    <Link2 className="h-3.5 w-3.5" /> {t('اربط', 'Link')}
                  </button>
                </div>
              )}
              {(r.state === 'sure' || r.state === 'review') && !r.across?.length && (
                <div className="mt-2 space-y-1.5">
                  {(r.state === 'sure' ? [r.sure!] : r.candidates).map((c) => (
                    <div key={c.uri} className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm ${r.state === 'sure' ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-700">{c.source === 'LOC' ? 'LC' : c.source}</span>
                      <a href={c.uri} target="_blank" rel="noreferrer" className="font-medium text-slate-800 hover:underline" dir="auto">{c.label}</a>
                      <span className="text-xs text-slate-500">{Math.round(c.score * 100)}% · {c.reasons.join(', ')}</span>
                      <span className="text-[11px] text-slate-400" dir="ltr">{c.links.length} {t('روابط', 'links')}</span>
                      <button type="button" onClick={async () => { if (await link(r, c)) { toast.success(t('رُبط', 'Linked')); onLinked?.(); } }}
                        className="ms-auto inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-sky-800 hover:bg-sky-50">
                        <Link2 className="h-3.5 w-3.5" /> {t('اربط', 'Link')}
                      </button>
                      <button type="button" onClick={() => reject(r, c)} title={t('ليس هو؛ لن يُقترح مرة أخرى', 'Not this one; it will not be suggested again')}
                        className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700">
                        <X className="h-3.5 w-3.5" /> {t('ليس هو', 'Not this one')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
