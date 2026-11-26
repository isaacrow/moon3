/**
 * Moon Studio's menu, arranged the way a library is run: Acquisitions, Technical services, Circulation and
 * the Search engine (the public catalogue). Each section has its own page (/acquisitions/, /technical/,
 * /circulation/, /catalogue/) listing its tasks; the top bar opens the same tasks from a menu per section.
 * Tasks that are not built yet are shown as "coming soon" with one line on what they will do.
 */
import React, { useEffect, useState } from 'react';
import { moonFetch } from '../utils/moonApi';
import { motion } from 'motion/react';
import {
  ShoppingCart, BookMarked, Repeat, Search, FilePlus, FileCode, Library, Users, UserSearch, History,
  Building2, Receipt, FileText, Newspaper, PackageCheck, Database, IdCard, ArrowLeftRight, CalendarClock,
  Coins, Globe, ClipboardCheck, BarChart3, GraduationCap, Gauge, ChevronDown, ExternalLink, ListFilter, Link2, ShieldCheck, ScanSearch,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from './ui/dropdown-menu';

export type SectionId = 'acquisitions' | 'technical' | 'circulation' | 'catalogue';

/** What a task does when chosen. 'view' opens a Studio screen; 'soon' is not built yet. */
export type TaskAction =
  | { kind: 'view'; view: string; tab?: string }
  | { kind: 'new-record' }
  | { kind: 'marc-editor' }
  | { kind: 'link'; href: string }
  | { kind: 'soon' };

export interface Task {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  ar: string;
  en: string;
  /** One line under the name. */
  arNote: string;
  enNote: string;
  action: TaskAction;
  adminOnly?: boolean;
  /** A live number shown on the task (from useSectionStats). */
  stat?: StatKey;
}

/** Live numbers the sections show, read from the records search and the public scorecard. */
export interface SectionStats {
  records?: number;        // working copies, all statuses
  pendingReview?: number;  // sent for review
  returned?: number;       // returned to the cataloguer
  published?: number;      // published works
  entities?: number;       // entities in the authority file
  entitiesLinked?: number; // of those, linked to LC, VIAF or Wikidata
  copies?: number;         // copies (bf:Item) on published editions
  loansOut?: number;       // circulation: copies out now (library staff only)
  overdue?: number;        // of those, overdue
  patrons?: number;        // borrowers of the library
  holdsReady?: number;     // copies on the hold shelf
  openOrders?: number;     // acquisitions: orders not yet received (library staff only)
  unpaidInvoices?: number;
  lateIssues?: number;     // journal issues overdue
  endingSoon?: number;     // subscriptions ending within two months
}
export type StatKey = keyof SectionStats;

let statsCache: { at: number; value: SectionStats } | null = null;

/** Loads the numbers once a minute at most; every section page, the menus and the dashboard share them. */
const statsListeners = new Set<(s: SectionStats) => void>();
let statsLoading = false;

/** One load for every user of the numbers; each number appears as soon as its own call answers. */
function loadSectionStats() {
  if (statsLoading || (statsCache && Date.now() - statsCache.at < 60_000)) return;
  statsLoading = true;
  const value: SectionStats = { ...(statsCache?.value || {}) };
  const publish = () => {
    statsCache = { at: Date.now(), value: { ...value } };
    statsListeners.forEach((fn) => fn(statsCache!.value));
  };
  const work = moonFetch<any>('/records/search?limit=1').then((r) => {
    if (!r.ok) return;
    const st = r.data?.facets?.status || {};
    value.records = r.data?.total;
    value.pendingReview = st['pending-review'] || 0;
    value.returned = st['needs-review'] || 0;
    publish();
  }).catch(() => {});
  const score = moonFetch<any>('/resource/score.json').then((r) => {
    if (!r.ok) return;
    value.published = r.data?.counts?.works;
    value.entities = r.data?.counts?.entities;
    value.copies = r.data?.counts?.items;
    value.entitiesLinked = (r.data?.plan || []).find((p: any) => p.key === 'entitiesLinked')?.value;
    publish();
  }).catch(() => {});
  // Library staff only; anyone else gets 403 and the numbers stay empty.
  const circ = moonFetch<any>('/circulation/summary').then((r) => {
    if (!r.ok) return;
    value.loansOut = r.data?.open;
    value.overdue = r.data?.overdue;
    value.patrons = r.data?.patrons;
    value.holdsReady = r.data?.holdsReady;
    publish();
  }).catch(() => {});
  const acq = moonFetch<any>('/acq/summary').then((r) => {
    if (!r.ok) return;
    value.openOrders = r.data?.openOrders;
    value.unpaidInvoices = r.data?.unpaidInvoices;
    value.lateIssues = r.data?.lateIssues?.length;
    value.endingSoon = r.data?.endingSoon?.length;
    publish();
  }).catch(() => {});
  Promise.all([work, score, circ, acq]).finally(() => { statsLoading = false; });
}

export function useSectionStats(): SectionStats {
  const [stats, setStats] = useState<SectionStats>(statsCache?.value || {});
  useEffect(() => {
    statsListeners.add(setStats);
    loadSectionStats();
    return () => { statsListeners.delete(setStats); };
  }, []);
  return stats;
}

const fmt = (n: number | undefined, isAr: boolean) => (n === undefined ? '' : n.toLocaleString(isAr ? 'ar-EG' : 'en-GB'));

/** One short line of live numbers for a section (on its page and on the dashboard card). */
export function sectionSummary(id: SectionId, st: SectionStats, isAr: boolean): string {
  const n = (v?: number) => fmt(v, isAr);
  switch (id) {
    case 'technical':
      return [
        st.records !== undefined && (isAr ? `${n(st.records)} تسجيلة` : `${n(st.records)} records`),
        st.pendingReview !== undefined && (isAr ? `${n(st.pendingReview)} بانتظار المراجعة` : `${n(st.pendingReview)} waiting for review`),
        st.entities !== undefined && (isAr ? `${n(st.entities)} كيانًا` : `${n(st.entities)} entities`),
      ].filter(Boolean).join(' · ');
    case 'catalogue':
      if (st.published === undefined) return '';
      return isAr ? `${n(st.published)} كتابًا منشورًا للقرّاء` : `${n(st.published)} books published for readers`;
    case 'circulation':
      if (st.loansOut !== undefined) {
        return [
          isAr ? `${n(st.loansOut)} معارة` : `${n(st.loansOut)} out`,
          st.overdue ? (isAr ? `${n(st.overdue)} متأخرة` : `${n(st.overdue)} overdue`) : '',
          st.holdsReady ? (isAr ? `${n(st.holdsReady)} على رف الحجز` : `${n(st.holdsReady)} on the hold shelf`) : '',
          st.copies !== undefined ? (isAr ? `${n(st.copies)} نسخة مسجلة` : `${n(st.copies)} copies recorded`) : '',
        ].filter(Boolean).join(' · ');
      }
      if (st.copies === undefined) return '';
      return isAr ? `${n(st.copies)} نسخة مسجلة` : `${n(st.copies)} copies recorded`;
    case 'acquisitions':
      if (st.openOrders === undefined) return '';
      return [
        isAr ? `${n(st.openOrders)} طلبًا لم يصل` : `${n(st.openOrders)} orders to receive`,
        st.unpaidInvoices ? (isAr ? `${n(st.unpaidInvoices)} فاتورة لم تُدفع` : `${n(st.unpaidInvoices)} unpaid invoices`) : '',
        st.lateIssues ? (isAr ? `${n(st.lateIssues)} أعداد متأخرة` : `${n(st.lateIssues)} late issues`) : '',
        st.endingSoon ? (isAr ? `${n(st.endingSoon)} اشتراكات تنتهي قريبًا` : `${n(st.endingSoon)} subscriptions ending soon`) : '',
      ].filter(Boolean).join(' · ');
  }
}

export interface Section {
  id: SectionId;
  icon: React.ComponentType<{ className?: string }>;
  ar: string;
  en: string;
  arNote: string;
  enNote: string;
  tasks: Task[];
}

/** The site's root ("/" on mooon.site), for links to the public pages next to Studio. */
function siteRoot(): string {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return '/' + (parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '');
}
const page = (file: string) => (typeof window === 'undefined' ? file : `${siteRoot()}${file}`);

export const SECTIONS: Section[] = [
  {
    id: 'acquisitions',
    icon: ShoppingCart,
    ar: 'التزويد والاقتناء',
    en: 'Acquisitions',
    arNote: 'الطلبات والموردون والفواتير والاشتراكات',
    enNote: 'Orders, vendors, invoices and subscriptions',
    tasks: [
      { id: 'overview', icon: BarChart3, ar: 'نظرة عامة', en: 'Overview', arNote: 'الصناديق وما بقي منها، والأعداد المتأخرة، والاشتراكات التي تنتهي', enNote: 'Funds and what is left, late issues, subscriptions ending', action: { kind: 'view', view: 'acq' } },
      { id: 'orders', icon: FileText, ar: 'أوامر الشراء', en: 'Purchase orders', arNote: 'طلب الكتب والمواد على صندوق، ثم تسجيل وصولها وفهرستها', enNote: 'Order books and materials on a fund, then receive and catalogue them', action: { kind: 'view', view: 'acq', tab: 'orders' }, stat: 'openOrders' },
      { id: 'claims', icon: Receipt, ar: 'المطالبة بالطلبات المتأخرة', en: 'Claim late orders', arNote: 'الطلبات التي تأخرت عن موعدها، ورسالة مطالبة لكل مورد', enNote: 'Orders past their expected date, and a claim letter to each vendor', action: { kind: 'view', view: 'acq', tab: 'claims' } },
      { id: 'journals', icon: Newspaper, ar: 'اشتراكات الدوريات وقواعد البيانات', en: 'Journal and database subscriptions', arNote: 'مدد الاشتراك والتكلفة ورابط الدخول', enNote: 'Subscription dates, cost and access link', action: { kind: 'view', view: 'acq', tab: 'subscriptions' }, stat: 'endingSoon' },
      { id: 'checkin', icon: PackageCheck, ar: 'استلام أعداد الدوريات', en: 'Journal issue check-in', arNote: 'تسجيل كل عدد عند وصوله، وقائمة الأعداد المتأخرة', enNote: 'Record each issue as it arrives; a list of late issues', action: { kind: 'view', view: 'acq', tab: 'subscriptions' }, stat: 'lateIssues' },
      { id: 'invoices', icon: Receipt, ar: 'الفواتير', en: 'Invoices', arNote: 'الفواتير مربوطة بأوامر الشراء', enNote: 'Invoices linked to their orders', action: { kind: 'view', view: 'acq', tab: 'invoices' }, stat: 'unpaidInvoices' },
      { id: 'vendors', icon: Building2, ar: 'الموردون والناشرون', en: 'Vendors and publishers', arNote: 'من تشتري منهم المكتبة وبيانات الاتصال بهم', enNote: 'Who the library buys from, and how to reach them', action: { kind: 'view', view: 'acq', tab: 'vendors' } },
      { id: 'funds', icon: Database, ar: 'الصناديق والميزانية', en: 'Funds and budgets', arNote: 'ميزانية كل صندوق في السنة، وما التُزم به وما صُرف', enNote: 'Each fund’s budget for the year; what is committed and spent', action: { kind: 'view', view: 'acq', tab: 'funds' } },
      { id: 'lists', icon: ListFilter, ar: 'القوائم', en: 'Lists', arNote: 'قوائم بالطلبات والفواتير والاشتراكات بشروط، تُحفظ وتُصدَّر CSV', enNote: 'Lists of orders, invoices and subscriptions by conditions; saved and exported as CSV', action: { kind: 'view', view: 'lists', tab: 'orders' } },
    ],
  },
  {
    id: 'technical',
    icon: BookMarked,
    ar: 'العمليات الفنية',
    en: 'Technical services',
    arNote: 'الفهرسة بـ BIBFRAME ومارك، والملف الاستنادي',
    enNote: 'Cataloguing in BIBFRAME and MARC, and authorities',
    tasks: [
      { id: 'new-record', icon: FilePlus, ar: 'تسجيلة جديدة', en: 'New record', arNote: 'اختر نوع الوعاء ثم مطبوع أو إلكتروني', enNote: 'Choose the kind of material, then print or electronic', action: { kind: 'new-record' } },
      { id: 'marc-editor', icon: FileCode, ar: 'محرر مارك 21', en: 'MARC 21 editor', arNote: 'تسجيلة جديدة بحقول مارك', enNote: 'A new record in MARC fields', action: { kind: 'marc-editor' } },
      { id: 'records', icon: Library, ar: 'كل التسجيلات', en: 'All records', arNote: 'تعديل التسجيلات الببليوجرافية ومراجعتها', enNote: 'Edit and review bibliographic records', action: { kind: 'view', view: 'all-records' }, stat: 'records' },
      { id: 'review', icon: ClipboardCheck, ar: 'بانتظار المراجعة', en: 'Waiting for review', arNote: 'التسجيلات المرسلة للمراجعة والمعادة للتعديل، في لوحة التحكم', enNote: 'Records sent for review or returned for changes, on the dashboard', action: { kind: 'view', view: 'dashboard' }, stat: 'pendingReview' },
      { id: 'search', icon: Search, ar: 'البحث في التسجيلات', en: 'Search records', arNote: 'البحث في كل التسجيلات، المنشورة والمسودات', enNote: 'Search all records, published and drafts', action: { kind: 'view', view: 'search' } },
      { id: 'authorities', icon: Users, ar: 'الملف الاستنادي', en: 'Authority file', arNote: 'الأسماء والموضوعات والأماكن، وإنشاء تسجيلات استنادية', enNote: 'Names, subjects and places; new authority records', action: { kind: 'view', view: 'entities' }, stat: 'entities' },
      { id: 'lc-works', icon: Link2, ar: 'ربط الأعمال بمكتبة الكونغرس', en: 'Link works to LC', arNote: 'روابط مقترحة إلى أعمال LC ومجمّعاتها، يقرّها مفهرس', enNote: 'Suggested links to LC Works and Hubs, each accepted by a cataloguer', action: { kind: 'view', view: 'lc-works' } },
      { id: 'quality', icon: ScanSearch, ar: 'فحص الجودة', en: 'Quality checks', arNote: 'روابط مكسورة وتسجيلات وكيانات مكررة على الأرجح، مع السبب', enNote: 'Broken links, likely duplicate records and entities, with the reason', action: { kind: 'view', view: 'quality' } },
      { id: 'library-rules', icon: ShieldCheck, ar: 'قواعد المكتبة عند الحفظ', en: 'Library rules at save', arNote: 'حقول تطلبها المكتبة، وفحص الردمك وLCCN والمكرر', enNote: 'Fields the library requires; ISBN, LCCN and duplicate checks', action: { kind: 'view', view: 'library-rules' } },
      { id: 'authors', icon: UserSearch, ar: 'البحث عن المؤلفين', en: 'Find authors', arNote: 'البحث عن اسم في LC وVIAF وويكي بيانات', enNote: 'Look up a name in LC, VIAF and Wikidata', action: { kind: 'view', view: 'author-finder' } },
      { id: 'activity', icon: History, ar: 'سجل النشاط', en: 'Activity log', arNote: 'من غيّر ماذا ومتى', enNote: 'Who changed what, and when', action: { kind: 'view', view: 'activity-log' } },
      { id: 'lists', icon: ListFilter, ar: 'القوائم', en: 'Lists', arNote: 'قوائم بالكتب والنسخ بشروط، تُحفظ وتُحدَّث وتُصدَّر CSV', enNote: 'Lists of books and copies by conditions; saved, refreshed and exported as CSV', action: { kind: 'view', view: 'lists', tab: 'books' } },
    ],
  },
  {
    id: 'circulation',
    icon: Repeat,
    ar: 'الإعارة',
    en: 'Circulation',
    arNote: 'المستفيدون والإعارة والإرجاع',
    enNote: 'Patrons, loans and returns',
    tasks: [
      { id: 'loans', icon: ArrowLeftRight, ar: 'الإعارة والإرجاع', en: 'Check out and check in', arNote: 'بالباركود: بطاقة المستفيد ثم باركود النسخة', enNote: 'By barcode: the borrower’s card, then the copy’s barcode', action: { kind: 'view', view: 'desk' }, stat: 'loansOut' },
      { id: 'patrons', icon: IdCard, ar: 'المستفيدون', en: 'Borrowers', arNote: 'الاسم ورقم البطاقة والنوع، وما معه وما عليه', enNote: 'Name, card number and kind; what they have out and owe', action: { kind: 'view', view: 'desk', tab: 'patrons' }, stat: 'patrons' },
      { id: 'renewals', icon: CalendarClock, ar: 'الإعارات والتجديد', en: 'Loans and renewals', arNote: 'كل المعار والمتأخر، والتجديد', enNote: 'Everything out and overdue; renewals', action: { kind: 'view', view: 'desk', tab: 'loans' }, stat: 'overdue' },
      { id: 'holds', icon: ClipboardCheck, ar: 'الحجوزات', en: 'Holds', arNote: 'حجز كتاب لمستفيد، ورف الحجز عند إرجاع نسخة', enNote: 'Hold a book for a borrower; the hold shelf when a copy comes back', action: { kind: 'view', view: 'desk', tab: 'holds' }, stat: 'holdsReady' },
      { id: 'fines', icon: Coins, ar: 'قواعد الإعارة والغرامات', en: 'Loan rules and fines', arNote: 'مدة الإعارة وحدودها حسب نوع المستفيد؛ الغرامات اختيارية', enNote: 'Loan periods and limits by kind of borrower; fines are optional', action: { kind: 'view', view: 'desk', tab: 'rules' } },
      { id: 'copies', icon: Library, ar: 'النسخ المسجلة', en: 'Copies on record', arNote: 'النسخ وباركوداتها تُضاف في كل طبعة من المحرر', enNote: 'Copies and their barcodes are added on each edition in the editor', action: { kind: 'view', view: 'all-records' }, stat: 'copies' },
      { id: 'lists', icon: ListFilter, ar: 'القوائم', en: 'Lists', arNote: 'قوائم بالإعارات والمستفيدين والحجوزات بشروط، تُحفظ وتُصدَّر CSV', enNote: 'Lists of loans, borrowers and holds by conditions; saved and exported as CSV', action: { kind: 'view', view: 'lists', tab: 'loans' } },
    ],
  },
  {
    id: 'catalogue',
    icon: Search,
    ar: 'محرك البحث',
    en: 'Search engine',
    arNote: 'الفهرس العام للقرّاء',
    enNote: 'The public catalogue for readers',
    tasks: [
      { id: 'opac', icon: Globe, ar: 'الفهرس العام', en: 'Public catalogue', arNote: 'يفتح في نافذة جديدة', enNote: 'Opens in a new tab', action: { kind: 'link', href: page('opac.html') }, stat: 'published' },
      { id: 'score', icon: Gauge, ar: 'لوحة الجودة', en: 'Scorecard', arNote: 'مدى اكتمال البيانات المنشورة', enNote: 'How complete the published data is', action: { kind: 'link', href: page('score.html') } },
      { id: 'learn', icon: GraduationCap, ar: 'دروس', en: 'Lessons', arNote: 'دروس قصيرة في الفهرسة بـ BIBFRAME', enNote: 'Short lessons in BIBFRAME cataloguing', action: { kind: 'link', href: page('learn.html') } },
      { id: 'stats', icon: BarChart3, ar: 'إحصاءات القرّاء', en: 'Reader statistics', arNote: 'الزوار وما يبحثون عنه (في هذه الصفحة)', enNote: 'Visitors and what they search for (on this page)', action: { kind: 'view', view: 'catalogue' }, adminOnly: true },
    ],
  },
];

export const sectionById = (id: SectionId) => SECTIONS.find((s) => s.id === id)!;

/** Runs a task's action; the caller supplies how to open screens. */
export function runTask(task: Task, open: { view: (view: string, tab?: string) => void; newRecord: () => void; marcEditor?: () => void }) {
  const a = task.action;
  if (a.kind === 'view') open.view(a.view, a.tab);
  else if (a.kind === 'new-record') open.newRecord();
  else if (a.kind === 'marc-editor' && open.marcEditor) open.marcEditor();
  else if (a.kind === 'marc-editor') {
    // The editor opens on its MARC 21 tab once (see WolfMoon's activeTab).
    try { localStorage.setItem('moon-open-tab', 'marc-editor'); } catch { /* private window */ }
    open.newRecord();
  } else if (a.kind === 'link') window.open(a.href, '_blank', 'noopener');
}

const visibleTasks = (s: Section, isSuperAdmin: boolean) => s.tasks.filter((t) => !t.adminOnly || isSuperAdmin);

/** The four section menus in the top bar. */
export function SectionMenus({ isAr, isDark, isSuperAdmin, current, onOpenSection, onRun }: {
  isAr: boolean;
  isDark: boolean;
  isSuperAdmin: boolean;
  current?: SectionId;
  onOpenSection: (id: SectionId) => void;
  onRun: (task: Task) => void;
}) {
  const stats = useSectionStats();
  return (
    <nav aria-label={isAr ? 'أقسام المكتبة' : 'Library sections'} className="hidden md:flex items-center gap-1">
      {SECTIONS.map((s) => {
        const Icon = s.icon;
        const active = current === s.id;
        return (
          <DropdownMenu key={s.id}>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-full text-xs font-bold cursor-pointer transition-colors"
                style={{
                  color: isDark ? '#ffffff' : '#0f172a',
                  background: active ? (isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.08)') : 'transparent',
                }}
                title={isAr ? s.ar : s.en}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">{isAr ? s.ar : s.en}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-72" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
              <DropdownMenuLabel className="flex flex-col">
                <span>{isAr ? s.ar : s.en}</span>
                <span className="text-[11px] font-normal opacity-60">{isAr ? s.arNote : s.enNote}</span>
              </DropdownMenuLabel>
              {visibleTasks(s, isSuperAdmin).map((t) => {
                const TIcon = t.icon;
                const soon = t.action.kind === 'soon';
                return (
                  <DropdownMenuItem key={t.id} onSelect={() => (soon ? onOpenSection(s.id) : onRun(t))} className="cursor-pointer gap-2">
                    <TIcon className="h-4 w-4 opacity-70" />
                    <span className="flex-1">{isAr ? t.ar : t.en}</span>
                    {t.stat && stats[t.stat] !== undefined && <span className="text-[11px] font-bold opacity-70">{fmt(stats[t.stat], isAr)}</span>}
                    {soon && <span className="text-[10px] opacity-60">{isAr ? 'قريبًا' : 'Soon'}</span>}
                    {t.action.kind === 'link' && <ExternalLink className="h-3 w-3 opacity-50" />}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuItem onSelect={() => onOpenSection(s.id)} className="cursor-pointer text-xs opacity-80">
                {isAr ? `صفحة ${s.ar} ←` : `${s.en} page →`}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </nav>
  );
}

/** A section's own page: its tasks as cards, the ones not built yet marked "coming soon". */
export function SectionPage({ section, isAr, isSuperAdmin, onRun, children }: {
  section: Section;
  isAr: boolean;
  isSuperAdmin: boolean;
  onRun: (task: Task) => void;
  /** Extra content under the cards (the catalogue's statistics for the Super Admin). */
  children?: React.ReactNode;
}) {
  const Icon = section.icon;
  const stats = useSectionStats();
  const summary = sectionSummary(section.id, stats, isAr);
  const tasks = visibleTasks(section, isSuperAdmin).filter((t) => !(t.action.kind === 'view' && t.action.view === 'catalogue'));
  const glass: React.CSSProperties = {
    background: 'rgba(255,255,255,0.6)',
    borderRadius: 16,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.9)',
  };
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="mb-6 flex items-center gap-3">
        <span className="p-3" style={glass}><Icon className="h-6 w-6 text-slate-800" /></span>
        <div>
          <h1 className="text-2xl font-black text-slate-900">{isAr ? section.ar : section.en}</h1>
          <p className="text-sm text-slate-600">{isAr ? section.arNote : section.enNote}</p>
          {summary && <p className="text-sm font-bold text-slate-800 mt-1">{summary}</p>}
        </div>
      </header>
      <ul className="moon-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tasks.map((t) => {
          const TIcon = t.icon;
          const soon = t.action.kind === 'soon';
          return (
            <li key={t.id}>
              <motion.button
                whileHover={soon ? undefined : { y: -2 }}
                onClick={() => !soon && onRun(t)}
                disabled={soon}
                aria-disabled={soon}
                className={`w-full h-full text-start p-5 flex flex-col gap-2 ${soon ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
                style={glass}
              >
                <span className="flex items-center gap-2">
                  <TIcon className="h-5 w-5 text-slate-700" />
                  <span className="font-bold text-slate-900">{isAr ? t.ar : t.en}</span>
                  {soon && (
                    <span className="ms-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-900/10 text-slate-700">
                      {isAr ? 'قريبًا' : 'Coming soon'}
                    </span>
                  )}
                  {t.stat && stats[t.stat] !== undefined && (
                    <span className="ms-auto text-sm font-black text-slate-800">{fmt(stats[t.stat], isAr)}</span>
                  )}
                  {t.action.kind === 'link' && <ExternalLink className={`${t.stat ? '' : 'ms-auto '}h-3.5 w-3.5 text-slate-500`} />}
                </span>
                <span className="text-sm text-slate-600">{isAr ? t.arNote : t.enNote}</span>
              </motion.button>
            </li>
          );
        })}
      </ul>
      {children && <div className="mt-8 space-y-6">{children}</div>}
    </main>
  );
}

/** The four sections as cards with their live line: the top of the dashboard. */
export function SectionCards({ isAr, onOpenSection }: { isAr: boolean; onOpenSection: (id: SectionId) => void }) {
  const stats = useSectionStats();
  return (
    <nav aria-label={isAr ? 'أقسام المكتبة' : 'Library sections'} className="moon-stagger grid grid-cols-2 lg:grid-cols-4 gap-4">
      {SECTIONS.map((s) => {
        const Icon = s.icon;
        const line = sectionSummary(s.id, stats, isAr);
        return (
          <motion.button
            key={s.id}
            whileHover={{ y: -2 }}
            onClick={() => onOpenSection(s.id)}
            className="text-start p-4 flex flex-col gap-1.5 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 16, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.9)' }}
          >
            <span className="flex items-center gap-2 font-bold text-slate-900"><Icon className="h-5 w-5 text-slate-700" />{isAr ? s.ar : s.en}</span>
            <span className="text-xs text-slate-600">{line || (isAr ? s.arNote : s.enNote)}</span>
          </motion.button>
        );
      })}
    </nav>
  );
}

/** "Section > task" under the top bar, so every screen shows where it sits; the section name opens its page. */
export function SectionPath({ isAr, sectionId, taskView, onOpenSection }: {
  isAr: boolean;
  sectionId: SectionId;
  /** The screen being shown, matched to a task of the section by its view. */
  taskView?: string;
  onOpenSection: (id: SectionId) => void;
}) {
  const s = sectionById(sectionId);
  const tab = typeof window === 'undefined' ? undefined : new URLSearchParams(window.location.search).get('tab') || undefined;
  const isView = (t: Task) => t.action.kind === 'view' && t.action.view === taskView;
  const task = taskView ? (s.tasks.find((t) => isView(t) && t.action.kind === 'view' && t.action.tab === tab) || s.tasks.find(isView)) : undefined;
  if (!task) return null;
  return (
    <div className="max-w-7xl mx-auto px-6 mt-3 text-xs font-bold text-slate-600 flex items-center gap-1.5" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
      <button className="hover:underline cursor-pointer" onClick={() => onOpenSection(s.id)}>{isAr ? s.ar : s.en}</button>
      <span aria-hidden="true">{isAr ? '‹' : '›'}</span>
      <span className="text-slate-900">{isAr ? task.ar : task.en}</span>
    </div>
  );
}
