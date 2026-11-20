/**
 * Acquisitions (/acq/): what the library buys and how it pays for it. Overview (funds, late journal issues,
 * subscriptions ending, unpaid invoices), purchase orders, vendors, funds, invoices, and subscriptions to journals
 * and databases with issue check-in. The server is acquisitionsRoutes.tsx; each library sees only its own entries.
 * A received order is catalogued from here: "Catalogue it" opens a new record, and the order keeps its record number.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  LayoutDashboard, FileText, Building2, Wallet, Receipt, Newspaper, Plus, X, ShieldAlert, PackageCheck, Ban,
  BookOpen, FilePlus, ExternalLink, CheckCircle2, AlertTriangle, CalendarClock, Trash2,
} from 'lucide-react';
import { moonFetch } from '../utils/moonApi';
import { useAuth } from '../contexts/AuthContext';
import { glass, input, btn, dark, light, Field } from './CirculationDesk';

export type AcqTab = 'overview' | 'orders' | 'vendors' | 'funds' | 'invoices' | 'subscriptions';
export const ACQ_TABS: AcqTab[] = ['overview', 'orders', 'vendors', 'funds', 'invoices', 'subscriptions'];
type Kind = Exclude<AcqTab, 'overview'>;

type FieldType = 'text' | 'longtext' | 'number' | 'int' | 'date' | 'url' | 'email' | 'currency' | 'choice' | 'vendor' | 'fund' | 'bool' | 'ids';
interface F { key: string; ar: string; en: string; type: FieldType; required?: boolean; choices?: Array<{ v: string; ar: string; en: string }>; wide?: boolean }

const MATERIALS = [
  { v: 'book', ar: 'كتاب', en: 'Book' }, { v: 'journal', ar: 'دورية', en: 'Journal' }, { v: 'manuscript', ar: 'مخطوط', en: 'Manuscript' },
  { v: 'map', ar: 'خريطة', en: 'Map' }, { v: 'music', ar: 'موسيقى', en: 'Music' }, { v: 'audiovisual', ar: 'مواد سمعية بصرية', en: 'Audiovisual' },
  { v: 'electronic', ar: 'مصدر إلكتروني', en: 'Electronic' }, { v: 'other', ar: 'أخرى', en: 'Other' },
];

const FIELDS: Record<Kind, F[]> = {
  orders: [
    { key: 'title', ar: 'العنوان', en: 'Title', type: 'text', required: true, wide: true },
    { key: 'author', ar: 'المؤلف', en: 'Author', type: 'text' },
    { key: 'isbn', ar: 'ISBN / ISSN', en: 'ISBN / ISSN', type: 'text' },
    { key: 'material', ar: 'نوع المادة', en: 'Material', type: 'choice', choices: MATERIALS },
    { key: 'vendor_id', ar: 'المورد', en: 'Vendor', type: 'vendor' },
    { key: 'fund_id', ar: 'الصندوق', en: 'Fund', type: 'fund' },
    { key: 'quantity', ar: 'عدد النسخ', en: 'Copies', type: 'int', required: true },
    { key: 'unit_price', ar: 'سعر النسخة', en: 'Price per copy', type: 'number' },
    { key: 'currency', ar: 'العملة', en: 'Currency', type: 'currency' },
    { key: 'note', ar: 'ملاحظة', en: 'Note', type: 'longtext', wide: true },
  ],
  vendors: [
    { key: 'name', ar: 'الاسم', en: 'Name', type: 'text', required: true },
    { key: 'contact', ar: 'الشخص المسؤول', en: 'Contact person', type: 'text' },
    { key: 'email', ar: 'البريد', en: 'Email', type: 'email' },
    { key: 'phone', ar: 'الهاتف', en: 'Phone', type: 'text' },
    { key: 'website', ar: 'الموقع', en: 'Website', type: 'url' },
    { key: 'country', ar: 'البلد', en: 'Country', type: 'text' },
    { key: 'note', ar: 'ملاحظة', en: 'Note', type: 'longtext', wide: true },
    { key: 'active', ar: 'نتعامل معه حاليًا', en: 'Currently used', type: 'bool' },
  ],
  funds: [
    { key: 'code', ar: 'الرمز', en: 'Code', type: 'text', required: true },
    { key: 'name', ar: 'الاسم', en: 'Name', type: 'text', required: true },
    { key: 'year', ar: 'السنة', en: 'Year', type: 'int', required: true },
    { key: 'budget', ar: 'الميزانية', en: 'Budget', type: 'number', required: true },
    { key: 'currency', ar: 'العملة', en: 'Currency', type: 'currency' },
    { key: 'note', ar: 'ملاحظة', en: 'Note', type: 'longtext', wide: true },
  ],
  invoices: [
    { key: 'number', ar: 'رقم الفاتورة', en: 'Invoice number', type: 'text', required: true },
    { key: 'vendor_id', ar: 'المورد', en: 'Vendor', type: 'vendor', required: true },
    { key: 'invoice_date', ar: 'التاريخ', en: 'Date', type: 'date', required: true },
    { key: 'amount', ar: 'المبلغ', en: 'Amount', type: 'number', required: true },
    { key: 'currency', ar: 'العملة', en: 'Currency', type: 'currency' },
    { key: 'order_ids', ar: 'أوامر الشراء', en: 'Purchase orders', type: 'ids', wide: true },
    { key: 'note', ar: 'ملاحظة', en: 'Note', type: 'longtext', wide: true },
  ],
  subscriptions: [
    { key: 'kind', ar: 'النوع', en: 'Kind', type: 'choice', required: true, choices: [{ v: 'journal', ar: 'دورية', en: 'Journal' }, { v: 'database', ar: 'قاعدة بيانات', en: 'Database' }] },
    { key: 'title', ar: 'العنوان', en: 'Title', type: 'text', required: true, wide: true },
    { key: 'issn', ar: 'ISSN', en: 'ISSN', type: 'text' },
    { key: 'vendor_id', ar: 'المورد', en: 'Vendor', type: 'vendor' },
    { key: 'fund_id', ar: 'الصندوق', en: 'Fund', type: 'fund' },
    { key: 'issues_per_year', ar: 'أعداد في السنة (للدوريات)', en: 'Issues a year (journals)', type: 'int' },
    { key: 'start_date', ar: 'يبدأ', en: 'Starts', type: 'date', required: true },
    { key: 'end_date', ar: 'ينتهي', en: 'Ends', type: 'date', required: true },
    { key: 'cost', ar: 'التكلفة', en: 'Cost', type: 'number' },
    { key: 'currency', ar: 'العملة', en: 'Currency', type: 'currency' },
    { key: 'access_url', ar: 'رابط الدخول', en: 'Access link', type: 'url', wide: true },
    { key: 'record_id', ar: 'رقم التسجيلة في Moon', en: 'Moon record number', type: 'text' },
    { key: 'note', ar: 'ملاحظة', en: 'Note', type: 'longtext', wide: true },
    { key: 'active', ar: 'الاشتراك قائم', en: 'Active', type: 'bool' },
  ],
};

// The server answers in English; the usual messages in Arabic too.
const AR_ERRORS: Array<[RegExp, string]> = [
  [/^Library staff only/, 'لموظفي المكتبة فقط (المفهرسون والمراجعون والمشرف العام)'],
  [/is needed$/, 'حقل مطلوب ناقص'],
  [/^There is already an entry/, 'يوجد إدخال بهذا الرقم أو الرمز'],
  [/^Other entries still use this one/, 'إدخالات أخرى تستخدمه؛ اجعله غير نشط بدلًا من حذفه'],
  [/^A reviewer or the Super Admin/, 'هذا للمراجع أو المشرف العام'],
  [/^end date: after the start date/, 'تاريخ الانتهاء بعد تاريخ البدء'],
  [/^The vendor is not one/, 'المورد ليس من موردي هذه المكتبة'],
  [/^The fund is not one/, 'الصندوق ليس من صناديق هذه المكتبة'],
];
const say = (isAr: boolean, msg: string) => {
  if (!isAr) return msg;
  for (const [re, ar] of AR_ERRORS) if (re.test(msg)) return ar;
  return msg;
};

const money = (n: unknown, cur: string | null | undefined, isAr: boolean) =>
  n === null || n === undefined || n === '' ? '' : `${Number(n).toLocaleString(isAr ? 'ar-EG' : 'en-GB', { maximumFractionDigits: 2 })}${cur ? ` ${cur}` : ''}`;
const num = (n: unknown, isAr: boolean) => Number(n || 0).toLocaleString(isAr ? 'ar-EG' : 'en-GB');
const dateText = (iso: string | null | undefined, isAr: boolean) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** The library's vendors and funds, for the choices on orders, invoices and subscriptions. */
function useRefs() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [funds, setFunds] = useState<any[]>([]);
  const load = useCallback(() => {
    moonFetch('/acq/vendors').then((r) => r.ok && setVendors(r.data.items)).catch(() => {});
    moonFetch('/acq/funds').then((r) => r.ok && setFunds(r.data.items)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  return { vendors, funds, reload: load };
}

function tabFromUrl(): AcqTab {
  const t = new URLSearchParams(window.location.search).get('tab') as AcqTab | null;
  return t && ACQ_TABS.includes(t) ? t : 'overview';
}

export function AcquisitionsDesk({ isAr, onOpenRecord, onNewRecord }: { isAr: boolean; onOpenRecord?: (id: string) => void; onNewRecord?: () => void }) {
  const { user } = useAuth();
  const [tab, setTabState] = useState<AcqTab>(tabFromUrl);
  const [summary, setSummary] = useState<any>(null);
  const [denied, setDenied] = useState(false);
  const refs = useRefs();
  const setTab = (t: AcqTab) => {
    setTabState(t);
    const u = new URL(window.location.href);
    if (t === 'overview') u.searchParams.delete('tab'); else u.searchParams.set('tab', t);
    window.history.replaceState(null, '', u.pathname + u.search);
  };
  const loadSummary = useCallback(() => {
    moonFetch('/acq/summary').then((r) => { if (r.status === 403) setDenied(true); else if (r.ok) setSummary(r.data); }).catch(() => {});
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => {
    const onPop = () => setTabState(tabFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const changed = () => { loadSummary(); refs.reload(); };

  const TABS: Array<{ id: AcqTab; icon: any; ar: string; en: string }> = [
    { id: 'overview', icon: LayoutDashboard, ar: 'نظرة عامة', en: 'Overview' },
    { id: 'orders', icon: FileText, ar: 'أوامر الشراء', en: 'Orders' },
    { id: 'subscriptions', icon: Newspaper, ar: 'الاشتراكات', en: 'Subscriptions' },
    { id: 'invoices', icon: Receipt, ar: 'الفواتير', en: 'Invoices' },
    { id: 'vendors', icon: Building2, ar: 'الموردون', en: 'Vendors' },
    { id: 'funds', icon: Wallet, ar: 'الصناديق والميزانية', en: 'Funds' },
  ];

  if (denied || user?.role === 'tester') {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="p-6 flex gap-3" style={glass}>
          <ShieldAlert className="h-6 w-6 text-slate-700 shrink-0" />
          <div>
            <h1 className="font-black text-slate-900">{isAr ? 'التزويد لموظفي المكتبة' : 'Acquisitions is for library staff'}</h1>
            <p className="text-sm text-slate-600 mt-1">{isAr ? 'يستخدمه المفهرسون والمراجعون والمشرف العام. اطلب من المشرف العام تغيير دورك.' : 'Cataloguers, reviewers and the Super Admin use it. Ask the Super Admin to change your role.'}</p>
          </div>
        </div>
      </main>
    );
  }

  const canBudget = user?.role !== 'cataloger';
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{isAr ? 'التزويد والاقتناء' : 'Acquisitions'}</h1>
          <p className="text-sm text-slate-600">
            {summary?.library && <span className="font-bold">{summary.library} · </span>}
            {summary ? (isAr
              ? `${num(summary.openOrders, true)} طلبًا لم يصل · ${num(summary.unpaidInvoices, true)} فاتورة لم تُدفع · ${num(summary.lateIssues.length, true)} أعداد متأخرة`
              : `${summary.openOrders} orders not yet received · ${summary.unpaidInvoices} unpaid invoices · ${summary.lateIssues.length} late issues`) : '…'}
          </p>
        </div>
        <nav className="flex flex-wrap gap-1 p-1" style={glass} aria-label={isAr ? 'أجزاء التزويد' : 'Acquisitions parts'}>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
                className={`${btn} px-3 py-1.5 text-xs ${tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-800 hover:bg-white/70'}`}>
                <Icon className="h-3.5 w-3.5" /> {isAr ? t.ar : t.en}
              </button>
            );
          })}
        </nav>
      </header>
      {tab === 'overview' && <Overview isAr={isAr} summary={summary} onTab={setTab} />}
      {tab !== 'overview' && (
        <Entries key={tab} kind={tab} isAr={isAr} refs={refs} onChange={changed} canEdit={tab !== 'funds' || canBudget} canBudget={canBudget}
          onOpenRecord={onOpenRecord} onNewRecord={onNewRecord} />
      )}
    </main>
  );
}

// ─── Overview ────────────────────────────────────────────────

function Overview({ isAr, summary, onTab }: { isAr: boolean; summary: any; onTab: (t: AcqTab) => void }) {
  if (!summary) return <section className="p-5" style={glass}><p className="text-sm text-slate-500">…</p></section>;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <section className="p-5 space-y-3" style={glass}>
        <h2 className="font-black text-slate-900 flex items-center gap-2"><Wallet className="h-4 w-4" /> {isAr ? `صناديق ${new Date().getFullYear()}` : `Funds for ${new Date().getFullYear()}`}</h2>
        {summary.funds.length === 0 ? (
          <p className="text-sm text-slate-500">{isAr ? 'لا صناديق لهذه السنة. أضف صندوقًا بميزانية، ثم اربط به الطلبات والاشتراكات.' : 'No funds for this year. Add a fund with a budget, then charge orders and subscriptions to it.'}{' '}
            <button className="underline" onClick={() => onTab('funds')}>{isAr ? 'الصناديق' : 'Funds'}</button></p>
        ) : summary.funds.map((f: any) => (
          <div key={f.id}>
            <div className="flex justify-between text-sm gap-2">
              <b className="text-slate-900" dir="auto">{f.code} · {f.name}</b>
              <span className={f.remaining < 0 ? 'text-red-700 font-bold' : 'text-slate-700'}>{isAr ? 'المتبقي ' : 'Left '}{money(f.remaining, f.currency, isAr)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden mt-1" role="img" aria-label={`${Math.round(f.usedShare * 100)}%`}>
              <div className={`h-full ${f.usedShare > 1 ? 'bg-red-600' : 'bg-slate-800'}`} style={{ width: `${Math.min(100, f.usedShare * 100)}%` }} />
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              {isAr ? `الميزانية ${money(f.budget, f.currency, isAr)} · مُلتزم به ${money(f.committed, '', isAr)} · مصروف ${money(f.spent, '', isAr)}` : `Budget ${money(f.budget, f.currency, isAr)} · committed ${money(f.committed, '', isAr)} · spent ${money(f.spent, '', isAr)}`}
            </div>
          </div>
        ))}
      </section>
      <section className="p-5 space-y-4" style={glass}>
        <div>
          <h2 className="font-black text-slate-900 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {isAr ? 'أعداد دوريات متأخرة' : 'Late journal issues'}</h2>
          {summary.lateIssues.length === 0 ? <p className="text-sm text-slate-500">{isAr ? 'لا شيء متأخر.' : 'Nothing late.'}</p> : (
            <ul className="text-sm mt-1 space-y-1">{summary.lateIssues.map((l: any) => (
              <li key={l.id} className="flex justify-between gap-2"><span dir="auto">{l.title}</span><span className="text-red-700 text-xs font-bold">{isAr ? `متأخر ${num(l.daysLate, true)} يومًا` : `${l.daysLate} days late`}</span></li>
            ))}</ul>
          )}
        </div>
        <div>
          <h2 className="font-black text-slate-900 flex items-center gap-2"><CalendarClock className="h-4 w-4" /> {isAr ? 'اشتراكات تنتهي خلال شهرين' : 'Subscriptions ending within two months'}</h2>
          {summary.endingSoon.length === 0 ? <p className="text-sm text-slate-500">{isAr ? 'لا شيء.' : 'None.'}</p> : (
            <ul className="text-sm mt-1 space-y-1">{summary.endingSoon.map((s: any) => (
              <li key={s.id} className="flex justify-between gap-2"><span dir="auto">{s.title}</span><span className="text-xs text-slate-700">{dateText(s.end_date, isAr)}</span></li>
            ))}</ul>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={light} onClick={() => onTab('orders')}><FileText className="h-4 w-4" /> {isAr ? `${num(summary.openOrders, true)} طلبًا لم يصل` : `${summary.openOrders} orders to receive`}</button>
          <button className={light} onClick={() => onTab('invoices')}><Receipt className="h-4 w-4" /> {isAr ? `${num(summary.unpaidInvoices, true)} فاتورة لم تُدفع` : `${summary.unpaidInvoices} unpaid invoices`}</button>
        </div>
      </section>
    </div>
  );
}

// ─── Any kind of entry: list, form, actions ──────────────────

function blank(kind: Kind): Record<string, any> {
  const row: Record<string, any> = {};
  for (const f of FIELDS[kind]) row[f.key] = f.type === 'bool' ? true : '';
  if (kind === 'orders') row.quantity = 1;
  if (kind === 'funds') row.year = new Date().getFullYear();
  if (kind === 'invoices') row.invoice_date = new Date().toISOString().slice(0, 10);
  if (kind === 'subscriptions') { row.kind = 'journal'; row.start_date = `${new Date().getFullYear()}-01-01`; row.end_date = `${new Date().getFullYear()}-12-31`; }
  return row;
}

const NEW_LABEL: Record<Kind, [string, string]> = {
  orders: ['طلب شراء جديد', 'New order'], vendors: ['مورد جديد', 'New vendor'], funds: ['صندوق جديد', 'New fund'],
  invoices: ['فاتورة جديدة', 'New invoice'], subscriptions: ['اشتراك جديد', 'New subscription'],
};
const EMPTY: Record<Kind, [string, string]> = {
  orders: ['لا طلبات شراء بعد.', 'No orders yet.'], vendors: ['لا موردين بعد. أضف من تشتري منهم المكتبة.', 'No vendors yet. Add who the library buys from.'],
  funds: ['لا صناديق بعد.', 'No funds yet.'], invoices: ['لا فواتير بعد.', 'No invoices yet.'],
  subscriptions: ['لا اشتراكات بعد.', 'No subscriptions yet.'],
};

function Entries({ kind, isAr, refs, onChange, canEdit, canBudget, onOpenRecord, onNewRecord }: {
  kind: Kind; isAr: boolean; refs: ReturnType<typeof useRefs>; onChange: () => void; canEdit: boolean; canBudget: boolean;
  onOpenRecord?: (id: string) => void; onNewRecord?: () => void;
}) {
  const [items, setItems] = useState<any[] | null>(null);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [status, setStatus] = useState<'ordered' | 'received' | 'cancelled' | ''>(kind === 'orders' ? 'ordered' : '');
  const [open, setOpen] = useState<number | string | null>(null);
  const load = useCallback(async () => {
    const r = await moonFetch(`/acq/${kind}${kind === 'orders' && status ? `?status=${status}` : ''}`).catch(() => null);
    setItems(r?.ok ? r.data.items : []);
  }, [kind, status]);
  useEffect(() => { setItems(null); load(); }, [load]);
  const vendorName = useMemo(() => new Map(refs.vendors.map((v) => [v.id, v.name])), [refs.vendors]);
  const fundName = useMemo(() => new Map(refs.funds.map((f) => [f.id, `${f.code} (${f.year})`])), [refs.funds]);

  const save = async () => {
    if (!form) return;
    const r = await moonFetch(form.id ? `/acq/${kind}/${form.id}` : `/acq/${kind}`, { method: form.id ? 'PUT' : 'POST', body: form });
    if (!r.ok) { toast.error(say(isAr, r.data?.error || `Error ${r.status}`)); return; }
    toast.success(kind === 'orders' && !form.id ? (isAr ? `أُنشئ الطلب ${r.data.item.number}` : `Order ${r.data.item.number} made`) : (isAr ? 'حُفظ' : 'Saved'));
    setForm(null); load(); onChange();
  };
  const remove = async () => {
    if (!form?.id || !window.confirm(isAr ? 'حذف هذا الإدخال؟ لا يمكن التراجع.' : 'Remove this entry? This cannot be undone.')) return;
    const r = await moonFetch(`/acq/${kind}/${form.id}`, { method: 'DELETE' });
    if (!r.ok) { toast.error(say(isAr, r.data?.error || '')); return; }
    setForm(null); load(); onChange();
  };
  const act = async (path: string, body: any = {}, done?: string) => {
    const r = await moonFetch(path, { method: 'POST', body });
    if (!r.ok) { toast.error(say(isAr, r.data?.error || `Error ${r.status}`)); return false; }
    if (done) toast.success(done);
    load(); onChange();
    return true;
  };

  const line = (it: any): { title: string; sub: string; badge?: { text: string; tone: 'ok' | 'warn' | 'muted' } } => {
    switch (kind) {
      case 'orders': return {
        title: it.title,
        sub: [it.number, it.author, vendorName.get(it.vendor_id), fundName.get(it.fund_id), (isAr ? `${num(it.quantity, true)} نسخة × ${money(it.unit_price, it.currency, isAr)}` : `${it.quantity} × ${money(it.unit_price, it.currency, isAr)}`), dateText(it.ordered_at, isAr)].filter(Boolean).join(' · '),
        badge: it.status === 'received' ? { text: isAr ? 'وصل' : 'Received', tone: 'ok' } : it.status === 'cancelled' ? { text: isAr ? 'أُلغي' : 'Cancelled', tone: 'muted' } : { text: isAr ? 'مطلوب' : 'Ordered', tone: 'warn' },
      };
      case 'vendors': return { title: it.name, sub: [it.contact, it.email, it.phone, it.country].filter(Boolean).join(' · '), badge: it.active ? undefined : { text: isAr ? 'غير نشط' : 'Inactive', tone: 'muted' } };
      case 'funds': return { title: `${it.code} · ${it.name}`, sub: `${it.year} · ${isAr ? 'الميزانية' : 'Budget'} ${money(it.budget, it.currency, isAr)}` };
      case 'invoices': return {
        title: `${it.number} · ${vendorName.get(it.vendor_id) || ''}`,
        sub: [dateText(it.invoice_date, isAr), money(it.amount, it.currency, isAr), it.order_ids?.length ? (isAr ? `${it.order_ids.length} طلبات` : `${it.order_ids.length} orders`) : ''].filter(Boolean).join(' · '),
        badge: it.status === 'paid' ? { text: isAr ? 'دُفعت' : 'Paid', tone: 'ok' } : { text: isAr ? 'لم تُدفع' : 'Unpaid', tone: 'warn' },
      };
      case 'subscriptions': return {
        title: it.title,
        sub: [it.kind === 'journal' ? (isAr ? 'دورية' : 'Journal') : (isAr ? 'قاعدة بيانات' : 'Database'), it.issn, vendorName.get(it.vendor_id),
          `${dateText(it.start_date, isAr)} – ${dateText(it.end_date, isAr)}`, money(it.cost, it.currency, isAr)].filter(Boolean).join(' · '),
        badge: !it.active ? { text: isAr ? 'متوقف' : 'Stopped', tone: 'muted' } : undefined,
      };
    }
  };

  const tone = { ok: 'bg-emerald-100 text-emerald-800', warn: 'bg-amber-100 text-amber-900', muted: 'bg-slate-200 text-slate-700' };
  return (
    <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
      <section className="p-5 space-y-3" style={glass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {kind === 'orders' ? (
            <div className="flex flex-wrap gap-1">
              {([['ordered', 'لم يصل', 'Not yet received'], ['received', 'وصل', 'Received'], ['cancelled', 'أُلغي', 'Cancelled'], ['', 'الكل', 'All']] as const).map(([v, ar, en]) => (
                <button key={v} onClick={() => setStatus(v)} className={`${btn} px-3 py-1.5 text-xs ${status === v ? 'bg-slate-900 text-white' : 'bg-white/70 text-slate-800'}`}>{isAr ? ar : en}</button>
              ))}
            </div>
          ) : <span />}
          {canEdit && <button className={dark} onClick={() => setForm(blank(kind))}><Plus className="h-4 w-4" /> {isAr ? NEW_LABEL[kind][0] : NEW_LABEL[kind][1]}</button>}
        </div>
        {kind === 'funds' && !canBudget && <p className="text-xs text-slate-500">{isAr ? 'المراجع أو المشرف العام يضيف الصناديق ويضبط الميزانيات.' : 'A reviewer or the Super Admin adds funds and sets budgets.'}</p>}
        {items === null ? <p className="text-sm text-slate-500">…</p> : items.length === 0 ? <p className="text-sm text-slate-500">{isAr ? EMPTY[kind][0] : EMPTY[kind][1]}</p> : (
          <ul className="divide-y divide-slate-200">
            {items.map((it) => {
              const l = line(it);
              const expanded = open === it.id;
              return (
                <li key={it.id} className="py-2">
                  <div className="flex items-start gap-2">
                    <button className="flex-1 min-w-0 text-start" onClick={() => setOpen(expanded ? null : it.id)} aria-expanded={expanded}>
                      <span className="font-bold text-slate-900 text-sm block truncate" dir="auto">{l.title}</span>
                      <span className="text-xs text-slate-600 block" dir="auto">{l.sub}</span>
                    </button>
                    {l.badge && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${tone[l.badge.tone]}`}>{l.badge.text}</span>}
                  </div>
                  {expanded && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {canEdit && <button className={`${light} py-1 px-3 text-xs`} onClick={() => setForm({ ...it, order_ids: Array.isArray(it.order_ids) ? it.order_ids.join(', ') : it.order_ids })}>{isAr ? 'تعديل' : 'Edit'}</button>}
                      {kind === 'orders' && it.status === 'ordered' && <>
                        <button className={`${dark} py-1 px-3 text-xs`} onClick={() => act(`/acq/orders/${it.id}/receive`, {}, isAr ? 'سُجّل الوصول' : 'Marked received')}><PackageCheck className="h-3.5 w-3.5" /> {isAr ? 'وصل' : 'Received'}</button>
                        <button className={`${light} py-1 px-3 text-xs`} onClick={() => window.confirm(isAr ? 'إلغاء الطلب؟' : 'Cancel this order?') && act(`/acq/orders/${it.id}/cancel`)}><Ban className="h-3.5 w-3.5" /> {isAr ? 'إلغاء الطلب' : 'Cancel order'}</button>
                      </>}
                      {kind === 'orders' && it.status === 'received' && (it.record_id ? (
                        <button className={`${light} py-1 px-3 text-xs`} onClick={() => onOpenRecord?.(it.record_id)}><BookOpen className="h-3.5 w-3.5" /> {isAr ? `التسجيلة ${it.record_id}` : `Record ${it.record_id}`}</button>
                      ) : <LinkRecord isAr={isAr} onNewRecord={onNewRecord} onLink={(id) => act(`/acq/orders/${it.id}/receive`, { recordId: id }, isAr ? 'رُبطت التسجيلة' : 'Record linked')} />)}
                      {kind === 'invoices' && it.status === 'unpaid' && canBudget && (
                        <button className={`${dark} py-1 px-3 text-xs`} onClick={() => act(`/acq/invoices/${it.id}/pay`, {}, isAr ? 'سُجّل الدفع' : 'Marked paid')}><CheckCircle2 className="h-3.5 w-3.5" /> {isAr ? 'دُفعت' : 'Mark paid'}</button>
                      )}
                      {kind === 'subscriptions' && it.access_url && <a className={`${light} py-1 px-3 text-xs`} href={it.access_url} target="_blank" rel="noopener noreferrer">{isAr ? 'رابط الدخول' : 'Access link'} <ExternalLink className="h-3 w-3" /></a>}
                      {kind === 'subscriptions' && it.record_id && <button className={`${light} py-1 px-3 text-xs`} onClick={() => onOpenRecord?.(it.record_id)}><BookOpen className="h-3.5 w-3.5" /> {isAr ? 'التسجيلة' : 'Record'}</button>}
                      {kind === 'vendors' && it.website && <a className={`${light} py-1 px-3 text-xs`} href={it.website} target="_blank" rel="noopener noreferrer">{isAr ? 'الموقع' : 'Website'} <ExternalLink className="h-3 w-3" /></a>}
                      {it.note && <p className="w-full text-xs text-slate-700 whitespace-pre-line" dir="auto">{it.note}</p>}
                      {kind === 'subscriptions' && it.kind === 'journal' && <IssueCheckIn isAr={isAr} subscriptionId={it.id} onChange={onChange} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="p-5" style={glass}>
        {form ? (
          <form className="grid sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div className="sm:col-span-2 flex items-center justify-between">
              <h2 className="font-black text-slate-900">{form.id ? (kind === 'orders' ? form.number : (isAr ? 'تعديل' : 'Edit')) : (isAr ? NEW_LABEL[kind][0] : NEW_LABEL[kind][1])}</h2>
              <button type="button" className="p-1 rounded-full hover:bg-slate-200" onClick={() => setForm(null)} aria-label={isAr ? 'إغلاق' : 'Close'}><X className="h-4 w-4" /></button>
            </div>
            {FIELDS[kind].map((f) => (
              <div key={f.key} className={f.wide || f.type === 'bool' ? 'sm:col-span-2' : ''}>
                <FieldInput f={f} isAr={isAr} value={form[f.key]} onChange={(v) => setForm({ ...form, [f.key]: v })} vendors={refs.vendors} funds={refs.funds} />
              </div>
            ))}
            {kind === 'orders' && form.quantity && form.unit_price ? (
              <p className="sm:col-span-2 text-sm font-bold text-slate-800">{isAr ? 'المجموع ' : 'Total '}{money(Number(form.quantity) * Number(form.unit_price), form.currency, isAr)}</p>
            ) : null}
            <div className="sm:col-span-2 flex gap-2">
              <button className={dark}>{isAr ? 'حفظ' : 'Save'}</button>
              <button type="button" className={light} onClick={() => setForm(null)}>{isAr ? 'إلغاء' : 'Cancel'}</button>
              {form.id && (kind !== 'invoices' || canBudget) && <button type="button" className={`${light} ms-auto`} onClick={remove} aria-label={isAr ? 'حذف' : 'Remove'}><Trash2 className="h-4 w-4" /></button>}
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-500">
            {kind === 'orders' && (isAr ? 'اختر طلبًا لتسجيل وصوله أو إلغائه. عند الوصول: «فهرسه» يفتح تسجيلة جديدة، ثم اربط رقمها بالطلب.' : 'Choose an order to mark it received or cancel it. Once it arrives, “Catalogue it” opens a new record; then link its number to the order.')}
            {kind === 'subscriptions' && (isAr ? 'اختر دورية لتسجيل وصول عدد. الدورية متأخرة إذا لم يصل عدد في موعده المعتاد وأسبوعين بعده.' : 'Choose a journal to check in an issue. A journal is late when no issue has come within its usual gap plus two weeks.')}
            {kind === 'invoices' && (isAr ? 'اربط الفاتورة بأرقام أوامر الشراء التي تدفعها.' : 'Link each invoice to the purchase orders it pays for.')}
            {kind === 'vendors' && (isAr ? 'المورد الذي له طلبات لا يُحذف؛ اجعله غير نشط.' : 'A vendor with orders is kept; make it inactive instead.')}
            {kind === 'funds' && (isAr ? 'الطلبات تُحسب «ملتزمًا بها» حتى تصل، ثم «مصروفة». الاشتراكات تُحسب مصروفة.' : 'Orders count as committed until they arrive, then as spent. Subscriptions count as spent.')}
          </p>
        )}
      </section>
    </div>
  );
}

function FieldInput({ f, isAr, value, onChange, vendors, funds }: {
  f: F; isAr: boolean; value: any; onChange: (v: any) => void; vendors: any[]; funds: any[];
}) {
  const label = `${isAr ? f.ar : f.en}${f.required ? ' *' : ''}`;
  const v = value ?? '';
  switch (f.type) {
    case 'bool':
      return <label className="inline-flex items-center gap-2 text-sm text-slate-800"><input type="checkbox" checked={value !== false} onChange={(e) => onChange(e.target.checked)} /> {isAr ? f.ar : f.en}</label>;
    case 'longtext':
      return <Field label={label}><textarea className={input} rows={2} dir="auto" value={v} onChange={(e) => onChange(e.target.value)} /></Field>;
    case 'choice':
      return <Field label={label}><select className={input} value={v} required={f.required} onChange={(e) => onChange(e.target.value)}>
        {!f.required && <option value="">—</option>}
        {f.choices!.map((c) => <option key={c.v} value={c.v}>{isAr ? c.ar : c.en}</option>)}
      </select></Field>;
    case 'vendor':
      return <Field label={label}><select className={input} value={v} required={f.required} onChange={(e) => onChange(e.target.value)}>
        <option value="">{vendors.length ? '—' : (isAr ? 'أضف موردًا أولًا' : 'Add a vendor first')}</option>
        {vendors.filter((x) => x.active !== false || x.id === v).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select></Field>;
    case 'fund':
      return <Field label={label}><select className={input} value={v} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {funds.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name} ({x.year})</option>)}
      </select></Field>;
    default: {
      const type = f.type === 'number' || f.type === 'int' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : 'text';
      const ltr = ['number', 'int', 'date', 'email', 'url', 'currency', 'ids'].includes(f.type) || f.key === 'isbn' || f.key === 'issn' || f.key === 'record_id';
      return <Field label={label}><input className={input} type={type} step={f.type === 'number' ? '0.01' : undefined} required={f.required} dir={ltr ? 'ltr' : 'auto'}
        maxLength={f.type === 'currency' ? 3 : undefined} placeholder={f.type === 'currency' ? 'IQD' : f.type === 'ids' ? (isAr ? 'أرقام الطلبات: 12, 13' : 'Order ids: 12, 13') : f.type === 'url' ? 'https://' : undefined}
        value={v} onChange={(e) => onChange(f.type === 'currency' ? e.target.value.toUpperCase() : e.target.value)} /></Field>;
    }
  }
}

/** A received order not yet catalogued: open a new record, or link one that exists. */
function LinkRecord({ isAr, onNewRecord, onLink }: { isAr: boolean; onNewRecord?: () => void; onLink: (id: string) => void }) {
  const [id, setId] = useState('');
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {onNewRecord && <button className={`${dark} py-1 px-3 text-xs`} onClick={onNewRecord}><FilePlus className="h-3.5 w-3.5" /> {isAr ? 'فهرسه' : 'Catalogue it'}</button>}
      <input className={`${input} w-36 py-1 text-xs`} dir="ltr" value={id} onChange={(e) => setId(e.target.value)} placeholder={isAr ? 'رقم التسجيلة' : 'Record number'} aria-label={isAr ? 'رقم التسجيلة' : 'Record number'} />
      <button className={`${light} py-1 px-3 text-xs`} disabled={!id.trim()} onClick={() => onLink(id.trim())}>{isAr ? 'اربط' : 'Link'}</button>
    </span>
  );
}

/** A journal's issues: check in the one that just arrived, see the last ones. */
function IssueCheckIn({ isAr, subscriptionId, onChange }: { isAr: boolean; subscriptionId: number; onChange: () => void }) {
  const [issues, setIssues] = useState<any[] | null>(null);
  const [label, setLabel] = useState('');
  const load = useCallback(() => {
    moonFetch(`/acq/issues?subscription=${subscriptionId}`).then((r) => setIssues(r.ok ? r.data.issues : [])).catch(() => setIssues([]));
  }, [subscriptionId]);
  useEffect(() => { load(); }, [load]);
  const checkIn = async () => {
    const r = await moonFetch('/acq/issues', { body: { subscriptionId, label: label.trim() } });
    if (!r.ok) { toast.error(r.data?.error || `Error ${r.status}`); return; }
    toast.success(isAr ? 'سُجّل وصول العدد' : 'Issue checked in');
    setLabel(''); load(); onChange();
  };
  const remove = async (id: number) => { const r = await moonFetch(`/acq/issues/${id}`, { method: 'DELETE' }); if (r.ok) { load(); onChange(); } };
  return (
    <div className="w-full rounded-xl bg-white/70 border border-slate-200 p-3 space-y-2">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (label.trim()) checkIn(); }}>
        <input className={`${input} flex-1 min-w-[10rem] py-1.5`} dir="auto" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={isAr ? 'العدد الذي وصل: مج ١٢، ع ٣' : 'The issue that came: vol. 12, no. 3'} />
        <button className={`${dark} py-1.5`} disabled={!label.trim()}><PackageCheck className="h-4 w-4" /> {isAr ? 'وصل' : 'Check in'}</button>
      </form>
      {issues === null ? <p className="text-xs text-slate-500">…</p> : issues.length === 0 ? <p className="text-xs text-slate-500">{isAr ? 'لم يُسجَّل وصول أي عدد بعد.' : 'No issue checked in yet.'}</p> : (
        <ul className="text-xs space-y-0.5">{issues.slice(0, 8).map((i) => (
          <li key={i.id} className="flex justify-between gap-2"><span dir="auto">{i.label}</span>
            <span className="text-slate-600">{dateText(i.received_on, isAr)} <button className="underline ms-1" onClick={() => remove(i.id)}>{isAr ? 'حذف' : 'remove'}</button></span></li>
        ))}</ul>
      )}
    </div>
  );
}
