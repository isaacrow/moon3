/**
 * Circulation > the loan desk (/desk/): check out and check in by barcode, borrowers, loans, holds and the
 * loan rules. The server is circulationRoutes.tsx; each library sees only its own borrowers.
 * A loan keeps its borrower only while it is out: on return Moon forgets who had it (no reading history).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeftRight, IdCard, ListChecks, CalendarClock, Settings2, Search, Plus, RefreshCw, Trash2, X, BookOpen,
  LogIn, LogOut, ShieldAlert, Coins, ExternalLink, DoorOpen, DoorClosed,
  Printer,
} from 'lucide-react';
import { moonFetch } from '../utils/moonApi';
import { code128Svg } from '../utils/code128';
import { ChangeHistory } from './ChangeHistory';
import { useAuth } from '../contexts/AuthContext';

export type DeskTab = 'desk' | 'patrons' | 'loans' | 'holds' | 'rules';
export const DESK_TABS: DeskTab[] = ['desk', 'patrons', 'loans', 'holds', 'rules'];

type Kind = 'reader' | 'student' | 'staff';
interface Patron { id: string; card: string; name: string; kind: Kind; email?: string | null; phone?: string | null; note?: string | null; blocked?: boolean; readerEmail?: string | null }
interface Loan {
  id: number; barcode: string; record_id?: string; record_title?: string; due_at: string; loaned_at: string; returned_at?: string | null;
  renewals: number; fine: number; fine_settled: boolean; daysOverdue: number; fineNow: number; patron?: { id: string; name: string; card: string } | null;
  in_room?: boolean; room_state?: 'in-use' | 'on-shelf' | null;
}
interface Hold { id: number; record_id: string; record_title?: string; status: 'waiting' | 'ready'; barcode?: string | null; placed_at: string; expires_at?: string | null; patron?: { id: string; name: string; card: string } }
interface Rules { loanDays: Record<Kind, number>; maxLoans: Record<Kind, number>; maxRenewals: number; fines: boolean; finePerDay: number; fineCap: number; currency: string; holdDays: number; roomDays: number }

const KINDS: Kind[] = ['reader', 'student', 'staff'];
const KIND_AR: Record<Kind, string> = { reader: 'قارئ', student: 'طالب', staff: 'موظف' };
const KIND_EN: Record<Kind, string> = { reader: 'Reader', student: 'Student', staff: 'Staff' };

// The server answers in English; the desk shows its usual messages in Arabic too.
const AR_ERRORS: Array<[RegExp, string]> = [
  [/^Library staff only/, 'لموظفي المكتبة فقط (المفهرسون والمراجعون والمشرف العام)'],
  [/^No borrower has this card/, 'لا يوجد مستفيد بهذا الرقم'],
  [/^No copy has this barcode/, 'لا نسخة بهذا الباركود. أضفه إلى نسخ الطبعة في المحرر.'],
  [/^This copy is for use in the library only/, 'هذه النسخة للاطلاع داخل المكتبة فقط'],
  [/^This copy is already on loan/, 'هذه النسخة معارة؛ سجّل إرجاعها أولًا'],
  [/^This copy is held for another borrower/, 'هذه النسخة محجوزة لمستفيد آخر'],
  [/^This borrower is blocked/, 'هذا المستفيد موقوف'],
  [/^This borrower has (\d+) overdue/, 'لدى هذا المستفيد إعارات متأخرة: $1'],
  [/^This borrower owes (.+)/, 'على هذا المستفيد غرامة: $1'],
  [/^This borrower already has (\d+) copies out/, 'بلغ هذا المستفيد حدّ الإعارة ($1 نسخ)'],
  [/^This copy is not on loan/, 'هذه النسخة ليست معارة'],
  [/^Renewed (\d+) times already/, 'جُدّدت $1 مرات، وهو الحد'],
  [/^Another borrower is waiting/, 'مستفيد آخر ينتظر هذا الكتاب'],
  [/^Overdue: return it/, 'متأخرة: تُرجع وتُسدّد الغرامة أولًا'],
  [/^A borrower already has this card number/, 'رقم البطاقة مستخدم لمستفيد آخر'],
  [/^This borrower still has copies out/, 'لدى المستفيد نسخ معارة'],
  [/^This borrower still owes a fine/, 'على المستفيد غرامة لم تُسدّد'],
  [/^This borrower is already waiting/, 'المستفيد ينتظر هذا الكتاب أصلًا'],
  [/^No record has this number/, 'لا تسجيلة بهذا الرقم'],
  [/^A reviewer or the Super Admin sets/, 'المراجع أو المشرف العام يضبط قواعد الإعارة'],
  [/^No reader account has this email/, 'لا حساب قارئ بهذا البريد؛ يسجّل القارئ في الفهرس أولًا'],
  [/^The reader account email is not valid/, 'بريد حساب القارئ غير صحيح'],
];
const say = (isAr: boolean, msg: string) => {
  if (!isAr) return msg;
  for (const [re, ar] of AR_ERRORS) if (re.test(msg)) return msg.replace(re, ar).replace(/^(.*?)(\s*\(.*|$)/, '$1');
  return msg;
};

export const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.6)', borderRadius: 16, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.9)',
};
export const input = 'w-full rounded-xl px-3 py-2 text-sm bg-white/80 border border-slate-300 text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/30';
export const btn = 'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-default';
export const dark = `${btn} bg-slate-900 text-white hover:bg-slate-700`;
export const light = `${btn} bg-white/80 text-slate-900 border border-slate-300 hover:bg-white`;

function useDate(isAr: boolean) {
  return (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
}

/** The tab in the address (?tab=patrons), so a refresh or a link opens the same part of the desk. */
function tabFromUrl(): DeskTab {
  const t = new URLSearchParams(window.location.search).get('tab') as DeskTab | null;
  return t && DESK_TABS.includes(t) ? t : 'desk';
}

export function CirculationDesk({ isAr, onOpenRecord }: { isAr: boolean; onOpenRecord?: (id: string) => void }) {
  const { user } = useAuth();
  const [tab, setTabState] = useState<DeskTab>(tabFromUrl);
  const [denied, setDenied] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const setTab = (t: DeskTab) => {
    setTabState(t);
    const u = new URL(window.location.href);
    if (t === 'desk') u.searchParams.delete('tab'); else u.searchParams.set('tab', t);
    window.history.replaceState(null, '', u.pathname + u.search);
  };
  const loadSummary = useCallback(() => {
    moonFetch('/circulation/summary').then((r) => {
      if (r.status === 403) setDenied(true);
      else if (r.ok) setSummary(r.data);
    }).catch(() => {});
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => {
    const onPop = () => setTabState(tabFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const n = (v?: number) => (v ?? 0).toLocaleString(isAr ? 'ar-EG' : 'en-GB');
  const TABS: Array<{ id: DeskTab; icon: any; ar: string; en: string }> = [
    { id: 'desk', icon: ArrowLeftRight, ar: 'الإعارة والإرجاع', en: 'Check out / in' },
    { id: 'patrons', icon: IdCard, ar: 'المستفيدون', en: 'Borrowers' },
    { id: 'loans', icon: ListChecks, ar: 'الإعارات', en: 'Loans' },
    { id: 'holds', icon: CalendarClock, ar: 'الحجوزات', en: 'Holds' },
    { id: 'rules', icon: Settings2, ar: 'قواعد الإعارة', en: 'Loan rules' },
  ];

  if (denied || user?.role === 'tester') {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="p-6 flex gap-3" style={glass}>
          <ShieldAlert className="h-6 w-6 text-slate-700 shrink-0" />
          <div>
            <h1 className="font-black text-slate-900">{isAr ? 'مكتب الإعارة لموظفي المكتبة' : 'The loan desk is for library staff'}</h1>
            <p className="text-sm text-slate-600 mt-1">
              {isAr
                ? 'يستخدمه المفهرسون والمراجعون والمشرف العام، لأن فيه بيانات المستفيدين. اطلب من المشرف العام تغيير دورك.'
                : 'Cataloguers, reviewers and the Super Admin use it, because it holds borrowers’ details. Ask the Super Admin to change your role.'}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{isAr ? 'مكتب الإعارة' : 'Loan desk'}</h1>
          <p className="text-sm text-slate-600">
            {summary?.library && <span className="font-bold">{summary.library} · </span>}
            {summary
              ? (isAr
                ? `${n(summary.open)} معارة · ${n(summary.overdue)} متأخرة · ${n(summary.holdsReady)} على رف الحجز · ${n(summary.patrons)} مستفيدًا`
                : `${n(summary.open)} out · ${n(summary.overdue)} overdue · ${n(summary.holdsReady)} on the hold shelf · ${n(summary.patrons)} borrowers`)
              : '…'}
          </p>
        </div>
        <nav className="flex flex-wrap gap-1 p-1" style={glass} aria-label={isAr ? 'أجزاء المكتب' : 'Desk parts'}>
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
      <div key={tab} className="moon-enter">
        {tab === 'desk' && <Desk isAr={isAr} onChange={loadSummary} />}
        {tab === 'patrons' && <Patrons isAr={isAr} onChange={loadSummary} />}
        {tab === 'loans' && <Loans isAr={isAr} onChange={loadSummary} onOpenRecord={onOpenRecord} />}
        {tab === 'holds' && <Holds isAr={isAr} onChange={loadSummary} />}
        {tab === 'rules' && <RulesForm isAr={isAr} canEdit={user?.role !== 'cataloger'} />}
      </div>
      <p className="text-xs text-slate-500 mt-6 max-w-3xl">
        {isAr
          ? 'الخصوصية: تحتفظ الإعارة باسم المستفيد ما دامت النسخة عنده فقط. عند الإرجاع يُحذف الاسم من الإعارة، فلا يبقى سجل لما قرأه أحد (إلا إن بقيت عليه غرامة حتى تُسدّد).'
          : 'Privacy: a loan keeps the borrower’s name only while the copy is out. On return the name is removed from the loan, so no record of anyone’s reading is kept (unless a fine on it is still unpaid).'}
      </p>
    </main>
  );
}

// ─── Check out / check in ───────────────────────────────────

function Desk({ isAr, onChange }: { isAr: boolean; onChange: () => void }) {
  const [mode, setMode] = useState<'out' | 'in'>('out');
  const [card, setCard] = useState('');
  const [patron, setPatron] = useState<any>(null);
  const [barcode, setBarcode] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Array<{ ok: boolean; text: string; sub?: string }>>([]);
  const date = useDate(isAr);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLInputElement>(null);
  const add = (e: { ok: boolean; text: string; sub?: string }) => setLog((l) => [e, ...l].slice(0, 20));

  const openCard = async (raw: string) => {
    const c = raw.trim();
    if (!c) return;
    setBusy(true);
    const r = await moonFetch(`/circulation/patrons?q=${encodeURIComponent(c)}`).catch(() => null);
    const hit = r?.ok ? (r.data.patrons || []).find((p: Patron) => p.card === c) : null;
    if (!hit) { setBusy(false); setPatron(null); toast.error(isAr ? 'لا يوجد مستفيد بهذا الرقم' : 'No borrower has this card number'); return; }
    const d = await moonFetch(`/circulation/patrons/${hit.id}`).catch(() => null);
    setBusy(false);
    if (d?.ok) { setPatron(d.data); setTimeout(() => barcodeRef.current?.focus(), 0); }
  };

  const scan = async () => {
    const b = barcode.trim();
    if (!b) return;
    setBusy(true);
    if (mode === 'out') {
      const r = await moonFetch('/circulation/checkout', { body: { barcode: b, card: patron?.patron?.card, inRoom } });
      if (r.ok) {
        add({ ok: true, text: r.data.title, sub: r.data.loan.in_room
          ? (isAr ? `للقاعة فقط · مع ${r.data.patron.name} حتى الإغلاق` : `Reading room only · with ${r.data.patron.name} until closing`)
          : (isAr ? `أُعير إلى ${r.data.patron.name} · يُرجع في ${date(r.data.loan.due_at)}` : `Lent to ${r.data.patron.name} · due ${date(r.data.loan.due_at)}`) });
        openCard(patron.patron.card);
        onChange();
      } else {
        add({ ok: false, text: say(isAr, r.data?.error || `Error ${r.status}`), sub: b });
        // A reference-only copy: tick "for the reading room" so the next scan lends it there.
        if (r.data?.readingRoomOnly) { setInRoom(true); toast.info(isAr ? 'هذه النسخة للاطلاع في القاعة فقط. اخترت «للقاعة فقط»؛ امسحها مرة أخرى.' : 'This copy is for the reading room only. “Reading room only” is now ticked; scan it again.'); }
      }
    } else {
      const r = await moonFetch('/circulation/checkin', { body: { barcode: b } });
      if (r.ok) {
        const d = r.data;
        const parts = [
          d.borrower && (isAr ? `من ${d.borrower.name}` : `from ${d.borrower.name}`),
          d.daysOverdue > 0 && (isAr ? `متأخرة ${d.daysOverdue} يومًا` : `${d.daysOverdue} days late`),
          d.fine > 0 && (isAr ? `غرامة ${d.fine} ${d.currency}` : `fine ${d.fine} ${d.currency}`),
        ].filter(Boolean).join(' · ');
        add({ ok: true, text: d.title || b, sub: parts || (isAr ? 'أُرجعت' : 'Returned') });
        if (d.hold) {
          const msg = isAr ? `ضعها على رف الحجز لـ ${d.hold.name} (${d.hold.card}) حتى ${date(d.hold.until)}` : `Put it on the hold shelf for ${d.hold.name} (${d.hold.card}) until ${date(d.hold.until)}`;
          add({ ok: true, text: isAr ? 'محجوزة' : 'On hold', sub: msg });
          toast.info(msg, { duration: 10000 });
        }
        onChange();
      } else add({ ok: false, text: say(isAr, r.data?.error || `Error ${r.status}`), sub: b });
    }
    setBarcode('');
    setBusy(false);
    barcodeRef.current?.focus();
  };

  const state = patron?.state;
  return (
    <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
      <section className="p-5 space-y-4" style={glass}>
        <div className="flex gap-1 p-1 rounded-full bg-white/70 w-fit">
          <button className={`${btn} px-3 py-1.5 ${mode === 'out' ? 'bg-slate-900 text-white' : 'text-slate-800'}`} onClick={() => { setMode('out'); setTimeout(() => (patron ? barcodeRef : cardRef).current?.focus(), 0); }}>
            <LogOut className="h-4 w-4" /> {isAr ? 'إعارة' : 'Check out'}
          </button>
          <button className={`${btn} px-3 py-1.5 ${mode === 'in' ? 'bg-slate-900 text-white' : 'text-slate-800'}`} onClick={() => { setMode('in'); setTimeout(() => barcodeRef.current?.focus(), 0); }}>
            <LogIn className="h-4 w-4" /> {isAr ? 'إرجاع' : 'Check in'}
          </button>
        </div>

        {mode === 'out' && (
          <form onSubmit={(e) => { e.preventDefault(); openCard(card); }} className="space-y-1">
            <label className="text-xs font-bold text-slate-700" htmlFor="desk-card">{isAr ? '١. بطاقة المستفيد' : '1. Borrower’s card'}</label>
            <div className="flex gap-2">
              <input id="desk-card" ref={cardRef} autoFocus className={input} dir="ltr" value={card} onChange={(e) => setCard(e.target.value)} placeholder={isAr ? 'امسح البطاقة أو اكتب رقمها' : 'Scan or type the card number'} />
              <button className={light} disabled={busy}>{isAr ? 'فتح' : 'Open'}</button>
            </div>
          </form>
        )}
        {mode === 'out' && patron && (
          <div className="rounded-xl p-3 bg-white/70 border border-slate-200 text-sm">
            <div className="flex items-center justify-between gap-2">
              <b className="text-slate-900">{patron.patron.name}</b>
              <button onClick={() => { setPatron(null); setCard(''); cardRef.current?.focus(); }} className="p-1 rounded-full hover:bg-slate-200" aria-label={isAr ? 'مستفيد آخر' : 'Another borrower'}><X className="h-4 w-4" /></button>
            </div>
            <div className="text-slate-600 text-xs mt-0.5">
              {isAr ? KIND_AR[patron.patron.kind as Kind] : KIND_EN[patron.patron.kind as Kind]} · {patron.patron.card}
              {' · '}{isAr ? `${state.openLoans} من ${patron.rules.maxLoans[patron.patron.kind]} معارة` : `${state.openLoans} of ${patron.rules.maxLoans[patron.patron.kind]} out`}
            </div>
            {(patron.patron.blocked || state.overdue > 0 || (patron.rules.fines && state.finesOwed > 0)) && (
              <div className="mt-2 text-xs font-bold text-red-700">
                {[patron.patron.blocked && (isAr ? 'موقوف' : 'Blocked'),
                  state.overdue > 0 && (isAr ? `${state.overdue} متأخرة` : `${state.overdue} overdue`),
                  patron.rules.fines && state.finesOwed > 0 && (isAr ? `غرامة ${state.finesOwed} ${patron.rules.currency}` : `owes ${state.finesOwed} ${patron.rules.currency}`)].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        )}

        {(mode === 'in' || patron) && (
          <form onSubmit={(e) => { e.preventDefault(); scan(); }} className="space-y-1">
            <label className="text-xs font-bold text-slate-700" htmlFor="desk-barcode">{mode === 'out' ? (isAr ? '٢. باركود النسخة' : '2. The copy’s barcode') : (isAr ? 'باركود النسخة المُرجعة' : 'Barcode of the returned copy')}</label>
            <div className="flex gap-2">
              <input id="desk-barcode" ref={barcodeRef} autoFocus={mode === 'in'} className={input} dir="ltr" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder={isAr ? 'امسح الباركود' : 'Scan the barcode'} />
              <button className={dark} disabled={busy || !barcode.trim()}>{mode === 'out' ? (isAr ? 'إعارة' : 'Lend') : (isAr ? 'إرجاع' : 'Return')}</button>
            </div>
            {mode === 'out' && (
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer pt-1">
                <input type="checkbox" checked={inRoom} onChange={(e) => setInRoom(e.target.checked)} />
                <DoorOpen className="h-3.5 w-3.5" />
                {isAr ? 'للقاعة فقط: يُطّلع عليها في قاعة الاطلاع ولا تخرج من المكتبة' : 'Reading room only: used in the reading room, never taken home'}
              </label>
            )}
          </form>
        )}
        <p className="text-xs text-slate-500">
          {isAr
            ? 'الباركود هو الذي في «النسخ» على كل طبعة في المحرر. ماسح الباركود يكتب الرقم ويضغط Enter، فتعمل الإعارة بمسحة واحدة.'
            : 'Barcodes are the ones in “Copies” on each edition in the editor. A barcode scanner types the number and presses Enter, so one scan does the loan.'}
        </p>
      </section>

      <section className="p-5" style={glass} aria-live="polite">
        <h2 className="font-black text-slate-900 mb-2">{mode === 'out' && patron ? (isAr ? 'معار الآن لهذا المستفيد' : 'Out to this borrower now') : (isAr ? 'ما جرى الآن' : 'Just now')}</h2>
        {log.length === 0 && !(mode === 'out' && patron?.loans?.some((l: Loan) => !l.returned_at)) && <p className="text-sm text-slate-500">{isAr ? 'لا شيء بعد.' : 'Nothing yet.'}</p>}
        <ul className="space-y-2">
          {log.map((e, i) => (
            <li key={i} className={`rounded-xl p-2.5 text-sm border ${e.ok ? 'bg-white/70 border-slate-200' : 'bg-red-50 border-red-200'}`}>
              <div className={`font-bold ${e.ok ? 'text-slate-900' : 'text-red-800'}`} dir="auto">{e.text}</div>
              {e.sub && <div className="text-xs text-slate-600" dir="auto">{e.sub}</div>}
            </li>
          ))}
        </ul>
        {mode === 'out' && patron && (
          <ul className="space-y-1 mt-3">
            {(patron.loans as Loan[]).filter((l) => !l.returned_at).map((l) => (
              <li key={l.id} className="text-sm flex justify-between gap-2 border-t border-slate-200 pt-1">
                <span dir="auto" className="truncate">{l.record_title || l.barcode}</span>
                <span className={`shrink-0 text-xs ${l.daysOverdue ? 'text-red-700 font-bold' : 'text-slate-600'}`}>{date(l.due_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Borrowers ───────────────────────────────────────────────

const emptyPatron: Omit<Patron, 'id'> = { card: '', name: '', kind: 'reader', email: '', phone: '', note: '', blocked: false };

function Patrons({ isAr, onChange }: { isAr: boolean; onChange: () => void }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<Patron[] | null>(null);
  const [open, setOpen] = useState<any>(null);
  const [form, setForm] = useState<(Omit<Patron, 'id'> & { id?: string }) | null>(null);
  const date = useDate(isAr);

  const search = useCallback(async (text: string) => {
    const r = await moonFetch(`/circulation/patrons?q=${encodeURIComponent(text.trim())}`).catch(() => null);
    setList(r?.ok ? r.data.patrons : []);
  }, []);
  useEffect(() => { search(''); }, [search]);
  const openPatron = async (id: string) => {
    const r = await moonFetch(`/circulation/patrons/${id}`);
    if (r.ok) setOpen(r.data); else toast.error(say(isAr, r.data?.error || ''));
  };
  const save = async () => {
    if (!form) return;
    const r = await moonFetch(form.id ? `/circulation/patrons/${form.id}` : '/circulation/patrons', { method: form.id ? 'PUT' : 'POST', body: form });
    if (!r.ok) { toast.error(say(isAr, r.data?.error || `Error ${r.status}`)); return; }
    toast.success(isAr ? 'حُفظ المستفيد' : 'Borrower saved');
    setForm(null); search(q); openPatron(r.data.patron.id); onChange();
  };
  const remove = async (p: Patron) => {
    if (!window.confirm(isAr ? `حذف ${p.name}؟ لا يمكن التراجع.` : `Remove ${p.name}? This cannot be undone.`)) return;
    const r = await moonFetch(`/circulation/patrons/${p.id}`, { method: 'DELETE' });
    if (!r.ok) { toast.error(say(isAr, r.data?.error || '')); return; }
    setOpen(null); search(q); onChange();
  };
  const renew = async (id: number) => {
    const r = await moonFetch('/circulation/renew', { body: { loanId: id } });
    if (!r.ok) toast.error(say(isAr, r.data?.error || '')); else { toast.success(isAr ? `جُدّدت حتى ${date(r.data.loan.due_at)}` : `Renewed until ${date(r.data.loan.due_at)}`); openPatron(open.patron.id); }
  };
  const settle = async (id: number) => {
    const r = await moonFetch(`/circulation/loans/${id}/settle`, { method: 'POST', body: {} });
    if (r.ok) { openPatron(open.patron.id); onChange(); }
  };
  const cancelHold = async (id: number) => {
    const r = await moonFetch(`/circulation/holds/${id}`, { method: 'DELETE' });
    if (r.ok) { openPatron(open.patron.id); onChange(); }
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
      <section className="p-5 space-y-3" style={glass}>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); search(q); }}>
          <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={isAr ? 'الاسم أو رقم البطاقة' : 'Name or card number'} dir="auto" />
          <button className={light} aria-label={isAr ? 'بحث' : 'Search'}><Search className="h-4 w-4" /></button>
          <button type="button" className={dark} onClick={() => { setForm({ ...emptyPatron }); setOpen(null); }}><Plus className="h-4 w-4" /> {isAr ? 'إضافة' : 'Add'}</button>
        </form>
        {list === null ? <p className="text-sm text-slate-500">…</p> : list.length === 0 ? (
          <p className="text-sm text-slate-500">{q ? (isAr ? 'لا أحد بهذا الاسم أو الرقم.' : 'Nobody by that name or number.') : (isAr ? 'لا مستفيدين بعد. أضف أول مستفيد.' : 'No borrowers yet. Add the first one.')}</p>
        ) : (
          <ul className="moon-stagger divide-y divide-slate-200">
            {list.map((p) => (
              <li key={p.id}>
                <button onClick={() => { setForm(null); openPatron(p.id); }} className={`w-full text-start py-2 px-2 rounded-lg hover:bg-white/70 ${open?.patron?.id === p.id ? 'bg-white/80' : ''}`}>
                  <div className="font-bold text-slate-900 text-sm" dir="auto">{p.name} {p.blocked && <span className="text-red-700 text-xs">· {isAr ? 'موقوف' : 'blocked'}</span>}</div>
                  <div className="text-xs text-slate-600">{p.card} · {isAr ? KIND_AR[p.kind] : KIND_EN[p.kind]}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="p-5" style={glass}>
        {form ? (
          <form className="grid sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <h2 className="sm:col-span-2 font-black text-slate-900">{form.id ? (isAr ? 'تعديل المستفيد' : 'Edit borrower') : (isAr ? 'مستفيد جديد' : 'New borrower')}</h2>
            <Field label={isAr ? 'الاسم' : 'Name'}><input required className={input} dir="auto" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={isAr ? 'رقم البطاقة' : 'Card number'}><input required={!!form.id} className={input} dir="ltr" value={form.card} onChange={(e) => setForm({ ...form, card: e.target.value })}
              placeholder={form.id ? '' : (isAr ? 'فارغ: الرقم التالي من تسلسل المكتبة' : 'Empty: the next from the library’s sequence')} /></Field>
            <Field label={isAr ? 'النوع' : 'Kind'}>
              <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
                {KINDS.map((k) => <option key={k} value={k}>{isAr ? KIND_AR[k] : KIND_EN[k]}</option>)}
              </select>
            </Field>
            <Field label={isAr ? 'البريد (اختياري)' : 'Email (optional)'}><input type="email" className={input} dir="ltr" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={isAr ? 'الهاتف (اختياري)' : 'Phone (optional)'}><input className={input} dir="ltr" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label={isAr ? 'ملاحظة' : 'Note'}><input className={input} dir="auto" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            <div className="sm:col-span-2">
              <Field label={isAr ? 'بريد حساب القارئ في الفهرس (اختياري)' : 'Reader account email in the catalogue (optional)'}>
                <input type="email" className={input} dir="ltr" value={form.readerEmail || ''} onChange={(e) => setForm({ ...form, readerEmail: e.target.value })} />
              </Field>
              <p className="text-xs text-slate-500 mt-1">{isAr
                ? 'يربط البطاقة بحساب القارئ: فيرى إعاراته وحجوزاته في الفهرس ويحجز منه، ويُحفظ له سجل قراءته إن أبقاه مفعّلًا. لا يرى الموظفون هذا السجل.'
                : 'Links the card to the reader’s account: they see their loans and holds in the catalogue and place holds there, and their reading history is kept if they leave it on. Staff never see that history.'}</p>
            </div>
            <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" checked={!!form.blocked} onChange={(e) => setForm({ ...form, blocked: e.target.checked })} /> {isAr ? 'موقوف عن الإعارة' : 'Blocked from borrowing'}
            </label>
            <p className="sm:col-span-2 text-xs text-slate-500">{isAr ? 'احفظ أقل ما تحتاجه المكتبة: الاسم والبطاقة يكفيان.' : 'Keep only what the library needs: a name and a card are enough.'}</p>
            <div className="sm:col-span-2 flex gap-2">
              <button className={dark}>{isAr ? 'حفظ' : 'Save'}</button>
              <button type="button" className={light} onClick={() => setForm(null)}>{isAr ? 'إلغاء' : 'Cancel'}</button>
              {form.id && form.card && <button type="button" className={light} onClick={() => printCards([{ name: form.name, card: form.card, kind: form.kind }], isAr)}><Printer className="h-4 w-4" />{isAr ? 'اطبع البطاقة' : 'Print card'}</button>}
            </div>
            {form.id && <ChangeHistory entity="borrowers" id={form.id} isAr={isAr} />}
          </form>
        ) : open ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-black text-lg text-slate-900" dir="auto">{open.patron.name}</h2>
                <div className="text-sm text-slate-600">{open.patron.card} · {isAr ? KIND_AR[open.patron.kind as Kind] : KIND_EN[open.patron.kind as Kind]}{open.patron.email ? ` · ${open.patron.email}` : ''}{open.patron.phone ? ` · ${open.patron.phone}` : ''}</div>
                {open.patron.readerEmail && <div className="text-xs text-emerald-700 mt-0.5">{isAr ? `مربوط بحساب القارئ ${open.patron.readerEmail}` : `Linked to the reader account ${open.patron.readerEmail}`}</div>}
                {open.patron.readerEmail && <ReaderResetCode isAr={isAr} patronId={open.patron.id} />}
                {open.patron.note && <div className="text-sm text-slate-700 mt-1" dir="auto">{open.patron.note}</div>}
              </div>
              <div className="flex gap-2">
                <button className={light} onClick={() => setForm({ ...open.patron })}>{isAr ? 'تعديل' : 'Edit'}</button>
                <button className={light} onClick={() => remove(open.patron)} aria-label={isAr ? 'حذف' : 'Remove'}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <LoanList isAr={isAr} loans={open.loans} currency={open.rules.currency} onRenew={renew} onSettle={settle} showBorrower={false} />
            {open.holds.length > 0 && (
              <div>
                <h3 className="font-bold text-slate-900 text-sm mb-1">{isAr ? 'ينتظر' : 'Waiting for'}</h3>
                <ul className="space-y-1">{open.holds.map((h: Hold) => (
                  <li key={h.id} className="text-sm flex justify-between gap-2"><span dir="auto">{h.record_title || h.record_id} · {h.status === 'ready' ? (isAr ? 'جاهز على الرف' : 'ready on the shelf') : (isAr ? 'في الانتظار' : 'waiting')}</span>
                    <button className="text-xs underline" onClick={() => cancelHold(h.id)}>{isAr ? 'إلغاء' : 'Cancel'}</button></li>
                ))}</ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{isAr ? 'اختر مستفيدًا أو أضف واحدًا.' : 'Choose a borrower, or add one.'}</p>
        )}
      </section>
    </div>
  );
}

/**
 * A one-time code for the borrower to set a new password for their catalogue account, after staff have seen
 * them in person. Shown once; valid 24 hours.
 */
function ReaderResetCode({ isAr, patronId }: { isAr: boolean; patronId: string }) {
  const [code, setCode] = useState<{ code: string; expires: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCode(null); }, [patronId]);
  if (code) {
    return (
      <div className="mt-2 rounded-xl bg-white/80 border border-slate-200 p-2 text-sm">
        <div className="text-xs text-slate-600">{isAr ? 'أعطِ المستفيد هذا الرمز ليكتبه في الفهرس («نسيت كلمة المرور» ثم «معي رمز»):' : 'Give the borrower this code to type in the catalogue ("Forgot your password", then "I have a code"):'}</div>
        <div className="font-mono text-lg font-black tracking-wider text-slate-900" dir="ltr">{code.code}</div>
        <div className="text-xs text-slate-500">{isAr ? 'صالح ٢٤ ساعة، لمرة واحدة. لن يظهر مرة أخرى.' : 'Valid for 24 hours, once. It will not be shown again.'}</div>
      </div>
    );
  }
  return (
    <button className="mt-2 text-xs underline text-slate-700" disabled={busy} onClick={async () => {
      if (!window.confirm(isAr ? 'هل تحققت من هوية المستفيد؟ سيستطيع من يحمل الرمز تغيير كلمة مرور حسابه.' : 'Have you checked who the borrower is? Whoever has the code can change their account password.')) return;
      setBusy(true);
      const r = await moonFetch(`/circulation/patrons/${patronId}/reader-reset`, { method: 'POST', body: {} });
      setBusy(false);
      if (r.ok) setCode(r.data); else toast.error(say(isAr, r.data?.error || `Error ${r.status}`));
    }}>{isAr ? 'رمز لإعادة تعيين كلمة مرور حسابه' : 'Code to reset their account password'}</button>
  );
}

export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1 text-xs font-bold text-slate-700">{label}{children}</label>
);

function LoanList({ isAr, loans, currency, onRenew, onSettle, showBorrower, onOpenRecord, onRoom }: {
  isAr: boolean; loans: Loan[]; currency: string; onRenew: (id: number) => void; onSettle: (id: number) => void; showBorrower: boolean; onOpenRecord?: (id: string) => void;
  onRoom?: (id: number, state: 'in-use' | 'on-shelf') => void;
}) {
  const date = useDate(isAr);
  if (!loans.length) return <p className="text-sm text-slate-500">{isAr ? 'لا إعارات.' : 'No loans.'}</p>;
  return (
    <ul className="moon-stagger divide-y divide-slate-200">
      {loans.map((l) => (
        <li key={l.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="flex-1 min-w-[12rem]">
            <span className="font-bold text-slate-900 inline-flex items-center gap-1" dir="auto">
              {l.record_title || (isAr ? 'نسخة' : 'Copy')}
              {onOpenRecord && l.record_id && <button onClick={() => onOpenRecord(l.record_id!)} aria-label={isAr ? 'افتح التسجيلة' : 'Open the record'} className="text-slate-500 hover:text-slate-900"><BookOpen className="h-3.5 w-3.5" /></button>}
            </span>
            <span className="block text-xs text-slate-600">
              {l.barcode}{showBorrower && l.patron ? ` · ${l.patron.name} (${l.patron.card})` : ''}{l.renewals ? (isAr ? ` · جُدّدت ${l.renewals}` : ` · renewed ${l.renewals}`) : ''}
            </span>
          </span>
          {l.returned_at ? (
            <>
              <span className="text-xs font-bold text-red-700"><Coins className="inline h-3.5 w-3.5" /> {l.fine} {currency}</span>
              <button className={`${light} py-1 px-3 text-xs`} onClick={() => onSettle(l.id)}>{isAr ? 'سُدّدت / أُعفي' : 'Paid / waived'}</button>
            </>
          ) : l.in_room ? (
            <>
              <span className="text-xs font-bold text-indigo-800 inline-flex items-center gap-1">
                <DoorOpen className="h-3.5 w-3.5" />
                {l.room_state === 'on-shelf'
                  ? (isAr ? `على رف الحجز حتى ${date(l.due_at)}` : `On the hold shelf until ${date(l.due_at)}`)
                  : (isAr ? 'قيد الاطلاع في القاعة' : 'In use in the reading room')}
              </span>
              {onRoom && (l.room_state === 'on-shelf'
                ? <button className={`${light} py-1 px-3 text-xs`} onClick={() => onRoom(l.id, 'in-use')}>{isAr ? 'سُلّمت للقارئ' : 'Given to the reader'}</button>
                : <button className={`${light} py-1 px-3 text-xs`} onClick={() => onRoom(l.id, 'on-shelf')}>{isAr ? 'إلى رف الحجز' : 'To the hold shelf'}</button>)}
            </>
          ) : (
            <>
              <span className={`text-xs ${l.daysOverdue ? 'text-red-700 font-bold' : 'text-slate-600'}`}>
                {l.daysOverdue ? (isAr ? `متأخرة ${l.daysOverdue} يومًا` : `${l.daysOverdue} days late`) : (isAr ? `حتى ${date(l.due_at)}` : `due ${date(l.due_at)}`)}
                {l.fineNow > 0 ? ` · ${l.fineNow} ${currency}` : ''}
              </span>
              <button className={`${light} py-1 px-3 text-xs`} onClick={() => onRenew(l.id)}><RefreshCw className="h-3 w-3" /> {isAr ? 'تجديد' : 'Renew'}</button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─── Loans ───────────────────────────────────────────────────

function Loans({ isAr, onChange, onOpenRecord }: { isAr: boolean; onChange: () => void; onOpenRecord?: (id: string) => void }) {
  const [state, setState] = useState<'open' | 'overdue' | 'fines' | 'room'>('open');
  const [loans, setLoans] = useState<Loan[] | null>(null);
  const [currency, setCurrency] = useState('USD');
  const date = useDate(isAr);
  const load = useCallback(async () => {
    const r = await moonFetch(`/circulation/loans?state=${state}`).catch(() => null);
    setLoans(r?.ok ? r.data.loans : []);
  }, [state]);
  useEffect(() => { setLoans(null); load(); }, [load]);
  useEffect(() => { moonFetch('/circulation/rules').then((r) => r.ok && setCurrency(r.data.rules.currency)).catch(() => {}); }, []);
  const renew = async (id: number) => {
    const r = await moonFetch('/circulation/renew', { body: { loanId: id } });
    if (!r.ok) toast.error(say(isAr, r.data?.error || '')); else { toast.success(isAr ? `جُدّدت حتى ${date(r.data.loan.due_at)}` : `Renewed until ${date(r.data.loan.due_at)}`); load(); }
  };
  const settle = async (id: number) => { const r = await moonFetch(`/circulation/loans/${id}/settle`, { method: 'POST', body: {} }); if (r.ok) { load(); onChange(); } };
  const room = async (id: number, to: 'in-use' | 'on-shelf') => {
    const r = await moonFetch(`/circulation/loans/${id}/room`, { body: { state: to } });
    if (!r.ok) toast.error(say(isAr, r.data?.error || '')); else { load(); onChange(); }
  };
  const closeRoom = async () => {
    if (!window.confirm(isAr ? 'وقت الإغلاق: كل نسخ القاعة التي قيد الاطلاع تذهب إلى رف الحجز لقرّائها؟' : 'Closing time: every reading-room copy still in use goes to the hold shelf for its reader?')) return;
    const r = await moonFetch('/circulation/room/close', { body: {} });
    if (!r.ok) { toast.error(say(isAr, r.data?.error || '')); return; }
    toast.success(isAr ? `${r.data.shelved} نسخة إلى رف الحجز` : `${r.data.shelved} copies to the hold shelf`);
    load(); onChange();
  };
  const S = [
    { id: 'open' as const, ar: 'كل المعار', en: 'All out' },
    { id: 'overdue' as const, ar: 'المتأخرة', en: 'Overdue' },
    { id: 'room' as const, ar: 'قاعة الاطلاع', en: 'Reading room' },
    { id: 'fines' as const, ar: 'غرامات لم تُسدّد', en: 'Unpaid fines' },
  ];
  return (
    <section className="p-5 space-y-3" style={glass}>
      <div className="flex flex-wrap gap-1">
        {S.map((s) => <button key={s.id} onClick={() => setState(s.id)} className={`${btn} px-3 py-1.5 text-xs ${state === s.id ? 'bg-slate-900 text-white' : 'bg-white/70 text-slate-800'}`}>{isAr ? s.ar : s.en}</button>)}
      </div>
      {state === 'room' && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
          <span className="flex-1 min-w-[14rem]">{isAr ? 'المخطوطات والكتب النادرة تُعار للقاعة فقط: تُسلّم للقارئ في الصباح، وعند الإغلاق تذهب إلى رف الحجز له، ولا تخرج من المكتبة.' : 'Manuscripts and rare books are lent for the reading room only: given to the reader during the day, on the hold shelf for them at closing, never taken home.'}</span>
          <button className={dark} onClick={closeRoom}><DoorClosed className="h-4 w-4" />{isAr ? 'وقت الإغلاق' : 'Closing time'}</button>
        </div>
      )}
      {loans === null ? <p className="text-sm text-slate-500">…</p> : <LoanList isAr={isAr} loans={loans} currency={currency} onRenew={renew} onSettle={settle} showBorrower onOpenRecord={onOpenRecord} onRoom={room} />}
    </section>
  );
}

// ─── Holds ───────────────────────────────────────────────────

function Holds({ isAr, onChange }: { isAr: boolean; onChange: () => void }) {
  const [holds, setHolds] = useState<Hold[] | null>(null);
  const [card, setCard] = useState('');
  const [recordId, setRecordId] = useState(() => new URLSearchParams(window.location.search).get('record') || '');
  const date = useDate(isAr);
  const load = useCallback(async () => {
    const r = await moonFetch('/circulation/holds').catch(() => null);
    setHolds(r?.ok ? r.data.holds : []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const place = async () => {
    const r = await moonFetch('/circulation/holds', { body: { card: card.trim(), recordId: recordId.trim() } });
    if (!r.ok) { toast.error(say(isAr, r.data?.error || `Error ${r.status}`)); return; }
    toast.success(isAr ? 'سُجّل الحجز' : 'Hold placed');
    setCard(''); setRecordId(''); load(); onChange();
  };
  const cancel = async (id: number) => { const r = await moonFetch(`/circulation/holds/${id}`, { method: 'DELETE' }); if (r.ok) { load(); onChange(); } };
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
      <form className="p-5 space-y-3" style={glass} onSubmit={(e) => { e.preventDefault(); place(); }}>
        <h2 className="font-black text-slate-900">{isAr ? 'حجز كتاب لمستفيد' : 'Hold a book for a borrower'}</h2>
        <Field label={isAr ? 'رقم البطاقة' : 'Card number'}><input required className={input} dir="ltr" value={card} onChange={(e) => setCard(e.target.value)} /></Field>
        <Field label={isAr ? 'رقم التسجيلة' : 'Record number'}><input required className={input} dir="ltr" value={recordId} onChange={(e) => setRecordId(e.target.value)} /></Field>
        <p className="text-xs text-slate-500">{isAr ? 'رقم التسجيلة في صفحة الكتاب في الفهرس العام. عند إرجاع نسخة منه، يخبرك المكتب أن تضعها على رف الحجز.' : 'The record number is on the book’s page in the public catalogue. When a copy comes back, the desk tells you to put it on the hold shelf.'}</p>
        <button className={dark}><Plus className="h-4 w-4" /> {isAr ? 'حجز' : 'Place hold'}</button>
        <button type="button" className={light} onClick={() => printPickSlips(isAr)}><Printer className="h-4 w-4" /> {isAr ? 'قسائم السحب' : 'Pick slips'}</button>
      </form>
      <section className="p-5" style={glass}>
        {holds === null ? <p className="text-sm text-slate-500">…</p> : holds.length === 0 ? <p className="text-sm text-slate-500">{isAr ? 'لا حجوزات.' : 'No holds.'}</p> : (
          <ul className="moon-stagger divide-y divide-slate-200">
            {holds.map((h) => (
              <li key={h.id} className="py-2 flex flex-wrap items-center gap-3 text-sm">
                <span className="flex-1 min-w-[12rem]">
                  <span className="font-bold text-slate-900" dir="auto">{h.record_title || h.record_id}</span>
                  <span className="block text-xs text-slate-600">{h.patron ? `${h.patron.name} (${h.patron.card})` : ''} · {isAr ? `منذ ${date(h.placed_at)}` : `since ${date(h.placed_at)}`}</span>
                </span>
                <span className={`text-xs font-bold ${h.status === 'ready' ? 'text-emerald-700' : 'text-slate-600'}`}>
                  {h.status === 'ready' ? (isAr ? `على رف الحجز (${h.barcode}) حتى ${date(h.expires_at)}` : `On the hold shelf (${h.barcode}) until ${date(h.expires_at)}`) : (isAr ? 'في الانتظار' : 'Waiting')}
                </span>
                <button className={`${light} py-1 px-3 text-xs`} onClick={() => cancel(h.id)}>{isAr ? 'إلغاء' : 'Cancel'}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Rules ───────────────────────────────────────────────────

function RulesForm({ isAr, canEdit }: { isAr: boolean; canEdit: boolean }) {
  const [rules, setRules] = useState<Rules | null>(null);
  const [library, setLibrary] = useState('');
  useEffect(() => { moonFetch('/circulation/rules').then((r) => { if (r.ok) { setRules(r.data.rules); setLibrary(r.data.library); } }).catch(() => {}); }, []);
  if (!rules) return <section className="p-5" style={glass}><p className="text-sm text-slate-500">…</p></section>;
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const save = async () => {
    const r = await moonFetch('/circulation/rules', { method: 'PUT', body: rules });
    if (!r.ok) { toast.error(say(isAr, r.data?.error || '')); return; }
    setRules(r.data.rules);
    toast.success(isAr ? 'حُفظت القواعد' : 'Rules saved');
  };
  return (
    <form className="p-5 space-y-5" style={glass} onSubmit={(e) => { e.preventDefault(); save(); }}>
      <p className="text-sm text-slate-600">{isAr ? `قواعد الإعارة في ${library}.` : `Loan rules for ${library}.`} {!canEdit && (isAr ? 'يضبطها المراجع أو المشرف العام.' : 'A reviewer or the Super Admin sets them.')}</p>
      <fieldset disabled={!canEdit} className="space-y-5">
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead><tr className="text-slate-600 text-xs"><th className="text-start pe-4 pb-1"></th><th className="text-start pe-4 pb-1">{isAr ? 'أيام الإعارة' : 'Days per loan'}</th><th className="text-start pb-1">{isAr ? 'أقصى عدد معار' : 'Most out at once'}</th></tr></thead>
            <tbody>
              {KINDS.map((k) => (
                <tr key={k}>
                  <td className="pe-4 py-1 font-bold text-slate-800">{isAr ? KIND_AR[k] : KIND_EN[k]}</td>
                  <td className="pe-4 py-1"><input type="number" min={1} max={365} className={`${input} w-24`} value={rules.loanDays[k]} onChange={(e) => setRules({ ...rules, loanDays: { ...rules.loanDays, [k]: num(e.target.value) } })} /></td>
                  <td className="py-1"><input type="number" min={1} max={100} className={`${input} w-24`} value={rules.maxLoans[k]} onChange={(e) => setRules({ ...rules, maxLoans: { ...rules.maxLoans, [k]: num(e.target.value) } })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 max-w-2xl">
          <Field label={isAr ? 'أقصى عدد للتجديد' : 'Renewals allowed'}><input type="number" min={0} max={20} className={input} value={rules.maxRenewals} onChange={(e) => setRules({ ...rules, maxRenewals: num(e.target.value) })} /></Field>
          <Field label={isAr ? 'أيام رف الحجز' : 'Days on the hold shelf'}><input type="number" min={1} max={60} className={input} value={rules.holdDays} onChange={(e) => setRules({ ...rules, holdDays: num(e.target.value) })} /></Field>
          <Field label={isAr ? 'أيام انتظار نسخة القاعة لقارئها' : 'Days a reading-room copy waits for its reader'}><input type="number" min={1} max={30} className={input} value={rules.roomDays ?? 3} onChange={(e) => setRules({ ...rules, roomDays: num(e.target.value) })} /></Field>
        </div>
        <div className="space-y-3 max-w-2xl">
          <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
            <input type="checkbox" checked={rules.fines} onChange={(e) => setRules({ ...rules, fines: e.target.checked })} /> {isAr ? 'المكتبة تفرض غرامات على التأخير' : 'The library charges fines for late returns'}
          </label>
          {rules.fines && (
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label={isAr ? 'عن كل يوم' : 'Per day'}><input type="number" step="0.01" min={0} className={input} value={rules.finePerDay} onChange={(e) => setRules({ ...rules, finePerDay: num(e.target.value) })} /></Field>
              <Field label={isAr ? 'أقصى غرامة لإعارة' : 'Most for one loan'}><input type="number" step="0.01" min={0} className={input} value={rules.fineCap} onChange={(e) => setRules({ ...rules, fineCap: num(e.target.value) })} /></Field>
              <Field label={isAr ? 'العملة' : 'Currency'}><input className={input} dir="ltr" maxLength={3} value={rules.currency} onChange={(e) => setRules({ ...rules, currency: e.target.value.toUpperCase() })} placeholder="IQD" /></Field>
            </div>
          )}
        </div>
        {canEdit && <button className={dark}>{isAr ? 'حفظ القواعد' : 'Save rules'}</button>}
      </fieldset>
      <p className="text-xs text-slate-500 flex items-center gap-1">
        <ExternalLink className="h-3 w-3" />
        {isAr ? 'إن كانت المكتبة تعير من FOLIO أو Koha، اربطه من «نظام الإعارة الخارجي» في صفحة الإعارة.' : 'If the library lends from FOLIO or Koha, link it from “External loan system” on the Circulation page.'}
      </p>
    </form>
  );
}

// ─── An outside loan system (FOLIO or Koha) ─────────────────

/** Where each system keeps its desk pages, from the address the library gives. */
export function externalLinks(kind: string, url: string): Array<{ ar: string; en: string; href: string }> {
  const base = url.replace(/\/+$/, '');
  if (kind === 'folio') return [
    { ar: 'الإعارة', en: 'Check out', href: `${base}/checkout` },
    { ar: 'الإرجاع', en: 'Check in', href: `${base}/checkin` },
    { ar: 'المستخدمون', en: 'Users', href: `${base}/users` },
    { ar: 'الطلبات', en: 'Requests', href: `${base}/requests` },
  ];
  if (kind === 'koha') return [
    { ar: 'الإعارة', en: 'Circulation', href: `${base}/cgi-bin/koha/circ/circulation-home.pl` },
    { ar: 'الإرجاع', en: 'Check in', href: `${base}/cgi-bin/koha/circ/returns.pl` },
    { ar: 'المستفيدون', en: 'Patrons', href: `${base}/cgi-bin/koha/members/members-home.pl` },
    { ar: 'الحجوزات', en: 'Holds', href: `${base}/cgi-bin/koha/circ/view_holdsqueue.pl` },
  ];
  return [];
}

/** On the Circulation page: lend in Moon, or link the library's FOLIO or Koha (both can be used side by side). */
export function ExternalLoanSystem({ isAr }: { isAr: boolean }) {
  const { user } = useAuth();
  const [ext, setExt] = useState<{ kind: string; url: string; label: string } | null>(null);
  const [edit, setEdit] = useState(false);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    moonFetch('/circulation/external').then((r) => { if (r.status === 403) setDenied(true); else if (r.ok) setExt(r.data.external); }).catch(() => {});
  }, []);
  if (denied || user?.role === 'tester' || !ext) return null;
  const canEdit = user?.role !== 'cataloger';
  const name = ext.kind === 'folio' ? 'FOLIO' : ext.kind === 'koha' ? 'Koha' : '';
  const save = async () => {
    const r = await moonFetch('/circulation/external', { method: 'PUT', body: ext });
    if (!r.ok) { toast.error(r.data?.error || `Error ${r.status}`); return; }
    setExt(r.data.external); setEdit(false);
    toast.success(isAr ? 'حُفظ' : 'Saved');
  };
  return (
    <section className="p-5 space-y-3" style={glass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-black text-slate-900 flex items-center gap-2"><ExternalLink className="h-4 w-4" /> {isAr ? 'نظام الإعارة الخارجي' : 'External loan system'}</h2>
        {canEdit && !edit && <button className={light} onClick={() => setEdit(true)}>{ext.kind === 'none' ? (isAr ? 'ربط FOLIO أو Koha' : 'Link FOLIO or Koha') : (isAr ? 'تغيير' : 'Change')}</button>}
      </div>
      {!edit && (ext.kind === 'none' ? (
        <p className="text-sm text-slate-600">{isAr
          ? 'المكتبة تعير من Moon. إن كانت تعير من FOLIO أو Koha، اربطه هنا فتفتح صفحاته من هذا القسم؛ ويبقى الفهرسة في Moon، وتُرسل التسجيلات إلى FOLIO من المحرر.'
          : 'The library lends from Moon. If it lends from FOLIO or Koha, link it here and its pages open from this section; cataloguing stays in Moon, and records go to FOLIO from the editor.'}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">{isAr ? `تعير المكتبة من ${ext.label || name}:` : `The library lends from ${ext.label || name}:`} <span dir="ltr" className="text-xs">{ext.url}</span></p>
          <div className="flex flex-wrap gap-2">
            {externalLinks(ext.kind, ext.url).map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className={light}>{isAr ? l.ar : l.en} <ExternalLink className="h-3.5 w-3.5" /></a>
            ))}
          </div>
        </div>
      ))}
      {edit && (
        <form className="grid sm:grid-cols-3 gap-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Field label={isAr ? 'النظام' : 'System'}>
            <select className={input} value={ext.kind} onChange={(e) => setExt({ ...ext, kind: e.target.value })}>
              <option value="none">{isAr ? 'لا شيء (الإعارة في Moon)' : 'None (lend in Moon)'}</option>
              <option value="folio">FOLIO</option>
              <option value="koha">Koha</option>
            </select>
          </Field>
          {ext.kind !== 'none' && <>
            <Field label={ext.kind === 'koha' ? (isAr ? 'عنوان واجهة الموظفين في Koha' : 'Koha staff interface address') : (isAr ? 'عنوان FOLIO' : 'FOLIO address')}>
              <input required className={input} dir="ltr" placeholder="https://" value={ext.url} onChange={(e) => setExt({ ...ext, url: e.target.value })} />
            </Field>
            <Field label={isAr ? 'اسم يظهر (اختياري)' : 'Name to show (optional)'}><input className={input} dir="auto" value={ext.label} onChange={(e) => setExt({ ...ext, label: e.target.value })} /></Field>
          </>}
          <div className="sm:col-span-3 flex gap-2">
            <button className={dark}>{isAr ? 'حفظ' : 'Save'}</button>
            <button type="button" className={light} onClick={() => setEdit(false)}>{isAr ? 'إلغاء' : 'Cancel'}</button>
          </div>
        </form>
      )}
    </section>
  );
}

// ─── Slips and cards (plan step H9) ──────────────────────────

const escHtml = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
function printPage(title: string, css: string, body: string) {
  const w = window.open('', '_blank');
  if (!w) { toast.error('Allow pop-ups to print'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>body{font:13px/1.5 system-ui,Tahoma,sans-serif;color:#111;margin:1cm}${css}</style></head><body>${body}<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

/** Borrower cards, credit-card size, eight to an A4 page: the library, the name, the kind, the card number as a barcode. */
async function printCards(people: Array<{ name: string; card: string; kind: Kind }>, isAr: boolean) {
  const s = await moonFetch('/circulation/summary').catch(() => null);
  const library = s?.ok ? s.data.library : '';
  const cards = people.map((p) => `<div class="card"><div class="lib">${escHtml(library)}</div><div class="name" dir="auto">${escHtml(p.name)}</div><div class="kind">${escHtml(isAr ? KIND_AR[p.kind] : KIND_EN[p.kind])}</div><div class="bc">${code128Svg(p.card, 40, 1.5) || ''}</div><div class="num">${escHtml(p.card)}</div></div>`).join('');
  printPage(isAr ? 'بطاقات المستفيدين' : 'Borrower cards',
    '.card{display:inline-block;box-sizing:border-box;width:85.6mm;height:54mm;border:1px solid #999;border-radius:3mm;padding:4mm;margin:2mm;vertical-align:top;position:relative;page-break-inside:avoid}.lib{font-weight:700;font-size:11px;color:#555}.name{font-size:16px;font-weight:800;margin-top:2mm}.kind{font-size:11px;color:#555}.bc{position:absolute;left:4mm;right:4mm;bottom:9mm;text-align:center}.bc svg{max-width:100%;height:12mm}.num{position:absolute;left:0;right:0;bottom:4mm;text-align:center;font:12px monospace;letter-spacing:1px}',
    cards);
}

/** Pick slips: one per waiting hold with a copy to fetch, in the order staff walk the stacks. */
async function printPickSlips(isAr: boolean) {
  const r = await moonFetch('/circulation/pick-slips').catch(() => null);
  if (!r?.ok) { toast.error(say(isAr, r?.data?.error || 'Error')); return; }
  const slips: any[] = r.data.slips || [];
  if (!slips.length) { toast.info(isAr ? 'لا حجوزات تنتظر نسخة على الرفوف.' : 'No waiting hold has a copy on the shelves.'); return; }
  const rows = slips.map((s) => `<div class="slip"><div class="where">${escHtml(s.location || '—')} · <b>${escHtml(s.shelfMark || '')}</b></div><div class="title" dir="auto">${escHtml(s.title)}</div><div>${isAr ? 'الباركود' : 'Barcode'}: <b>${escHtml(s.barcode)}</b></div><div class="for">${isAr ? 'محجوز لـ' : 'Held for'} ${escHtml(s.borrower)} (${escHtml(s.card)}) · ${escHtml(String(s.placedAt).slice(0, 10))}</div></div>`).join('');
  printPage(isAr ? 'قسائم السحب' : 'Pick slips',
    '.slip{border-bottom:1px dashed #999;padding:4mm 0;page-break-inside:avoid}.where{font-size:15px}.title{font-size:14px;font-weight:700;margin:1mm 0}.for{color:#555;font-size:12px}',
    `<h2>${isAr ? 'قسائم السحب' : 'Pick slips'} · ${slips.length}</h2>${rows}`);
}
