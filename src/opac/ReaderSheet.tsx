/**
 * The reader's panel in the catalogue: sign in, create an account, and "My account" (loans, holds, reading
 * history with its switch and "clear", saved books follow the account, delete the account).
 */
import React, { useEffect, useState } from 'react';
import { X, LogOut, Trash2, History, BookOpen, CalendarClock } from 'lucide-react';
import { t } from './i18n';
import { enter, signOut, forget, readerApi, readerError, refreshReader, useReader, emailResetAvailable, askReset, resetPassword } from './readerAccount';

export type ReaderMode = 'signin' | 'register' | 'account' | 'forgot' | 'reset';

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(t('ar-EG', 'en-GB'), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(15,23,42,.18)', background: 'rgba(255,255,255,.85)', font: 'inherit', fontSize: 15 };
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 };
const h3: React.CSSProperties = { margin: '14px 0 6px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 };

export function ReaderSheet({ mode: initial, onClose, onOpenBook, onStaff, resetCode }: {
  mode: ReaderMode; onClose: () => void; onOpenBook: (id: string) => void; onStaff?: () => void;
  /** From the emailed link (?reset=...): opens "Set a new password" with the code filled in. */
  resetCode?: string;
}) {
  const { me } = useReader();
  const [mode, setMode] = useState<ReaderMode>(me ? 'account' : initial === 'account' ? 'signin' : initial);
  // A reset link opens its form even for someone signed in on this browser.
  const shown: ReaderMode = mode === 'reset' ? 'reset' : me ? 'account' : mode === 'account' ? 'signin' : mode;
  const title = shown === 'account' ? t('حسابي', 'My account') : shown === 'register' ? t('إنشاء حساب قارئ', 'Create a reader account')
    : shown === 'forgot' ? t('نسيت كلمة المرور', 'Forgot your password') : shown === 'reset' ? t('كلمة مرور جديدة', 'Set a new password') : t('دخول القرّاء', 'Reader sign in');
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="sheet glass" role="dialog" aria-modal="true" aria-labelledby="reader-h">
        <div className="sheet-head">
          <h2 id="reader-h">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('إغلاق', 'Close')}><X size={18} /></button>
        </div>
        <div className="sheet-body">
          {shown === 'account' && me ? <Account onOpenBook={onOpenBook} />
            : shown === 'forgot' ? <ForgotForm setMode={setMode} />
            : shown === 'reset' ? <ResetForm initialCode={resetCode} onDone={() => setMode('account')} />
            : <EnterForm mode={shown as 'signin' | 'register'} setMode={setMode} />}
        </div>
        {onStaff && (
          <p className="muted" style={{ fontSize: 12, margin: '12px 0 0' }}>
            {t('موظف في المكتبة؟ ', 'Library staff? ')}
            <button className="inline-link" onClick={onStaff}>{t('ادخل إلى Moon Studio', 'Sign in to Moon Studio')}</button>
          </p>
        )}
      </aside>
    </>
  );
}

function EnterForm({ mode, setMode }: { mode: 'signin' | 'register'; setMode: (m: ReaderMode) => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [keepHistory, setKeepHistory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const register = mode === 'register';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await enter(register ? 'register' : 'login', register ? { email, name, password, keepHistory } : { email, password });
    setBusy(false);
    if (!r.ok) setError(r.error);
  };
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {register && <label style={label}>{t('الاسم', 'Name')}<input style={inputStyle} required value={name} onChange={e => setName(e.target.value)} autoComplete="name" dir="auto" /></label>}
      <label style={label}>{t('البريد الإلكتروني', 'Email')}<input style={inputStyle} type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" dir="ltr" /></label>
      <label style={label}>{t('كلمة المرور', 'Password')}<input style={inputStyle} type="password" required minLength={register ? 8 : 1} value={password} onChange={e => setPassword(e.target.value)} autoComplete={register ? 'new-password' : 'current-password'} dir="ltr" /></label>
      {register && (
        <>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14 }}>
            <input type="checkbox" checked={keepHistory} onChange={e => setKeepHistory(e.target.checked)} style={{ marginTop: 4 }} />
            <span>{t('احتفظ بسجل الكتب التي أستعيرها', 'Keep a list of the books I borrow')}</span>
          </label>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            {t('يحفظ Moon اسمك وبريدك والكتب التي تحفظها، وسجل ما تستعيره إن أبقيت الخيار مفعّلًا. سجلّك لك وحدك: لا يراه موظفو المكتبة. يمكنك إيقافه أو مسحه أو حذف حسابك كله في أي وقت، ويُحذف الحساب الذي لا يُستخدم سنتين.',
              'Moon keeps your name, your email, the books you save, and the books you borrow if you leave the box ticked. Your history is yours alone: library staff do not see it. You can turn it off, clear it or delete your whole account at any time, and an account unused for two years is deleted.')}
          </p>
        </>
      )}
      {error && <p role="alert" style={{ color: '#b91c1c', margin: 0, fontSize: 14 }}>{error}</p>}
      <button className="btn-black" disabled={busy} style={{ justifyContent: 'center' }}>{register ? t('إنشاء الحساب', 'Create account') : t('دخول', 'Sign in')}</button>
      <button type="button" className="inline-link" onClick={() => { setError(''); setMode(register ? 'signin' : 'register'); }}>
        {register ? t('لديك حساب؟ سجّل الدخول', 'Have an account? Sign in') : t('ليس لديك حساب؟ أنشئ حسابًا', 'No account yet? Create one')}
      </button>
      {!register && <button type="button" className="inline-link" onClick={() => setMode('forgot')}>{t('نسيت كلمة المرور؟', 'Forgot your password?')}</button>}
    </form>
  );
}

/** Forgot password: a link by email (when the library has set up email), or a code from the loan desk. */
function ForgotForm({ setMode }: { setMode: (m: ReaderMode) => void }) {
  const [canEmail, setCanEmail] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { emailResetAvailable().then(setCanEmail); }, []);
  const desk = canEmail
    ? t('أو اطلب رمز إعادة التعيين من مكتب الإعارة: يعطيك الموظف رمزًا بعد التحقق منك، صالحًا ٢٤ ساعة.', 'Or ask the loan desk for a reset code: staff give you one after checking who you are, valid for 24 hours.')
    : t('اطلب رمز إعادة التعيين من مكتب الإعارة: يعطيك الموظف رمزًا بعد التحقق منك، صالحًا ٢٤ ساعة.', 'Ask the loan desk for a reset code: staff give you one after checking who you are, valid for 24 hours.');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {canEmail === null ? <p className="muted">…</p> : canEmail ? (
        sent ? (
          <p role="status" style={{ margin: 0 }}>{t('إن كان لهذا البريد حساب، فقد أرسلنا إليه رابطًا لتعيين كلمة مرور جديدة، صالحًا ٣٠ دقيقة. افحص مجلد الرسائل غير المرغوبة أيضًا.', 'If an account has this email, we sent it a link to set a new password, valid for 30 minutes. Check your spam folder too.')}</p>
        ) : (
          <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={async (e) => {
            e.preventDefault(); setBusy(true); setError('');
            const r = await askReset(email, t('ar', 'en'));
            setBusy(false);
            if (r.ok) setSent(true); else setError(r.error);
          }}>
            <label style={label}>{t('بريد حسابك', 'Your account email')}<input style={inputStyle} type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" dir="ltr" /></label>
            {error && <p role="alert" style={{ color: '#b91c1c', margin: 0, fontSize: 14 }}>{error}</p>}
            <button className="btn-black" disabled={busy} style={{ justifyContent: 'center' }}>{t('أرسل الرابط', 'Send the link')}</button>
          </form>
        )
      ) : <p style={{ margin: 0 }}>{t('إعادة التعيين بالبريد غير مفعّلة بعد في هذه المكتبة.', 'Reset by email is not set up in this library yet.')}</p>}
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>{desk}</p>
      <button type="button" className="btn-ghost" style={{ justifyContent: 'center' }} onClick={() => setMode('reset')}>{t('معي رمز', 'I have a code')}</button>
      <button type="button" className="inline-link" onClick={() => setMode('signin')}>{t('رجوع إلى الدخول', 'Back to sign in')}</button>
    </div>
  );
}

/** Set a new password with the code from the email or the loan desk. */
function ResetForm({ initialCode, onDone }: { initialCode?: string; onDone: () => void }) {
  const [code, setCode] = useState(initialCode || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError('');
      const r = await resetPassword(code, password);
      setBusy(false);
      if (r.ok) onDone(); else setError(r.error);
    }}>
      <label style={label}>{t('الرمز', 'Code')}<input style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: 1 }} required value={code} onChange={e => setCode(e.target.value)} placeholder="ABCD-EFGH-JKMN" autoComplete="one-time-code" dir="ltr" /></label>
      <label style={label}>{t('كلمة المرور الجديدة', 'New password')}<input style={inputStyle} type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" dir="ltr" /></label>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>{t('بعدها تُسجَّل خارج حسابك في كل الأجهزة الأخرى.', 'You are then signed out of your account on every other device.')}</p>
      {error && <p role="alert" style={{ color: '#b91c1c', margin: 0, fontSize: 14 }}>{error}</p>}
      <button className="btn-black" disabled={busy} style={{ justifyContent: 'center' }}>{t('احفظ كلمة المرور', 'Save the password')}</button>
    </form>
  );
}

function Account({ onOpenBook }: { onOpenBook: (id: string) => void }) {
  const { me } = useReader();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  if (!me) return null;
  const act = async (fn: () => Promise<{ ok: boolean; data: any }>, done?: string) => {
    setBusy(true); setMsg('');
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setMsg(readerError(r.data?.error)); return false; }
    if (done) setMsg(done);
    await refreshReader();
    return true;
  };
  const book = (id: string | null, title: string | null) => id
    ? <button className="inline-link" dir="auto" onClick={() => onOpenBook(id)} style={{ textAlign: 'start' }}>{title || id}</button>
    : <span dir="auto">{title || t('كتاب', 'A book')}</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div><b dir="auto">{me.reader.name}</b><div className="muted" style={{ fontSize: 13 }} dir="ltr">{me.reader.email}</div></div>
      {me.libraries.length ? (
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>{me.libraries.map(l => t(`بطاقة ${l.card} في ${l.library}`, `Card ${l.card} at ${l.library}`)).join(' · ')}</p>
      ) : (
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>{t('لربط بطاقة المكتبة بحسابك، أعطِ الموظف بريدك عند مكتب الإعارة. بعدها ترى إعاراتك هنا وتحجز الكتب.', 'To link your library card, give your email at the loan desk. Then you see your loans here and can place holds.')}</p>
      )}
      {msg && <p role="status" style={{ fontSize: 14, margin: '8px 0 0' }}>{msg}</p>}

      <h3 style={h3}><BookOpen size={16} /> {t('معك الآن', 'Out to you now')}</h3>
      {me.loans.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t('لا شيء.', 'Nothing.')}</p> : me.loans.map(l => (
        <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, padding: '4px 0' }}>
          {book(l.record_id, l.record_title)}
          <span className={new Date(l.due_at) < new Date() ? '' : 'muted'} style={{ whiteSpace: 'nowrap', color: new Date(l.due_at) < new Date() ? '#b91c1c' : undefined }}>{t(`حتى ${fmtDate(l.due_at)}`, `due ${fmtDate(l.due_at)}`)}</span>
        </div>
      ))}

      <h3 style={h3}><CalendarClock size={16} /> {t('حجوزاتي', 'My holds')}</h3>
      {me.holds.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t('لا حجوزات. احجز من صفحة أي كتاب.', 'No holds. Place one from any book’s page.')}</p> : me.holds.map(h => (
        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, padding: '4px 0', alignItems: 'center' }}>
          <span style={{ minWidth: 0 }}>{book(h.record_id, h.record_title)}
            <span className="muted" style={{ display: 'block', fontSize: 12 }}>{h.status === 'ready' ? t(`جاهز للاستلام حتى ${fmtDate(h.expires_at)}`, `Ready to collect until ${fmtDate(h.expires_at)}`) : t('في الانتظار', 'Waiting')}</span></span>
          <button className="btn-ghost" disabled={busy} onClick={() => act(() => readerApi(`/holds/${h.id}`, { method: 'DELETE' }))}>{t('إلغاء', 'Cancel')}</button>
        </div>
      ))}

      <h3 style={h3}><History size={16} /> {t('سجل القراءة', 'Reading history')}</h3>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
        <input type="checkbox" checked={me.reader.keepHistory} disabled={busy} onChange={e => act(() => readerApi('/me', { method: 'PUT', body: { keepHistory: e.target.checked } }))} />
        {t('احتفظ بسجل ما أستعيره', 'Keep a list of what I borrow')}
      </label>
      {me.history.length === 0 ? <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>{me.reader.keepHistory ? t('ستظهر هنا الكتب التي تعيدها.', 'Books you return will appear here.') : t('السجل متوقف.', 'History is off.')}</p> : (
        <>
          {me.history.map(h => (
            <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, padding: '4px 0' }}>
              {book(h.record_id, h.title)}
              <span className="muted" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(h.returned_at)}</span>
            </div>
          ))}
          <button className="btn-ghost" disabled={busy} style={{ marginTop: 6, alignSelf: 'flex-start' }}
            onClick={() => window.confirm(t('مسح سجل القراءة كله؟ لا يمكن التراجع.', 'Clear your whole reading history? This cannot be undone.')) && act(() => readerApi('/history', { method: 'DELETE' }), t('مُسح السجل.', 'History cleared.'))}>
            <Trash2 size={14} /> {t('امسح السجل', 'Clear history')}
          </button>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        <button className="btn-ghost" onClick={() => signOut()}><LogOut size={14} /> {t('خروج', 'Sign out')}</button>
        <button className="btn-ghost" onClick={() => setDeleting(d => !d)}><Trash2 size={14} /> {t('احذف حسابي', 'Delete my account')}</button>
      </div>
      {deleting && (
        <form style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }} onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await readerApi('/me', { method: 'DELETE', body: { password } });
          setBusy(false);
          if (r.ok) forget(); else setMsg(readerError(r.data?.error));
        }}>
          <p style={{ margin: 0, fontSize: 13 }}>{t('يُحذف الحساب وسجل القراءة والكتب المحفوظة نهائيًا. اكتب كلمة المرور للتأكيد.', 'Your account, reading history and saved books are deleted for good. Type your password to confirm.')}</p>
          <input style={inputStyle} type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" dir="ltr" />
          <button className="btn-black" disabled={busy} style={{ justifyContent: 'center', background: '#b91c1c' }}>{t('احذف نهائيًا', 'Delete for good')}</button>
        </form>
      )}
    </div>
  );
}
