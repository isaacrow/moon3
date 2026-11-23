import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { UserAvatar } from './UserAvatar';
import { uploadAvatar, removeAvatar } from '../utils/avatars';
import { moonFetch } from '../utils/moonApi';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { useAuth, type AccountRole } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { LayoutDashboard, FilePlus, LogOut, Languages, ChevronLeft, Building2, Mail, ShieldCheck, Camera, ImageOff, Link2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import moonLogo from '../../assets/white.png';
import { TesterApprovalCenter } from './TesterApprovalCenter';
import { NotificationBell } from './NotificationBell';
import { SectionMenus, type SectionId, type Task } from './StudioSections';
import '../../styles/moon-space-theme.css';

interface TopNavBarProps {
  onDashboard: () => void;
  onNewRecord: () => void;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
  /** Show a back button instead of dashboard button */
  showBack?: boolean;
  onBack?: () => void;
  /** Opens a saved record in the editor (from a notification). */
  onOpenRecord?: (recordId: string) => void;
  /** The library section the current screen belongs to (highlighted in the menu). */
  currentSection?: SectionId;
  onOpenSection?: (id: SectionId) => void;
  onRunTask?: (task: Task) => void;
}

export function TopNavBar({ 
  onDashboard, 
  onNewRecord, 
  darkMode: _externalDarkMode, 
  onToggleDarkMode: _externalToggle,
  showBack,
  onBack,
  onOpenRecord,
  currentSection,
  onOpenSection,
  onRunTask,
}: TopNavBarProps) {
  const { t, i18n } = useTranslation();
  const {
    username,
    user,
    logout,
    isSuperAdmin,
    users: adminUsers,
    usersLoading,
    usersError,
    refreshUsers,
    approveUser,
    rejectUser,
    deleteUser,
    setUserRole,
    pendingCount,
  } = useAuth();
  const { darkMode } = useTheme();

  // Admin Approval Modal State
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [actionError, setActionError] = useState('');
  const [busyUser, setBusyUser] = useState<string | null>(null);

  useEffect(() => {
    if (showApprovalModal) {
      setActionError('');
      refreshUsers();
    }
  }, [showApprovalModal, refreshUsers]);

  const runAction = async (
    action: (uName: string) => Promise<{ success: boolean; message?: string }>,
    uName: string
  ) => {
    setActionError('');
    setBusyUser(uName);
    const res = await action(uName);
    setBusyUser(null);
    if (!res.success) setActionError(res.message || 'Action failed. Please try again.');
  };

  const handleApprove = (uName: string) => runAction(approveUser, uName);
  const handleSetRole = (uName: string, role: AccountRole) =>
    runAction((u: string) => setUserRole(u, role), uName);
  const handleReject = (uName: string) => runAction(rejectUser, uName);
  const handleDelete = (uName: string) => {
    const ar = i18n.language === 'ar';
    if (!window.confirm(ar ? `حذف حساب "${uName}"؟ لا يمكن التراجع عن ذلك.` : `Delete the account "${uName}"? This cannot be undone.`)) return;
    runAction(deleteUser, uName);
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ar' : 'en';
    i18n.changeLanguage(newLang);
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
  };

  // Super Admin: link the names and subjects of every saved record to the authority file (batch by batch).
  const [linking, setLinking] = useState(false);
  const handleLinkAllRecords = async () => {
    setLinking(true);
    const toastId = toast.loading('Linking names and subjects to the authority file…');
    let offset: number | null = 0, changed = 0, linked = 0, total = 0;
    const failed: string[] = [];
    try {
      while (offset !== null) {
        const { ok, data }: { ok: boolean; data: any } = await moonFetch<any>(`/authorities/link-records?offset=${offset}&limit=50`, { method: 'POST', body: {} });
        if (!ok) throw new Error(data?.error || 'The server refused the request.');
        changed += data.changed; linked += data.linked; total = data.total; failed.push(...(data.failed || []));
        offset = data.next;
        toast.loading(`Linking… ${Math.min(offset ?? total, total)} of ${total} records`, { id: toastId });
      }
      toast.success(`${linked} names and subjects linked in ${changed} of ${total} records`, {
        id: toastId, description: failed.length ? `Not changed (see the server log): ${failed.slice(0, 5).join(', ')}` : undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Linking failed', { id: toastId });
    } finally {
      setLinking(false);
    }
  };

  // Profile photo: chosen from the account menu, shrunk in the browser, saved on the server.
  const photoInput = useRef<HTMLInputElement>(null);
  const handlePhotoChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const name = user?.username || username;
    if (!file || !name) return;
    try {
      await uploadAvatar(name, file);
      toast.success(i18n.language === 'ar' ? 'تم حفظ صورتك الشخصية' : 'Profile photo saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The photo could not be saved.');
    }
  };
  const handleRemovePhoto = async () => {
    const name = user?.username || username;
    if (!name) return;
    try {
      await removeAvatar(name);
      toast.success(i18n.language === 'ar' ? 'تمت إزالة الصورة' : 'Profile photo removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The photo could not be removed.');
    }
  };

  const getUserInitials = () => {
    const name = user?.username || username;
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getUserColor = () => {
    const name = user?.username || username;
    if (!name) return '#6366f1';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f59e0b','#10b981','#06b6d4','#3b82f6'];
    return colors[Math.abs(hash) % colors.length];
  };

  const isDark = darkMode;

  return (
    <>
      <div
        className="sticky top-3 z-50 w-full max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-300"
      >
        <div
          className="liquid-glass-dock w-full justify-between px-5 py-2.5 rounded-full"
          style={{
            background: isDark
              ? 'rgba(15, 23, 42, 0.72)'
              : 'rgba(255, 255, 255, 0.65)',
            backdropFilter: 'blur(24px) saturate(170%)',
            WebkitBackdropFilter: 'blur(24px) saturate(170%)',
            border: isDark
              ? '1px solid rgba(255, 255, 255, 0.14)'
              : '1px solid rgba(255, 255, 255, 0.85)',
            boxShadow: isDark
              ? '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 1px 0 rgba(255, 255, 255, 0.2)'
              : '0 16px 40px rgba(15, 23, 42, 0.08), inset 0 1px 1px 0 rgba(255, 255, 255, 0.95)',
          }}
        >
          {/* Left: Logo + Brand */}
          <div className="flex items-center gap-3">
            {showBack && onBack ? (
              <motion.button
                onClick={onBack}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="liquid-glass-btn p-2 rounded-full mr-1 cursor-pointer"
                title="الرجوع للخلف"
              >
                <ChevronLeft className="h-4 w-4" />
              </motion.button>
            ) : null}
            <div className="flex items-center gap-2.5 cursor-pointer" onClick={onDashboard}>
              <div className="relative">
                <img
                  src={moonLogo}
                  alt="Moon Logo"
                  className="relative h-8 w-auto object-contain drop-shadow-[0_2px_8px_rgba(255,255,255,0.4)]"
                />
              </div>
              <div className="flex flex-col">
                <span
                  className="text-sm font-black tracking-tight"
                  style={{ color: isDark ? '#ffffff' : '#0f172a' }}
                >
                  Moon Studio
                </span>
                <span
                  className="text-[9px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: isDark ? 'rgba(255,255,255,0.45)' : '#64748b' }}
                >
                  BIBFRAME 3.0.1
                </span>
              </div>
            </div>
          </div>

          {/* Center: Essential Actions (Clean for testing) */}
          <div className="flex items-center gap-2">
            <motion.button
              onClick={onDashboard}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="liquid-glass-btn text-xs font-bold gap-1.5 cursor-pointer py-1.5 px-3.5"
            >
              <LayoutDashboard className="h-3.5 w-3.5 text-slate-600" />
              <span className="hidden sm:inline">{t('dashboard')}</span>
            </motion.button>

            {onOpenSection && onRunTask && (
              <SectionMenus
                isAr={i18n.language !== 'en'}
                isDark={isDark}
                isSuperAdmin={isSuperAdmin}
                current={currentSection}
                onOpenSection={onOpenSection}
                onRun={onRunTask}
              />
            )}

            <motion.button
              onClick={onNewRecord}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white cursor-pointer shadow-lg transition-all"
              // A solid blue pill: the white glass version was unreadable on the light page.
              style={{
                borderRadius: '120px',
                background: 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.45), inset 0 -2px 6px rgba(30, 58, 138, 0.45), 0 6px 18px rgba(29, 78, 216, 0.35)',
                border: '1px solid rgba(147, 197, 253, 0.7)',
                textShadow: '0 1px 1px rgba(30, 58, 138, 0.5)',
              }}
            >
              <FilePlus className="h-3.5 w-3.5 text-white" />
              <span className="hidden sm:inline font-black tracking-wide">{t('newRecord')}</span>
            </motion.button>

            {/* Admin Approvals Direct Button for Isaac */}
            {isSuperAdmin && (
              <motion.button
                onClick={() => setShowApprovalModal(true)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="liquid-glass-pill py-1.5 px-3.5 text-xs font-bold cursor-pointer flex items-center gap-2 border-amber-400/60 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-all shadow-sm"
                title="Review and approve tester access requests (Isaac Faleh)"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                <span className="hidden md:inline font-black">Tester Approvals</span>
                {pendingCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-black text-[10px] font-black animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </motion.button>
            )}
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2">

            {/* Language Toggle */}
            <motion.button
              onClick={toggleLanguage}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all cursor-pointer"
              style={{
                background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
                color: isDark ? 'rgba(255,255,255,0.70)' : '#6b7280',
              }}
              title={i18n.language === 'en' ? t('switchToArabic') : t('switchToEnglish')}
            >
              <Languages className="h-4 w-4" />
              <span className="text-xs font-bold">
                {i18n.language === 'en' ? 'ع' : 'EN'}
              </span>
            </motion.button>

            {/* Notifications */}
            {user && <NotificationBell isDark={isDark} onOpenRecord={onOpenRecord} />}

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 transition-all cursor-pointer"
                  style={{
                    background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)',
                    border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
                  }}
                >
                  <UserAvatar username={user?.username || username || 'User'} />
                  <div className="hidden md:flex flex-col items-start">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: isDark ? '#ffffff' : '#111827' }}
                    >
                      {user?.username || username || 'User'}
                    </span>
                    <span
                      className="text-[10px] font-medium uppercase tracking-wider"
                      style={{ color: isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af' }}
                    >
                      {user?.role === 'admin' ? 'Administrator' : 'Tester'}
                    </span>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64"
                style={{
                  background: isDark ? 'rgba(10,10,20,0.95)' : 'rgba(255,255,255,0.97)',
                  backdropFilter: 'blur(20px)',
                  border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.10)',
                  boxShadow: isDark ? '0 20px 60px rgba(0,0,0,0.8)' : '0 10px 40px rgba(0,0,0,0.15)',
                }}
              >
                <DropdownMenuLabel style={{ color: isDark ? '#ffffff' : '#111827' }}>
                  <div className="flex flex-col space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">{user?.username || username || 'User'}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500 font-bold uppercase">
                        {user?.role === 'admin' ? 'Admin' : 'Tester'}
                      </span>
                    </div>
                    <p className="text-xs flex items-center gap-1.5" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : '#6b7280' }}>
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{user?.email || (username ? `${username}@moon.local` : 'tester@moon.local')}</span>
                    </p>
                    <p className="text-xs flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400 font-medium">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{user?.institution || 'BIBFRAME Testing Group'}</span>
                    </p>
                  </div>
                </DropdownMenuLabel>

                {isSuperAdmin && (
                  <>
                    <DropdownMenuSeparator style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }} />
                    <DropdownMenuItem
                      onClick={() => setShowApprovalModal(true)}
                      className="cursor-pointer font-bold text-amber-400 hover:text-amber-300"
                    >
                      <ShieldCheck className="mr-2 h-4 w-4 text-amber-400" />
                      <span>Tester Approvals</span>
                      {pendingCount > 0 && (
                        <span className="ml-auto px-1.5 py-0.2 rounded bg-amber-400 text-black text-[10px] font-black">
                          {pendingCount}
                        </span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleLinkAllRecords}
                      disabled={linking}
                      className="cursor-pointer"
                      style={{ color: isDark ? '#ffffff' : '#111827' }}
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      <span>{i18n.language === 'ar' ? 'ربط كل التسجيلات بملف الاستناد' : 'Link all records to authorities'}</span>
                    </DropdownMenuItem>
                  </>
                )}

                <DropdownMenuSeparator style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }} />
                <DropdownMenuItem
                  onClick={() => photoInput.current?.click()}
                  className="cursor-pointer"
                  style={{ color: isDark ? '#ffffff' : '#111827' }}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  <span>{i18n.language === 'ar' ? 'تغيير الصورة الشخصية' : 'Change profile photo'}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleRemovePhoto}
                  className="cursor-pointer"
                  style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6b7280' }}
                >
                  <ImageOff className="mr-2 h-4 w-4" />
                  <span>{i18n.language === 'ar' ? 'إزالة الصورة' : 'Remove photo'}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }} />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer"
                  style={{ color: '#f87171' }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{t('logout')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handlePhotoChosen} />
          </div>
        </div>
      </div>

      {/* ===== TESTER APPROVAL CENTER (Super Admin) ===== */}
      <TesterApprovalCenter
        open={showApprovalModal}
        onClose={() => setShowApprovalModal(false)}
        users={adminUsers}
        loading={usersLoading}
        error={actionError || usersError}
        busyUser={busyUser}
        subtitle={i18n.language === 'ar' ? `مسجّل الدخول باسم ${username}` : `Signed in as ${username}`}
        onRefresh={() => refreshUsers()}
        onApprove={handleApprove}
        onReject={handleReject}
        onDelete={handleDelete}
        onSetRole={handleSetRole}
      />
    </>
  );
}
