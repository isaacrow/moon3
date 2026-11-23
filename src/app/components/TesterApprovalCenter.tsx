/**
 * Tester Approval Center: the Super Admin's list of tester accounts, in liquid glossy glass.
 * Shared by the top bar (signed-in isaac) and the login screen (after the admin password).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck, X, CheckCircle2, XCircle, Trash2, RefreshCw, Search, Mail, Building2, CalendarDays, Undo2, Loader2,
} from 'lucide-react';
import type { AccountRole, AuthUser } from '../contexts/AuthContext';
import { UserAvatar } from './UserAvatar';
import { formatLastSeen, sortByPresence } from '../utils/presence';
import { InviteCodes } from './InviteCodes';

const LIST_REFRESH_MS = 30_000;

type Filter = 'all' | 'pending' | 'approved' | 'rejected' | 'invites';

interface TesterApprovalCenterProps {
  open: boolean;
  onClose: () => void;
  users: AuthUser[];
  loading?: boolean;
  error?: string | null;
  busyUser?: string | null;
  subtitle?: string;
  onRefresh: () => void;
  onApprove: (username: string) => void;
  onReject: (username: string) => void;
  onDelete: (username: string) => void;
  /** Sets an approved account's role; reviewers may approve, return and comment on others' records,
   *  Manuscripts accounts open the manuscripts catalogue. */
  onSetRole?: (username: string, role: AccountRole) => void;
  /** Shown instead of the list (e.g. the login screen's admin password form). */
  lockedContent?: React.ReactNode;
}

// ---- Liquid glass surfaces --------------------------------------------------------------

/** The window: the css.glass recipe exactly. */
const PANEL: React.CSSProperties = {
  borderRadius: 16,
  background: 'rgba(255, 255, 255, 0.57)',
  boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 1)',
};

const SHEEN: React.CSSProperties = { background: 'none' };

/** A row inside it: the same glass, lighter. */
const ROW: React.CSSProperties = {
  borderRadius: 16,
  background: 'rgba(255, 255, 255, 0.5)',
  border: '1px solid rgba(255, 255, 255, 1)',
  boxShadow: '0 2px 16px rgba(0, 0, 0, 0.05)',
};

const PENDING_ROW: React.CSSProperties = ROW;

const PILL: React.CSSProperties = {
  borderRadius: 999,
  background: 'rgba(255, 255, 255, 0.6)',
  border: '1px solid rgba(255, 255, 255, 1)',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
};

const APPROVE_PILL: React.CSSProperties = PILL;

const REJECT_PILL: React.CSSProperties = PILL;

const STATUS_STYLE: Record<AuthUser['status'], React.CSSProperties> = {
  pending: { background: 'rgba(255, 255, 255, 0.57)', color: '#0f172a', border: '1px solid rgba(255, 255, 255, 1)' },
  approved: { background: 'rgba(255, 255, 255, 0.57)', color: '#0f172a', border: '1px solid rgba(255, 255, 255, 1)' },
  rejected: { background: 'rgba(255, 255, 255, 0.57)', color: '#0f172a', border: '1px solid rgba(255, 255, 255, 1)' },
};

// ---- Component -------------------------------------------------------------------------

export function TesterApprovalCenter({
  open, onClose, users, loading, error, busyUser, subtitle,
  onRefresh, onApprove, onReject, onDelete, onSetRole, lockedContent,
}: TesterApprovalCenterProps) {
  const ar = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const [filter, setFilter] = useState<Filter>('pending');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const counts = useMemo(() => ({
    all: users.length,
    pending: users.filter(u => u.status === 'pending').length,
    approved: users.filter(u => u.status === 'approved').length,
    rejected: users.filter(u => u.status === 'rejected').length,
  }), [users]);

  // Open on the pending queue when there is one, otherwise on everyone.
  useEffect(() => {
    if (open) setFilter(counts.pending > 0 ? 'pending' : 'all');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortByPresence(users
      .filter(u => filter === 'all' || u.status === filter)
      .filter(u => !q || [u.username, u.email, u.institution].some(v => (v || '').toLowerCase().includes(q))));
  }, [users, filter, query]);

  // Keep "online now" / "last seen" current while the list is open.
  // (Through a ref: callers pass a new onRefresh each render, which would restart the timer.)
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const locked = !!lockedContent;
  useEffect(() => {
    if (!open || locked) return;
    const timer = window.setInterval(() => refreshRef.current(), LIST_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [open, locked]);

  const tabs: Array<{ key: Filter; label: string }> = [
    { key: 'pending', label: ar ? 'بانتظار الموافقة' : 'Pending' },
    { key: 'approved', label: ar ? 'معتمد' : 'Approved' },
    { key: 'rejected', label: ar ? 'مرفوض' : 'Declined' },
    { key: 'all', label: ar ? 'الكل' : 'All' },
    { key: 'invites', label: ar ? 'رموز الدعوة' : 'Invite codes' },
  ];

  const statusLabel = (s: AuthUser['status']) =>
    s === 'pending' ? (ar ? 'بانتظار الموافقة' : 'Pending') : s === 'approved' ? (ar ? 'معتمد' : 'Approved') : (ar ? 'مرفوض' : 'Declined');

  const dateOf = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString(ar ? 'ar' : undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" dir={ar ? 'rtl' : 'ltr'}>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0"
            style={{ background: 'rgba(15, 23, 42, 0.25)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={ar ? 'مركز اعتماد الفاحصين' : 'Tester Approval Center'}
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 24 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="relative w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col z-10 text-slate-900"
            style={PANEL}
          >
            <div className="pointer-events-none absolute inset-0" style={SHEEN} />

            {/* Header */}
            <div className="relative px-6 pt-6 pb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl" style={{ ...PILL, borderRadius: 18 }}>
                  <ShieldCheck className="h-6 w-6 text-slate-800" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight">{ar ? 'مركز اعتماد الفاحصين' : 'Tester Approval Center'}</h2>
                  <p className="text-xs text-slate-600">{subtitle || (ar ? 'راجع طلبات الانضمام واعتمدها أو ارفضها' : 'Review, approve or decline tester requests')}</p>
                </div>
              </div>
              <button type="button" onClick={onClose} className="p-2 hover:scale-105 active:scale-95 transition-all cursor-pointer" style={PILL}
                aria-label={ar ? 'إغلاق' : 'Close'}>
                <X className="h-5 w-5" />
              </button>
            </div>

            {lockedContent ? (
              <div className="relative flex-1 overflow-y-auto px-6 pb-8">{lockedContent}</div>
            ) : (
              <>
                {/* Filters + search */}
                <div className="relative px-6 pb-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {tabs.map(tab => {
                      const active = filter === tab.key;
                      return (
                        <button key={tab.key} type="button" onClick={() => setFilter(tab.key)}
                          className="px-3.5 py-1.5 text-xs font-bold flex items-center gap-2 transition-all hover:scale-[1.03] cursor-pointer"
                          style={active
                            ? { ...PILL, background: 'rgba(15, 23, 42, 0.9)', color: '#ffffff' }
                            : { ...PILL, color: '#334155' }}
                          aria-pressed={active}>
                          {tab.label}
                          {tab.key !== 'invites' && <span className="min-w-5 px-1.5 rounded-full text-[10px] font-black"
                            style={tab.key === 'pending' && counts.pending > 0
                              ? { background: '#0f172a', color: '#ffffff' }
                              : { background: active ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.08)' }}>
                            {counts[tab.key]}
                          </span>}
                        </button>
                      );
                    })}
                    <button type="button" onClick={onRefresh} disabled={loading}
                      className="ms-auto px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-all hover:scale-[1.03] disabled:opacity-60 cursor-pointer"
                      style={{ ...PILL, color: '#334155' }}>
                      <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                      {ar ? 'تحديث' : 'Refresh'}
                    </button>
                  </div>
                  {filter !== 'invites' && <div className="relative">
                    <Search className="absolute top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 start-3" style={{ insetInlineStart: 12 }} />
                    <input value={query} onChange={e => setQuery(e.target.value)}
                      placeholder={ar ? 'ابحث بالاسم أو البريد أو المؤسسة' : 'Search by name, email or institution'}
                      className="w-full h-10 ps-9 pe-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-300"
                      style={{ ...PILL, borderRadius: 16, paddingInlineStart: 36 }} />
                  </div>}
                  {error && (
                    <p className="text-xs px-3 py-2" style={{ ...REJECT_PILL, borderRadius: 14, color: '#0f172a' }}>{error}</p>
                  )}
                </div>

                {/* Invite codes, or the list of accounts */}
                {filter === 'invites' ? <InviteCodes ar={ar} /> : (
                <div className="relative flex-1 overflow-y-auto px-6 pb-6 space-y-3">
                  {loading && users.length === 0 ? (
                    <div className="py-16 flex items-center justify-center gap-2 text-slate-500 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'جارٍ التحميل…' : 'Loading…'}
                    </div>
                  ) : visible.length === 0 ? (
                    <div className="py-14 text-center text-sm text-slate-500">
                      {filter === 'pending'
                        ? (ar ? 'لا توجد طلبات بانتظار الموافقة 🎉' : 'No requests waiting for approval 🎉')
                        : (ar ? 'لا توجد حسابات مطابقة.' : 'No matching accounts.')}
                    </div>
                  ) : visible.map(u => {
                    const isAdmin = u.role === 'admin';
                    const busy = busyUser === u.username;
                    return (
                      <motion.div key={u.username} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        style={u.status === 'pending' ? PENDING_ROW : ROW}>
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="relative shrink-0">
                            <UserAvatar username={u.username || '?'} size={44} />
                            {u.online && (
                              <span className="absolute bottom-0 end-0 h-3.5 w-3.5 rounded-full bg-slate-900"
                                style={{ border: '2px solid #ffffff', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}
                                aria-hidden="true" />
                            )}
                          </span>
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-base truncate">{u.username}</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide" style={STATUS_STYLE[u.status]}>
                                {statusLabel(u.status)}
                              </span>
                              {isAdmin && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ ...PILL, color: '#0f172a' }}>
                                  {ar ? 'المشرف العام' : 'Super Admin'}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-700 flex items-center gap-x-3 gap-y-1 flex-wrap">
                              <span className="flex items-center gap-1 min-w-0"><Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{u.email}</span></span>
                              {u.institution && <span className="flex items-center gap-1 min-w-0 text-slate-700"><Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{u.institution}</span></span>}
                              {!isAdmin && dateOf(u.registeredAt) && <span className="flex items-center gap-1 text-slate-500"><CalendarDays className="h-3.5 w-3.5" />{dateOf(u.registeredAt)}</span>}
                            </div>
                            <div className="text-xs flex items-center gap-1.5">
                              {u.online ? (
                                <span className="font-bold text-slate-900">{ar ? 'متصل الآن' : 'Online now'}</span>
                              ) : (
                                <span className="text-slate-500">{formatLastSeen(u.lastSeenAt, ar)}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {!isAdmin && (
                          <div className={`flex items-center gap-2 shrink-0 ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
                            {onSetRole && u.status === 'approved' && (
                              <select
                                value={u.role}
                                onChange={(e) => onSetRole(u.username, e.target.value as AccountRole)}
                                title={ar ? 'الدور' : 'Role'}
                                className="h-9 px-2 text-xs font-bold text-slate-800 cursor-pointer outline-none"
                                style={PILL}
                              >
                                <option value="tester" className="text-slate-900">{ar ? 'فاحص' : 'Tester'}</option>
                                <option value="cataloger" className="text-slate-900">{ar ? 'مفهرس' : 'Cataloger'}</option>
                                <option value="reviewer" className="text-slate-900">{ar ? 'مراجع' : 'Reviewer'}</option>
                                <option value="manuscripts" className="text-slate-900">{ar ? 'المخطوطات' : 'Manuscripts'}</option>
                              </select>
                            )}
                            {u.status !== 'approved' && (
                              <button type="button" onClick={() => onApprove(u.username)}
                                className="px-4 h-9 text-xs font-black flex items-center gap-1.5 text-slate-900 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                                style={APPROVE_PILL}>
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                {u.status === 'rejected' ? (ar ? 'إعادة اعتماد' : 'Re-approve') : (ar ? 'اعتماد' : 'Approve')}
                              </button>
                            )}
                            {u.status !== 'rejected' && (
                              <button type="button" onClick={() => onReject(u.username)}
                                className="px-3.5 h-9 text-xs font-bold flex items-center gap-1.5 text-slate-900 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                                style={REJECT_PILL}>
                                {u.status === 'approved' ? <Undo2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                                {u.status === 'approved' ? (ar ? 'سحب الصلاحية' : 'Revoke') : (ar ? 'رفض' : 'Decline')}
                              </button>
                            )}
                            <button type="button" onClick={() => onDelete(u.username)}
                              className="h-9 w-9 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                              style={PILL} title={ar ? 'حذف الحساب' : 'Delete account'} aria-label={ar ? 'حذف الحساب' : 'Delete account'}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
                )}
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default TesterApprovalCenter;
