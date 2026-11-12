/**
 * Moon Studio's Entities section (Phase 10, step 2): list, search, create and edit Moon's entities: people
 * and bodies, places, topics, works (hubs), genres and periods. Each has a permanent address on
 * mooon.site/resource/<kind>/<id>; the form's fields follow LC's Marva templates. Arabic names can get their
 * ALA-LC romanized form from LC's ScriptShifter. Every save keeps the earlier version.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { describeLinkSource, sourcesByLink, type LinkSource } from '../utils/linkSource';
import { EntityRequestsInbox, EntityMergeBox } from './EntityRequests';
import { WorkGroupsReview } from './WorkGroupsReview';
import { LinkReportCard } from './LinkReportCard';
import { layerFrom, refreshFromSource, type ImportedLayers, type RefreshChange } from '../../services/entityLayers';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Search, Save, History, Languages, ExternalLink, Users, X, Download, Loader2, Network, Link2, Layers } from 'lucide-react';
import { moonFetch, moonHeaders, MOON_API } from '../utils/moonApi';
import { romanizeAll } from '../../services/romanize';
import { parseArabicName, nameVariants } from '../../services/arabicNames';
import { taggedForms } from '../../services/nameForms';
import { toArabicScript, looksAlaLc } from '../../services/alaLcToArabic';
import { ReconcilePanel } from './ReconcilePanel';
import { WorkLinksPanel } from './WorkLinksPanel';
import { searchLOCAuthorities, searchWikidata, searchVIAF, type AuthorityResult } from '../../services/authoritySearch';
import { outsideRef, fetchOutsideEntity, formFromDraft, mergeDraftIntoForm, type OutsideSource } from '../../services/entityImport';
import {
  ENTITY_KINDS, AGENT_TYPES, KIND_LABELS, AGENT_LABELS, detailFields, emptyForm, formFrom, formProblems, payloadFrom, hasArabic,
  type EntityKind, type EntityForm, type StoredEntity, type AgentType,
} from '../utils/entityForm';

interface Entity extends StoredEntity {
  id: string;
  uri: string;
  createdBy?: string | null;
  updatedAt?: string;
  mergedInto?: string | null;
}
interface Usage { count: number; records: Array<{ id: string; title: string }> }
interface Relation {
  relation: string; kind: EntityKind; label: string; uri: string | null; entityId?: string; entityUri?: string | null;
  count: number; records: string[]; titles: string[];
}
/** How each relation reads, Arabic then English, in the order the page shows them. */
const RELATION_LABELS: Record<string, [string, string]> = {
  'worked-with': ['شارك في التأليف مع', 'Worked with'],
  'wrote-about': ['كتب عن', 'Wrote about'],
  'written-about-by': ['كتب عنه', 'Written about by'],
  'studied-with': ['يُدرس مع', 'Studied together with'],
  'published-by': ['نشر له', 'Published by'],
  'published': ['نشر لـ', 'Published'],
  'published-in': ['نُشر في', 'Published in'],
  'published-here': ['نُشر هنا لـ', 'Authors published here'],
  'based-in': ['مقره', 'Based in'],
  'publishers-here': ['ناشرون هنا', 'Publishers here'],
};
const sourceOf = (uri: string) => (/id\.loc\.gov/.test(uri) ? 'LC' : /viaf\.org/.test(uri) ? 'VIAF' : /wikidata/.test(uri) ? 'Wikidata' : '');
interface Version { version: number; label: string; changedBy?: string; changedAt: string }

/** The css.glass recipe, as on the OPAC. */
const GLASS: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.57)',
  borderRadius: '16px',
  boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 1)',
};
const INPUT = 'w-full rounded-xl border border-white bg-white/70 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-slate-300';

const isAr = () => typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
const t = (ar: string, en: string) => (isAr() ? ar : en);
const L = (pair: [string, string]) => t(pair[0], pair[1]);

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

export function EntitiesPage({ onBack }: { onBack: () => void }) {
  const [kind, setKind] = useState<EntityKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [list, setList] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Entity | null>(null);
  const [form, setForm] = useState<EntityForm | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [linkSources, setLinkSources] = useState<LinkSource[]>([]);
  const [requestsKey, setRequestsKey] = useState(0);
  // What each outside source said (kept apart from Moon's own values), and what the last refresh changed.
  const [pendingLayers, setPendingLayers] = useState<ImportedLayers>({});
  const [refreshChanges, setRefreshChanges] = useState<RefreshChange[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<Version[] | null>(null);
  const [relations, setRelations] = useState<Relation[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [romanizing, setRomanizing] = useState(false);
  // Copy from outside (step 3): the search panel, and what the last copy brought that the form does not show.
  const [copyOpen, setCopyOpen] = useState(false);
  // Linking every entity to LC, VIAF and Wikidata (Phase 12, step 5).
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [workLinksOpen, setWorkLinksOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [copyQuery, setCopyQuery] = useState('');
  const [copyResults, setCopyResults] = useState<AuthorityResult[]>([]);
  const [copySearching, setCopySearching] = useState(false);
  const [copying, setCopying] = useState<string | null>(null);
  const [draftData, setDraftData] = useState<Record<string, unknown>>({});
  const [copiedFrom, setCopiedFrom] = useState<OutsideSource[]>([]);

  // Search as you type (a short pause first), in the chosen kind.
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ q: query.trim(), limit: '100' });
      if (kind !== 'all') params.set('kind', kind);
      const res = await moonFetch<{ authorities?: Entity[]; error?: string }>(`/authorities?${params}`).catch(() => null);
      if (!live) return;
      setLoading(false);
      if (res?.ok) setList(res.data.authorities || []);
      else toast.error(t('تعذّر البحث في الكيانات', 'Could not search the entities'), { description: res?.data?.error });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [kind, query]);

  const loadRelations = async (id: string) => {
    setRelations(null);
    const res = await moonFetch<{ relations?: Relation[] }>(`/authorities/${encodeURIComponent(id)}/relations`).catch(() => null);
    setRelations(res?.ok ? res.data.relations || [] : []);
  };

  /** Opens a related entity from the relations list. */
  const openById = async (id: string) => {
    const res = await moonFetch<{ authority?: Entity }>(`/authorities/${encodeURIComponent(id)}`).catch(() => null);
    if (res?.ok && res.data.authority) open(res.data.authority);
    else toast.error(t('تعذّر فتح الكيان', 'Could not open the entity'));
  };

  const open = async (e: Entity) => {
    setSelected(e);
    setForm(formFrom(e));
    setUsage(null);
    setHistory(null);
    setLinkSources([]);
    setPendingLayers({});
    setRefreshChanges(null);
    loadRelations(e.id);
    const res = await moonFetch<{ authority?: Entity; usage?: Usage; linkSources?: LinkSource[] }>(`/authorities/${encodeURIComponent(e.id)}`).catch(() => null);
    if (res?.ok && res.data.authority) {
      setSelected(res.data.authority);
      setForm(formFrom(res.data.authority));
      setUsage(res.data.usage || null);
      setLinkSources(res.data.linkSources || []);
    }
  };

  const startNew = () => {
    setSelected(null);
    setForm(emptyForm(kind === 'all' ? 'agent' : kind));
    setUsage(null);
    setHistory(null);
    setDraftData({});
    setPendingLayers({});
    setRefreshChanges(null);
    setCopiedFrom([]);
  };

  // Search LC, Wikidata and VIAF as you type (LC's name, subject or genre file by the chosen kind; LC cannot
  // match Arabic script, so Arabic queries are answered by Wikidata and VIAF). A pasted link is copied as is.
  useEffect(() => {
    if (!copyOpen) return;
    const q = copyQuery.trim();
    if (q.length < 2 || outsideRef(q)) { setCopyResults([]); return; }
    let live = true;
    const timer = setTimeout(async () => {
      setCopySearching(true);
      const lcFile = kind === 'topic' || kind === 'period' ? 'subjects' : kind === 'genre' ? 'genreForms' : 'names';
      const lists = await Promise.all([
        searchLOCAuthorities(q, lcFile).catch(() => []),
        ...(kind === 'all' ? [searchLOCAuthorities(q, 'subjects').catch(() => [])] : []),
        searchWikidata(q).catch(() => []),
        ...(kind === 'all' || kind === 'agent' ? [searchVIAF(q).catch(() => [])] : []),
      ]);
      if (!live) return;
      setCopySearching(false);
      const seen = new Set<string>();
      setCopyResults(lists.flat().filter((r) => r.uri && outsideRef(r.uri) && !seen.has(r.uri) && seen.add(r.uri)).slice(0, 30));
    }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [copyOpen, copyQuery, kind]);

  // Copies the outside record into the form. If Moon already has an entity with one of its links, that entity
  // opens with what LC / Wikidata add (nothing of Moon's is overwritten); otherwise a new entity form opens.
  // Nothing is saved until the cataloguer presses the save button.
  const copyFrom = async (link: string, label?: string) => {
    setCopying(link);
    try {
      const draft = await fetchOutsideEntity(link, { lang: isAr() ? 'ar' : 'en', fallbackLabel: label });
      const params = new URLSearchParams({ kind: draft.kind });
      draft.sameAs.forEach((u) => params.append('uri', u));
      const found = await moonFetch<{ authority?: Entity | null }>(`/authorities/by-link?${params}`).catch(() => null);
      const existing = found?.ok ? found.data.authority : null;
      const source = outsideRef(link)?.uri || link;
      const layer = layerFrom(draft);
      if (existing) {
        await open(existing);
        const layers = ((existing.data as any)?.imported || {}) as ImportedLayers;
        const others = Object.entries(layers).filter(([k]) => k !== source).map(([, v]) => v);
        const merged = mergeDraftIntoForm(formFrom(existing), { ...draft, variants: [], details: {} });
        const r = refreshFromSource(merged, layers[source], layer, others);
        setForm(r.form);
        setRefreshChanges(r.changes);
        toast.message(t('لدى Moon هذا الكيان من قبل؛ فُتح مع ما يضيفه المصدر الخارجي. راجِعه ثم احفظ.', 'Moon already has this entity: it is open with what the outside record adds. Review it, then save.'));
      } else {
        setSelected(null);
        setUsage(null);
        setHistory(null);
        setForm(formFromDraft(draft));
        setRefreshChanges(null);
        toast.success(t('نُسخ؛ راجِع الحقول ثم اضغط «أنشئ الكيان».', 'Copied. Review the fields, then press "Create entity".'));
      }
      setDraftData(draft.data);
      setPendingLayers({ [source]: layer });
      setCopiedFrom(draft.sources);
      setCopyOpen(false);
      setCopyQuery('');
    } catch (error) {
      toast.error(t('تعذّر النسخ', 'Could not copy'), { description: error instanceof Error ? error.message : undefined });
    } finally {
      setCopying(null);
    }
  };

  const refreshFromOutside = async () => {
    if (!form || !selected) return;
    const links = [...new Set(form.sameAs.split(/\r?\n/).map((x) => x.trim()).map((u) => outsideRef(u)?.uri).filter((u): u is string => !!u))];
    if (!links.length) return;
    setRefreshing(true);
    const layers: ImportedLayers = { ...(((selected.data as any)?.imported || {}) as ImportedLayers), ...pendingLayers };
    let next = form;
    const all: RefreshChange[] = [];
    const fresh: ImportedLayers = {};
    for (const link of links) {
      const draft = await fetchOutsideEntity(link, { lang: isAr() ? 'ar' : 'en' }).catch(() => null);
      if (!draft) continue;
      const layer = layerFrom(draft);
      const others = Object.entries({ ...layers, ...fresh }).filter(([k]) => k !== link).map(([, v]) => v);
      const r = refreshFromSource(next, layers[link], layer, others);
      next = r.form;
      // The same change from several sources is listed once.
      for (const c of r.changes) if (!all.some((x) => x.kind === c.kind && x.field === c.field && x.value === c.value)) all.push(c);
      fresh[link] = layer;
    }
    setRefreshing(false);
    setForm(next);
    setPendingLayers((p) => ({ ...p, ...fresh }));
    setRefreshChanges(all);
    const n = (k: RefreshChange['kind']) => all.filter((c) => c.kind === k).length;
    toast.message(t(`أُضيف ${n('added')}، حُدّث ${n('updated')}، حُذف ${n('removed')}، وبقي ${n('kept-own')} من قيم مون. راجِع ثم احفظ.`,
      `${n('added')} added, ${n('updated')} updated, ${n('removed')} removed, ${n('kept-own')} kept as Moon's own. Review, then save.`));
  };

  const loadHistory = async () => {
    if (!selected) return;
    const res = await moonFetch<{ history?: Version[] }>(`/authorities/${encodeURIComponent(selected.id)}/history`).catch(() => null);
    setHistory(res?.ok ? res.data.history || [] : []);
  };

  const problems = form ? formProblems(form) : [];
  const set = (patch: Partial<EntityForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const setDetail = (key: string, value: string) => setForm((f) => (f ? { ...f, details: { ...f.details, [key]: value } } : f));

  const save = async () => {
    if (!form || problems.length) return;
    setSaving(true);
    // A copy's extras (a place's coordinates …) fill in, without replacing what the entity already holds.
    const previous = (selected?.data as Record<string, unknown>) || {};
    const imported = { ...((previous.imported as ImportedLayers) || {}), ...pendingLayers };
    const body = payloadFrom(form, { ...draftData, ...previous, ...(Object.keys(imported).length ? { imported } : {}) });
    const res = selected
      ? await moonFetch<any>(`/authorities/${encodeURIComponent(selected.id)}`, { method: 'PUT', body: { ...body, version: selected.version } }).catch(() => null)
      : await moonFetch<any>('/authorities', { body }).catch(() => null);
    setSaving(false);
    if (!res) { toast.error(t('تعذّر الحفظ', 'Could not save')); return; }
    if (res.status === 409 && res.data?.authority) {
      toast.error(t('عدّل شخص آخر هذا الكيان بعد أن فتحته. فُتحت النسخة الأحدث؛ أعد تعديلك عليها.', 'Someone else saved this entity after you opened it. The newer version is open now; make your change again.'));
      setSelected(res.data.authority);
      setForm(formFrom(res.data.authority));
      return;
    }
    if (res.status === 409 && Array.isArray(res.data?.protected)) {
      // Protected values (S18): another library added these; only they or the Super Admin may remove or change them.
      const list = res.data.protected.slice(0, 6).map((p: any) => `«${p.value}» — ${p.library}`).join(' · ');
      toast.error(t('قيم أضافتها مكتبة أخرى لا تُحذف ولا تُغيَّر إلا منها أو من المشرف العام', 'Values another library added can only be removed or changed by that library or the Super Admin'),
        { description: list, duration: 12000 });
      return;
    }
    if (res.status === 409 && res.data?.other) {
      toast.error(t(`يوجد كيان آخر بهذا الاسم: ${res.data.other.label}`, `Another entity already has this name: ${res.data.other.label}`));
      return;
    }
    if (!res.ok) { toast.error(t('تعذّر الحفظ', 'Could not save'), { description: res.data?.error }); return; }
    const saved: Entity = res.data.authority;
    if (!selected && res.data.existing) {
      // The existing entity keeps its own fields; the outside links the new form carried are added to it.
      const missing = body.sameAs.filter((u) => !(saved.sameAs || []).includes(u));
      for (const uri of missing) await moonFetch<any>(`/authorities/${encodeURIComponent(saved.id)}/same-as`, { body: { uri } }).catch(() => null);
      toast.message(t('هذا الكيان موجود من قبل؛ فُتح الموجود وأضيفت إليه الروابط الخارجية.', 'This entity already exists; the existing one is open, with the outside links added.'));
    } else toast.success(t('حُفظ', 'Saved'));
    setDraftData({});
    setCopiedFrom([]);
    setList((l) => [saved, ...l.filter((x) => x.id !== saved.id)]);
    await open(saved);
  };

  // ALA-LC romanization of the Arabic name (and Arabic other forms), added as other forms of the name.
  const romanize = async () => {
    if (!form) return;
    const arabic = [form.label, ...form.variants.split('\n')].map((s) => s.trim()).filter((s) => s && hasArabic(s));
    if (!arabic.length) return;
    setRomanizing(true);
    const latin = (await romanizeAll(arabic, `${MOON_API}/scriptshifter/trans`, moonHeaders()).catch(() => [] as string[])).filter(Boolean);
    setRomanizing(false);
    if (!latin.length) { toast.error(t('لم تُرجِع خدمة ScriptShifter شيئاً', 'ScriptShifter gave nothing back')); return; }
    const current = form.variants.split('\n').map((s) => s.trim()).filter(Boolean);
    set({ variants: [...new Set([...current, ...latin])].join('\n') });
    toast.success(t(`أضيف ${latin.length} شكل بالحروف اللاتينية`, `Added ${latin.length} romanized form(s)`));
  };

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    list.forEach((e) => m.set(e.kind, (m.get(e.kind) || 0) + 1));
    return m;
  }, [list]);

  const kindOf = (e: Entity) => (e.kind === 'agent' ? L(AGENT_LABELS[(e.data?.agentType as AgentType) || 'person'] || AGENT_LABELS.person) : L(KIND_LABELS[e.kind]));

  return (
    <div className="min-h-screen px-4 md:px-8 py-6" dir={isAr() ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.57] border border-white shadow-[0_4px_30px_rgba(0,0,0,0.1)] backdrop-blur-[20px] text-sm font-semibold text-slate-700 hover:bg-white">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('لوحة التحكم', 'Dashboard')}
          </button>
          <h1 className="text-2xl font-black text-slate-900">{t('الكيانات', 'Entities')}</h1>
          <span className="text-sm text-slate-500">{t('كل كيان يُفهرس مرة واحدة وله عنوان دائم، وتشير إليه التسجيلات.', 'Each entity is catalogued once, has a permanent address, and records point to it.')}</span>
          <button
            onClick={() => setCopyOpen((o) => !o)}
            aria-expanded={copyOpen}
            className="ms-auto flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.57] border border-white shadow-[0_4px_30px_rgba(0,0,0,0.1)] backdrop-blur-[20px] text-sm font-bold text-slate-800 hover:bg-white"
          >
            <Download className="h-4 w-4" /> {t('انسخ من LC أو VIAF أو ويكي بيانات', 'Copy from LC, VIAF or Wikidata')}
          </button>
          <button
            onClick={() => setReconcileOpen((o) => !o)}
            aria-expanded={reconcileOpen}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.57] border border-white shadow-[0_4px_30px_rgba(0,0,0,0.1)] backdrop-blur-[20px] text-sm font-bold text-slate-800 hover:bg-white"
          >
            <Link2 className="h-4 w-4" /> {t('اربط بـ LC وVIAF وويكي بيانات', 'Link to LC, VIAF, Wikidata')}
          </button>
          <button
            onClick={() => setGroupsOpen((o) => !o)}
            aria-expanded={groupsOpen}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.57] border border-white shadow-[0_4px_30px_rgba(0,0,0,0.1)] backdrop-blur-[20px] text-sm font-bold text-slate-800 hover:bg-white"
          >
            <Layers className="h-4 w-4" /> {t('مجموعات الأعمال', 'Work groups')}
          </button>
          <button
            onClick={() => setWorkLinksOpen((o) => !o)}
            aria-expanded={workLinksOpen}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.57] border border-white shadow-[0_4px_30px_rgba(0,0,0,0.1)] backdrop-blur-[20px] text-sm font-bold text-slate-800 hover:bg-white"
          >
            <Link2 className="h-4 w-4" /> {t('اربط الأعمال', 'Link works')}
          </button>
          <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.57] border border-white shadow-[0_4px_30px_rgba(0,0,0,0.1)] backdrop-blur-[20px] text-slate-900 text-sm font-bold hover:bg-white">
            <Plus className="h-4 w-4" /> {t('كيان جديد', 'New entity')}
          </button>
        </div>

        {/* Suspect links to LC, VIAF and Wikidata (S16): a report, never a block. */}
        <LinkReportCard ar={isAr()} onOpen={async (id) => { const r = await moonFetch<any>(`/authorities/${encodeURIComponent(id)}`).catch(() => null); if (r?.ok && r.data?.authority) open(r.data.authority); }} />

        <EntityRequestsInbox ar={isAr()} refreshKey={requestsKey} onDecided={() => { setQuery((q) => q + ''); if (selected) open(selected); }} />

        {groupsOpen && <WorkGroupsReview ar={isAr()} onClose={() => setGroupsOpen(false)} />}

        {workLinksOpen && <WorkLinksPanel ar={isAr()} onClose={() => setWorkLinksOpen(false)} />}

        {reconcileOpen && (
          <ReconcilePanel ar={isAr()} onClose={() => setReconcileOpen(false)} onLinked={() => setQuery((q) => q + '')} />
        )}

        {copyOpen && (
          <div className="p-4 space-y-3" style={GLASS}>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
                <input
                  autoFocus
                  className={`${INPUT} ps-9`}
                  dir="auto"
                  value={copyQuery}
                  onChange={(e) => setCopyQuery(e.target.value)}
                  placeholder={t('اسم أو موضوع أو مكان، أو الصق رابطاً من LC أو VIAF أو ويكي بيانات', 'A name, subject or place, or paste an LC, VIAF or Wikidata link')}
                  aria-label={t('بحث خارجي', 'Search outside')}
                />
              </div>
              <button onClick={() => setCopyOpen(false)} className="p-1.5 rounded-full hover:bg-white/70" aria-label={t('إغلاق', 'Close')}>
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>
            <div className="text-xs text-slate-500">
              {kind === 'all'
                ? t('يبحث في أسماء مكتبة الكونغرس وموضوعاتها وفي ويكي بيانات وVIAF. اختر نوعاً لتضييق البحث.', 'Searches LC names and subjects, Wikidata and VIAF. Pick a kind above to narrow it.')
                : t(`يبحث عن: ${L(KIND_LABELS[kind])}`, `Searching for: ${L(KIND_LABELS[kind])}`)}
              {' · '}{t('النسخ يملأ النموذج ولا يُحفظ شيء قبل أن تضغط حفظ.', 'Copying fills the form; nothing is saved until you press save.')}
            </div>
            {outsideRef(copyQuery) ? (
              <button
                onClick={() => copyFrom(copyQuery.trim())}
                disabled={!!copying}
                className="w-full text-start px-3 py-2.5 rounded-xl bg-white/80 hover:bg-white flex items-center gap-2 disabled:opacity-60"
              >
                {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-sky-700" />}
                <span className="text-sm font-semibold text-slate-800">{t('انسخ هذا السجل', 'Copy this record')}</span>
                <span className="text-xs text-slate-500 break-all" dir="ltr">{outsideRef(copyQuery)?.uri}</span>
              </button>
            ) : (
              <ul className="divide-y divide-slate-200/70 max-h-[40vh] overflow-y-auto">
                {copySearching && <li className="px-3 py-3 text-sm text-slate-500">{t('جارٍ البحث…', 'Searching…')}</li>}
                {!copySearching && copyQuery.trim().length >= 2 && !copyResults.length && (
                  <li className="px-3 py-3 text-sm text-slate-500">{t('لا نتائج.', 'Nothing found.')}</li>
                )}
                {copyResults.map((r) => (
                  <li key={r.uri}>
                    <button
                      onClick={() => copyFrom(r.uri, r.label)}
                      disabled={!!copying}
                      className="w-full text-start px-3 py-2.5 rounded-xl hover:bg-white/70 flex items-start gap-3 disabled:opacity-60"
                    >
                      <span className="mt-0.5 shrink-0 rounded-full bg-slate-900/80 text-white text-[10px] font-bold px-2 py-0.5">{r.source === 'LOC' ? 'LC' : r.source}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-slate-900" dir="auto">{r.label}</span>
                        {r.description && <span className="block text-xs text-slate-500 truncate" dir="auto">{r.description}</span>}
                        <span className="block text-[11px] text-slate-400 break-all" dir="ltr">{r.uri}</span>
                      </span>
                      {copying === r.uri && <Loader2 className="h-4 w-4 animate-spin text-sky-700 shrink-0" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('نوع الكيان', 'Kind of entity')}>
          {(['all', ...ENTITY_KINDS] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-colors ${kind === k ? 'bg-white/[0.57] text-slate-900 font-bold border-white shadow-[0_4px_30px_rgba(0,0,0,0.1)] backdrop-blur-[20px] ring-2 ring-slate-900/70' :'bg-white/[0.57] text-slate-700 border-white shadow-[0_4px_30px_rgba(0,0,0,0.1)] backdrop-blur-[20px] hover:bg-white'}`}
            >
              {k === 'all' ? t('الكل', 'All') : L(KIND_LABELS[k])}
              {k !== 'all' && kind === 'all' && counts.get(k) ? <span className="ms-1.5 opacity-70">{counts.get(k)}</span> : null}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5">
          {/* The list */}
          <div className="p-4 space-y-3" style={GLASS}>
            <div className="relative">
              <Search className="h-4 w-4 absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
              <input
                className={`${INPUT} ps-9`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('ابحث بالاسم أو بأي شكل آخر له', 'Search by name or any other form of it')}
                aria-label={t('بحث', 'Search')}
              />
            </div>
            <div className="text-xs text-slate-500">{loading ? t('جارٍ البحث…', 'Searching…') : t(`${list.length} كيان`, `${list.length} entities`)}</div>
            <ul className="divide-y divide-slate-200/70 max-h-[65vh] overflow-y-auto">
              {list.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => { setDraftData({}); setCopiedFrom([]); open(e); }}
                    className={`w-full text-start px-3 py-2.5 rounded-xl hover:bg-white/70 ${selected?.id === e.id ? 'bg-white' : ''}`}
                  >
                    <div className="text-sm font-semibold text-slate-900" dir="auto">{e.label}</div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-x-2">
                      <span>{kindOf(e)}</span>
                      {e.variants?.[0] && <span dir="auto">· {e.variants[0]}</span>}
                      {(e.sameAs?.length || 0) > 0 && <span>· {t('مربوط خارجياً', 'linked outside')}</span>}
                    </div>
                  </button>
                </li>
              ))}
              {!loading && !list.length && (
                <li className="px-3 py-6 text-sm text-slate-500 text-center">{t('لا كيانات. أنشئ واحداً بزر «كيان جديد».', 'No entities. Make one with "New entity".')}</li>
              )}
            </ul>
          </div>

          {/* The editor */}
          <div className="p-5 space-y-4" style={GLASS}>
            {!form ? (
              <div className="py-16 text-center text-slate-500 text-sm">{t('اختر كياناً من القائمة أو أنشئ كياناً جديداً.', 'Pick an entity from the list, or make a new one.')}</div>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-slate-500">{selected ? t('تعديل كيان', 'Edit entity') : t('كيان جديد', 'New entity')}</div>
                    {copiedFrom.length > 0 && (
                      <div className="text-xs text-emerald-700 font-semibold">
                        {t('منسوخ من', 'Copied from')} {copiedFrom.map((s) => (s === 'lc' ? t('مكتبة الكونغرس', 'LC') : s === 'viaf' ? 'VIAF' : t('ويكي بيانات', 'Wikidata'))).join(' + ')}
                        {' · '}{t('لم يُحفظ بعد', 'not saved yet')}
                      </div>
                    )}
                    {selected && (
                      <a href={selected.uri} target="_blank" rel="noreferrer" dir="ltr" className="text-xs text-sky-700 hover:underline break-all inline-flex items-center gap-1">
                        {selected.uri} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <button onClick={() => { setForm(null); setSelected(null); }} className="p-1.5 rounded-full hover:bg-white/70" aria-label={t('إغلاق', 'Close')}>
                    <X className="h-4 w-4 text-slate-500" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label={t('النوع', 'Kind')}>
                    <select
                      className={INPUT}
                      value={form.kind}
                      disabled={!!selected}
                      onChange={(e) => set({ kind: e.target.value as EntityKind, details: {} })}
                    >
                      {ENTITY_KINDS.map((k) => <option key={k} value={k}>{L(KIND_LABELS[k])}</option>)}
                    </select>
                  </Field>
                  {form.kind === 'agent' && (
                    <Field label={t('نوع الفاعل', 'Type of agent')}>
                      <select className={INPUT} value={form.agentType} onChange={(e) => set({ agentType: e.target.value as AgentType })}>
                        {AGENT_TYPES.map((a) => <option key={a} value={a}>{L(AGENT_LABELS[a])}</option>)}
                      </select>
                    </Field>
                  )}
                </div>

                <Field label={t('الاسم المعتمد', 'Authorized name')} hint={form.kind === 'agent' && form.agentType === 'person' ? t('كما في مكتبة الكونغرس: الاسم الأخير، الاسم الأول، التواريخ', 'As LC writes it: Surname, Forename, dates') : undefined}>
                  <input className={INPUT} dir="auto" value={form.label} onChange={(e) => set({ label: e.target.value })} />
                </Field>

                <Field label={t('أشكال أخرى للاسم (شكل في كل سطر)', 'Other forms of the name (one per line)')}>
                  <textarea className={INPUT} dir="auto" rows={3} value={form.variants} onChange={(e) => set({ variants: e.target.value })} />
                </Field>
                {form.kind === 'agent' && form.label.trim() && (() => {
                  // Each form with its script tag; a person marks the preferred one for each script (S10). The OPAC
                  // and the MARC export use the Arabic-script form for books in Arabic script, the romanized one otherwise.
                  const forms = taggedForms(form.label, form.variants.split('\n'), form.preferred);
                  if (forms.length < 2) return null;
                  const choose = (script: 'arabic' | 'latin', value: string) => set({ preferred: { ...(form.preferred || {}), [script]: form.preferred?.[script] === value ? undefined : value } });
                  return (
                    <div className="rounded-xl bg-white/60 border border-white p-3 text-sm">
                      <div className="text-xs font-semibold text-slate-600 mb-1">{t('الشكل المفضّل لكل خط', 'Preferred form for each script')}</div>
                      <p className="text-[11px] text-slate-500 mb-2">{t('يظهر الشكل العربي المختار في الكتب العربية (وفي حقل 880 في مارك)، والشكل اللاتيني في غيرها.', 'The chosen Arabic-script form shows in books in Arabic script (and in the MARC 880); the romanized form elsewhere.')}</p>
                      <ul className="space-y-1">
                        {forms.map((f) => (
                          <li key={f.form} className="flex items-center gap-2">
                            <input type="radio" name={`pref-${f.script}`} checked={f.preferred} onChange={() => {}} onClick={() => choose(f.script, f.form)}
                              aria-label={t(`المفضّل بالخط ${f.script === 'arabic' ? 'العربي' : 'اللاتيني'}`, `Preferred in ${f.script === 'arabic' ? 'Arabic' : 'Latin'} script`)} />
                            <span dir="auto" className={f.preferred ? 'font-bold text-slate-900' : 'text-slate-700'}>{f.form}</span>
                            <span dir="ltr" className="ms-auto rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500">{f.tag}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
                {form.kind === 'agent' && form.agentType === 'person' && form.label.trim() && (() => {
                  // The parts of an Arabic name (kunya, ism, nasab, laqab, nisba), and the forms people search it by.
                  const p = parseArabicName(form.label);
                  const rows: [string, string, string | undefined][] = [
                    ['المدخل', 'Entry element', p.entry], ['الكنية', 'Kunya', p.kunya], ['الاسم', 'Ism', p.ism],
                    ['النسب', 'Nasab', p.nasab.join(p.script === 'arabic' ? ' بن ' : ' ibn ') || undefined],
                    ['اللقب', 'Laqab', p.laqab], ['النسبة', 'Nisba', p.nisba.join(' ') || undefined], ['التواريخ', 'Dates', p.dates],
                  ];
                  const shown = rows.filter(([, , v]) => v);
                  const current = form.variants.split('\n').map((s) => s.trim()).filter(Boolean);
                  const missing = nameVariants(form.label).filter((v) => v !== form.label.trim() && !current.includes(v));
                  if (shown.length < 2 && !missing.length) return null;
                  return (
                    <div className="rounded-xl bg-white/60 border border-white p-3 space-y-2 text-sm">
                      {shown.length >= 2 && (
                        <div className="flex flex-wrap gap-1.5" dir="auto">
                          {shown.map(([a, e, v]) => (
                            <span key={e} className="rounded-full bg-sky-50 border border-sky-100 px-2.5 py-0.5 text-xs text-slate-700"><b className="text-sky-800">{t(a, e)}:</b> {v}</span>
                          ))}
                        </div>
                      )}
                      {missing.length > 0 && (
                        <button onClick={() => set({ variants: [...new Set([...current, ...missing])].join('\n') })}
                          className="flex items-center gap-2 text-sm font-semibold text-sky-700 hover:underline">
                          <Plus className="h-4 w-4" /> {t(`أضف ${missing.length} من أشكال الاسم (بن/ابن، الترتيب المباشر والمقلوب، بلا همزات)`, `Add ${missing.length} forms of the name (bin/ibn, direct and inverted order, plain letters)`)}
                        </button>
                      )}
                    </div>
                  );
                })()}
                {!hasArabic(form.label + form.variants) && looksAlaLc(form.label) && (
                  // The other way (S9): a name that came only romanized gets its Arabic script proposed, to check.
                  <button onClick={() => {
                    const proposed = toArabicScript(form.label.replace(/,?\s*\d{3,4}\??-(\d{3,4})?\.?$/, '').trim());
                    const edited = window.prompt(t('راجع الشكل العربي قبل إضافته:', 'Check the Arabic-script form before adding it:'), proposed);
                    if (edited && edited.trim()) set({ variants: [...new Set([...form.variants.split('\n').map((x) => x.trim()).filter(Boolean), edited.trim()])].join('\n') });
                  }} className="flex items-center gap-2 text-sm font-semibold text-sky-700 hover:underline">
                    <Languages className="h-4 w-4" /> {t('أضف الشكل بالحرف العربي (من الكتابة اللاتينية)', 'Add the Arabic-script form (from the romanization)')}
                  </button>
                )}
                {hasArabic(form.label + form.variants) && (
                  <button onClick={romanize} disabled={romanizing} className="flex items-center gap-2 text-sm font-semibold text-sky-700 hover:underline disabled:opacity-50">
                    <Languages className="h-4 w-4" /> {romanizing ? t('جارٍ التحويل…', 'Romanizing…') : t('أضف الشكل اللاتيني (ScriptShifter من مكتبة الكونغرس)', 'Add the romanized form (LC ScriptShifter)')}
                  </button>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {detailFields(form.kind, form.agentType).map((d) => (
                    <Field key={d.key} label={L(d.label)}>
                      {d.kind === 'uris'
                        ? <textarea className={INPUT} dir="ltr" rows={2} value={form.details[d.key] || ''} onChange={(e) => setDetail(d.key, e.target.value)} />
                        : <input className={INPUT} dir={d.kind === 'uri' ? 'ltr' : 'auto'} placeholder={d.placeholder} value={form.details[d.key] || ''} onChange={(e) => setDetail(d.key, e.target.value)} />}
                      {problems.includes(d.key) && <span className="text-xs text-rose-600">{t('يجب أن يكون رابطاً يبدأ بـ https://', 'Must be a link starting with https://')}</span>}
                    </Field>
                  ))}
                </div>

                {selected && (() => {
                  // Protected values (S18): which library added each value. Another library cannot remove or change them.
                  const owners = Object.entries(((selected.data as any)?._owners || {}) as Record<string, { library: string; by: string; at: string }>);
                  if (!owners.length) return null;
                  const byLibrary = new Map<string, string[]>();
                  for (const [key, o] of owners) byLibrary.set(o.library, [...(byLibrary.get(o.library) || []), key.replace(/^(label|variant|sameAs|data):/, '').replace(/=/, ': ')]);
                  return (
                    <details className="rounded-xl bg-white/60 border border-white p-3 text-xs text-slate-700">
                      <summary className="cursor-pointer font-semibold">{t(`من أضاف ماذا (${owners.length})`, `Who added what (${owners.length})`)}</summary>
                      <p className="mt-1 text-slate-500">{t('ما أضافته مكتبة لا تحذفه ولا تغيّره مكتبة أخرى؛ تقدر عليه المكتبة نفسها والمشرف العام.', 'What one library added, another cannot remove or change; that library and the Super Admin can.')}</p>
                      {[...byLibrary].map(([lib, keys]) => (
                        <div key={lib} className="mt-1"><b>{lib}</b>: <span dir="auto">{keys.slice(0, 12).join(' · ')}{keys.length > 12 ? ` +${keys.length - 12}` : ''}</span></div>
                      ))}
                    </details>
                  );
                })()}

                <Field label={t('الكيان نفسه في ملفات أخرى (رابط في كل سطر)', 'Same entity elsewhere (one link per line)')} hint={t('مكتبة الكونغرس، VIAF، ويكي بيانات، FAST، ISNI، ORCID', 'Library of Congress, VIAF, Wikidata, FAST, ISNI, ORCID')}>
                  <textarea className={INPUT} dir="ltr" rows={2} value={form.sameAs} onChange={(e) => set({ sameAs: e.target.value })} />
                  {problems.includes('same-as') && <span className="text-xs text-rose-600">{t('كل سطر يجب أن يكون رابطاً', 'Each line must be a link')}</span>}
                  {/* Where each saved link came from: a person, Moon's match (with its confidence and reasons), an import. */}
                  {selected && (selected.sameAs?.length || 0) > 0 && (
                    <ul className="mt-2 space-y-1">
                      {sourcesByLink(selected.sameAs || [], linkSources).map(({ uri, source }) => (
                        <li key={uri} className="text-[11px] leading-4 text-slate-500" title={source?.evidence || undefined}>
                          <span dir="ltr" className="font-mono text-slate-600 break-all">{uri.replace(/^https?:\/\/(www\.)?/, '')}</span>
                          {' · '}
                          {source ? describeLinkSource(source, isAr()) : t('أُضيف قبل حفظ المصادر', 'added before sources were kept')}
                          {source?.evidence && source.method !== 'person' && <span className="block text-slate-400" dir="auto">{source.evidence}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {selected && form.sameAs.trim() && (
                    <div className="mt-2">
                      <button type="button" onClick={refreshFromOutside} disabled={refreshing}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-sky-800 hover:bg-white disabled:opacity-50">
                        {refreshing ? t('يحدّث…', 'Refreshing…') : t('حدّث من مكتبة الكونغرس / ويكي بيانات', 'Refresh from LC / Wikidata')}
                      </button>
                      <span className="ms-2 text-[11px] text-slate-500">{t('يُحدَّث ما جاء من المصدر فقط؛ لا تُمسّ قيم مون.', 'Only what came from the source changes; Moon\'s own values are never touched.')}</span>
                    </div>
                  )}
                  {refreshChanges && refreshChanges.length > 0 && (
                    <ul className="mt-2 space-y-0.5 rounded-xl bg-white/60 p-2 text-[11px] leading-4">
                      {refreshChanges.map((c, i) => (
                        <li key={i} className={c.kind === 'kept-own' ? 'text-amber-700' : c.kind === 'removed' ? 'text-rose-700' : 'text-emerald-800'} dir="auto">
                          {c.kind === 'added' && t(`أُضيف (${c.field}): ${c.value}`, `Added (${c.field}): ${c.value}`)}
                          {c.kind === 'updated' && t(`حُدّث (${c.field}): ${c.was} ← ${c.value}`, `Updated (${c.field}): ${c.was} → ${c.value}`)}
                          {c.kind === 'removed' && t(`حُذف (${c.field}): ${c.value}`, `Removed (${c.field}): ${c.value}`)}
                          {c.kind === 'kept-own' && t(`بقيت قيمة مون (${c.field}): ${c.value} — المصدر يقول: ${c.was}`, `Kept Moon's own (${c.field}): ${c.value} — the source says: ${c.was}`)}
                        </li>
                      ))}
                    </ul>
                  )}
                </Field>

                <Field label={t('ملاحظة', 'Note')}>
                  <textarea className={INPUT} dir="auto" rows={2} value={form.note} onChange={(e) => set({ note: e.target.value })} />
                </Field>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    onClick={save}
                    disabled={saving || problems.length > 0}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-sky-700 text-white text-sm font-bold hover:bg-sky-800 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" /> {saving ? t('جارٍ الحفظ…', 'Saving…') : selected ? t('احفظ التعديل', 'Save changes') : t('أنشئ الكيان', 'Create entity')}
                  </button>
                  {problems.includes('name') && <span className="text-xs text-slate-500">{t('الاسم مطلوب', 'A name is required')}</span>}
                  {selected && (
                    <button onClick={loadHistory} className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:underline">
                      <History className="h-4 w-4" /> {t('النسخ السابقة', 'Earlier versions')}
                    </button>
                  )}
                </div>

                {selected && <EntityMergeBox entity={selected} ar={isAr()} onAsked={() => setRequestsKey((k) => k + 1)} />}

                {selected && (
                  <div className="rounded-2xl bg-white/60 border border-white p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Users className="h-4 w-4" />
                      {usage == null ? t('جارٍ عدّ التسجيلات…', 'Counting records…') : t(`تستخدمه ${usage.count} تسجيلة`, `Used by ${usage.count} record(s)`)}
                    </div>
                    {usage && usage.records.length > 0 && (
                      <ul className="text-sm text-slate-600 list-disc ps-5 space-y-0.5">
                        {usage.records.slice(0, 10).map((r) => <li key={r.id} dir="auto">{r.title}</li>)}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs" dir="ltr">
                      {(['jsonld', 'ttl', 'nt', 'rdf'] as const).map((f) => (
                        <a key={f} href={`${selected.uri}.${f}`} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">{f === 'jsonld' ? 'JSON-LD' : f === 'ttl' ? 'Turtle' : f === 'nt' ? 'N-Triples' : 'RDF/XML'}</a>
                      ))}
                    </div>
                  </div>
                )}

                {selected && (
                  <div className="rounded-2xl bg-white/60 border border-white p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Network className="h-4 w-4" /> {t('العلاقات مع كيانات أخرى', 'Relationships with other entities')}
                    </div>
                    {relations == null ? (
                      <div className="text-sm text-slate-500">{t('جارٍ قراءة التسجيلات…', 'Reading the records…')}</div>
                    ) : relations.length === 0 ? (
                      <div className="text-sm text-slate-500">{t('لا علاقات بعد: تظهر حين تستخدمه تسجيلات مع أسماء أو موضوعات أو أماكن أخرى.', 'None yet: they appear once records use it with other names, subjects or places.')}</div>
                    ) : (
                      Object.keys(RELATION_LABELS).filter((rel) => relations.some((r) => r.relation === rel)).map((rel) => (
                        <div key={rel}>
                          <div className="text-xs font-bold text-slate-500 mb-1">{L(RELATION_LABELS[rel])}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {relations.filter((r) => r.relation === rel).slice(0, 20).map((r) => (
                              <button
                                key={`${rel}|${r.entityId || r.uri || r.label}`}
                                type="button"
                                disabled={!r.entityId}
                                onClick={() => r.entityId && openById(r.entityId)}
                                title={r.titles.join(' · ')}
                                className={`text-xs rounded-full px-2.5 py-1 border ${r.entityId ? 'bg-sky-50 border-sky-200 text-sky-800 hover:bg-sky-100' : 'bg-slate-50 border-slate-200 text-slate-600 cursor-default'}`}
                              >
                                <span dir="auto">{r.label}</span>
                                <span className="text-slate-400"> · {r.count}</span>
                                {!r.entityId && r.uri && sourceOf(r.uri) && <span className="text-slate-400"> · {sourceOf(r.uri)}</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                    <div className="text-xs text-slate-400">{t('الرقم = عدد التسجيلات المشتركة. الأزرق كيان في Moon يُفتح بالنقر.', 'Number = records in common. Blue is a Moon entity: click to open it.')}</div>
                  </div>
                )}

                {history && (
                  <div className="rounded-2xl bg-white/60 border border-white p-4">
                    <div className="text-sm font-semibold text-slate-700 mb-2">{t('النسخ السابقة', 'Earlier versions')}</div>
                    {history.length === 0 ? (
                      <div className="text-sm text-slate-500">{t('لم يُعدَّل بعد.', 'Not edited yet.')}</div>
                    ) : (
                      <ul className="text-sm text-slate-600 space-y-1">
                        {history.map((h) => (
                          <li key={h.version}>
                            <b>v{h.version}</b> · <span dir="auto">{h.label}</span>
                            <span className="text-slate-400"> · {t('استُبدلت', 'replaced')} {new Date(h.changedAt).toLocaleString()}{h.changedBy ? ` · ${h.changedBy}` : ''}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EntitiesPage;
