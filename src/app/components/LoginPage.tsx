import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Lock,
  User,
  Mail,
  Building2,
  KeyRound,
  Eye,
  EyeOff,
  Languages,
  CheckCircle2,
  Clock,
  XCircle,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Mountain,
  Layers,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import moonLogoWhite from '../../assets/white.png';
import { TesterApprovalCenter } from './TesterApprovalCenter';
import { LiquidGlassLogo } from './liquid-glass-logo';
import MetallicPaint from './MetallicPaint';
import Topography from './Topography';
import GlassSurface from './GlassSurface';
import TiltedCard from './TiltedCard';
import LanyardPassOverlay from './LanyardPassOverlay';
import ClickSpark from './ClickSpark';
import Magnet from './Magnet';
import ShinyText from './ShinyText';
import { moonFetch } from '../utils/moonApi';

// Spline Scene URL - 3D interactive scene
const SPLINE_SCENE_URL = 'https://my.spline.design/3ddesigntextcopycopy-ICjwUjRH9s8O1NCNqRAWjo5g-5OJ/';

interface LoginPageProps {
  onLanguageChange: (lang: string) => void;
  currentLanguage: string;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
}

export function LoginPage({ onLanguageChange, currentLanguage }: LoginPageProps) {
  const isAr = currentLanguage === "ar";
  const { t } = useTranslation();
  const {
    login,
    signup,
    users: adminUsers,
    usersLoading,
    usersError,
    refreshUsers,
    unlockAdmin,
    approveUser,
    rejectUser,
    deleteUser,
  } = useAuth();

  // Login State
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // Sign Up / Tester Request State
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regInstitution, setRegInstitution] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regInviteCode, setRegInviteCode] = useState('');
  const [lanyardPass, setLanyardPass] = useState<{
    user: string;
    role?: string;
    institution?: string;
    type: 'login' | 'signup';
  } | null>(null);
  const [pendingLoginCredentials, setPendingLoginCredentials] = useState<{ id: string; pass: string } | null>(null);

  // Status & Feedback
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingApprovalInfo, setPendingApprovalInfo] = useState<{
    user: string;
    email: string;
    institution: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  // /moon/?signup=1 (the catalogue's "Sign up" button) opens on the sign-up tab.
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>(() => {
    try { return new URLSearchParams(window.location.search).has('signup') ? 'signup' : 'login'; } catch { return 'login'; }
  });
  const [showPassword, setShowPassword] = useState(false);

  // Admin Approval Modal State
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminUnlocking, setAdminUnlocking] = useState(false);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  // UI State
  const [isUiVisible, setIsUiVisible] = useState(true);

  // Wallpaper Option State (@react-bits/Topography vs Spline 3D)
  const [wallpaper, setWallpaper] = useState<'topography' | 'spline'>('topography');

  // Opening Animation State ("added a new anmioshons when open")
  const [showOpeningAnimation, setShowOpeningAnimation] = useState(true);
  const [openingKey, setOpeningKey] = useState(1);

  // Expose helper for testing the 3D Lanyard Pass
  useEffect(() => {
    (window as any).__triggerLanyardPass = (type: 'login' | 'signup' = 'login', customUser?: string) => {
      setLanyardPass({
        user: customUser || (type === 'login' ? 'Isaac Faleh' : 'Sarah Ahmed'),
        role: type === 'login' ? 'Super Administrator' : 'BIBFRAME Linked Data Tester',
        institution: isAr ? 'المركز الوطني للبيانات المترابطة' : 'National Library / Research Center',
        type,
      });
    };
    return () => {
      delete (window as any).__triggerLanyardPass;
    };
  }, [isAr]);

  useEffect(() => {
    if (showOpeningAnimation) {
      const timer = setTimeout(() => {
        setShowOpeningAnimation(false);
      }, 3400);
      return () => clearTimeout(timer);
    }
  }, [showOpeningAnimation, openingKey]);

  const handleReplayOpening = () => {
    setOpeningKey(k => k + 1);
    setShowOpeningAnimation(true);
  };

  const refreshAdminUsers = () => {
    setAdminError('');
    refreshUsers();
  };

  useEffect(() => {
    if (showAdminModal && isAdminUnlocked) {
      refreshUsers();
    }
  }, [showAdminModal, isAdminUnlocked, refreshUsers]);

  const handleAdminUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    setAdminUnlocking(true);
    const res = await unlockAdmin(adminPasscode);
    setAdminUnlocking(false);
    if (res.success) {
      setIsAdminUnlocked(true);
      setAdminPasscode('');
    } else {
      setAdminError(res.message || 'Invalid Super Admin credentials. Only Isaac Faleh can approve testers.');
    }
  };

  const runAdminAction = async (
    action: (username: string) => Promise<{ success: boolean; message?: string }>,
    username: string
  ) => {
    setAdminError('');
    setBusyUser(username);
    const res = await action(username);
    setBusyUser(null);
    if (!res.success) setAdminError(res.message || 'Action failed. Please try again.');
  };

  const handleApproveTester = (username: string) => runAdminAction(approveUser, username);
  const handleRejectTester = (username: string) => runAdminAction(rejectUser, username);
  const handleDeleteTester = (username: string) => {
    if (!window.confirm(`Delete the account "${username}"? This cannot be undone.`)) return;
    runAdminAction(deleteUser, username);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setPendingApprovalInfo(null);

    if (!identifier.trim()) {
      setError('Username or Email is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    setLoading(true);

    try {
      // First verify credentials to show 3D Lanyard ID Card
      const { data } = await moonFetch('/api/accounts/login', {
        body: { identifier: identifier.trim(), password },
      });

      if (data?.success && data.token && data.user) {
        // Successful login! Cache credentials & show 3D Lanyard Pass
        setPendingLoginCredentials({ id: identifier.trim(), pass: password });
        setLanyardPass({
          user: data.user.username,
          role: data.user.role === 'admin' ? 'Super Administrator' : 'BIBFRAME Linked Data Tester',
          institution: data.user.institution || (isAr ? 'المركز الوطني للبيانات المترابطة' : 'National Library / Research Center'),
          type: 'login',
        });
      } else {
        // Standard login error handling
        const res = await login(identifier, password);
        if (!res.success) {
          if (res.status === 'pending') {
            setError(
              res.message ||
                (isAr
                  ? 'حسابك قيد مراجعة المشرف إسحاق فالح. ستتمكن من تسجيل الدخول فور الموافقة.'
                  : 'Your account is awaiting approval by administrator Isaac Faleh. Once approved, you can sign in.')
            );
          } else {
            setError(res.message || (isAr ? 'بيانات الدخول غير صحيحة. يرجى التحقق.' : 'Invalid credentials. Please verify your username and password.'));
          }
        }
      }
    } catch (err) {
      const res = await login(identifier, password);
      if (!res.success) {
        setError(res.message || (isAr ? 'حدث خطأ أثناء تسجيل الدخول.' : 'An error occurred during login.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProceedFromLanyard = async () => {
    if (lanyardPass?.type === 'login' && pendingLoginCredentials) {
      await login(pendingLoginCredentials.id, pendingLoginCredentials.pass);
    } else if (lanyardPass?.type === 'signup') {
      setLanyardPass(null);
      setActiveTab('login');
      setIdentifier(regUsername);
    } else {
      setLanyardPass(null);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setPendingApprovalInfo(null);

    if (!regUsername.trim()) {
      setError('User / Username is required');
      return;
    }
    if (!regEmail.trim() || !regEmail.includes('@')) {
      setError('A valid Email address is required');
      return;
    }
    if (!regInstitution.trim()) {
      setError('Institution or Organization is required');
      return;
    }
    if (regPassword.length < 8) {
      setError(isAr ? 'كلمة المرور ٨ خانات على الأقل' : 'Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await signup({
        username: regUsername,
        email: regEmail,
        institution: regInstitution,
        password: regPassword,
        inviteCode: regInviteCode,
      });

      if (res.success) {
        if (res.status === 'pending') {
          setPendingApprovalInfo({
            user: regUsername,
            email: regEmail,
            institution: regInstitution,
          });
          setSuccess(
            res.message ||
              (isAr ? 'تم إرسال طلب التسجيل بنجاح! حسابك قيد مراجعة إسحاق فالح.' : 'Tester registration submitted! Your account is pending administrator approval (Isaac Faleh).')
          );
          setIdentifier(regUsername);
        } else {
          setSuccess(
            res.message ||
              (isAr ? 'تم اعتماد الحساب برمز الدعوة. يمكنك تسجيل الدخول الآن.' : 'Account approved with your invite code. You can sign in now.')
          );
          setIdentifier(regUsername);
          setPassword(regPassword);
          setActiveTab('login');
        }
      } else {
        setError(res.message || 'Failed to submit registration. Username or email may already exist.');
      }
    } catch (err) {
      setError('An error occurred during registration. Please try again.');
      console.error('Signup error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      {/* Ambient Background Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900/40 via-black to-black z-0" />

      {/* Dynamic Background: @react-bits/Topography vs Spline 3D Scene */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {wallpaper === 'topography' ? (
            <motion.div
              key="wallpaper-topography"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-0 z-0 pointer-events-auto"
            >
              <Topography
                color="#94a3b8"
                lineCount={26}
                lineWidth={0.85}
                elevation={1.0}
                tilt={26}
                speed={0.16}
                morph={0.2}
                glow={0.25}
                brightness={0.75}
                fog={0.42}
                mouseInteraction={true}
                hoverEffect="lift"
                clickEffect="pulse"
                className="w-full h-full"
              />
            </motion.div>
          ) : (
            <motion.div
              key="wallpaper-spline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-0 z-0"
              style={{ top: '-15%', height: '130%' }}
            >
              <iframe
                src={SPLINE_SCENE_URL}
                frameBorder="0"
                width="100%"
                height="100%"
                className="w-full h-full"
                title="Spline 3D Scene"
                allow="fullscreen; autoplay"
                style={{
                  pointerEvents: 'auto',
                  border: 'none',
                  background: 'transparent',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Grid Overlay Effect */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAyKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30 z-[1] pointer-events-none" />

      {/* Corner Accents */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-white/[0.07] to-transparent blur-3xl z-[1] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-tl from-white/[0.07] to-transparent blur-3xl z-[1] pointer-events-none" />

      {/* ===== OPENING METALLIC PAINT LOGO ANIMATION ("added a new anmioshons when open" & "it go down rather than up") ===== */}
      <AnimatePresence>
        {showOpeningAnimation && (
          <motion.div
            key={`metallic-opening-${openingKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(16px)' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-lg"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: -60 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-xl p-6 sm:p-8 flex flex-col items-center text-center relative overflow-hidden"
              style={{
                /* From https://css.glass */
                background: 'rgba(255, 255, 255, 0.47)',
                borderRadius: '16px',
                boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.96)',
              }}
              dir={isAr ? "rtl" : "ltr"}
            >
              {/* Specular silver liquid glass top sheen */}
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-white/90 to-transparent" />

              {/* Metallic Paint Logo Canvas */}
              <div
                style={{ width: 420, maxWidth: '85vw', aspectRatio: '1 / 1' }}
                className="relative flex items-center justify-center my-2 pointer-events-auto"
              >
                <MetallicPaint
                  imageSrc={moonLogoWhite}
                  scale={1}
                />
              </div>

              {/* Opening Typography */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="space-y-1.5"
              >
                <div className="flex items-center justify-center gap-2">
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    {isAr ? "محرر MOON" : "Moon Editor"}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-900/10 text-slate-800 border border-slate-900/15">
                    BIBFRAME 3.0.1
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-md mx-auto">
                  {isAr ? "بوابة البيانات المترابطة التجريبية • نظام الفهرسة المتطور" : "Linked Data Pilot Platform • Next-Gen Cataloging"}
                </p>
              </motion.div>

              {/* Continue / Skip Button */}
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                onClick={() => setShowOpeningAnimation(false)}
                className="mt-6 px-6 py-2.5 rounded-full text-xs font-black text-slate-800 hover:text-slate-950 bg-white/80 hover:bg-white border border-white/70 shadow-sm transition-all cursor-pointer flex items-center gap-2 hover:scale-105 active:scale-95"
              >
                <span>{isAr ? "الدخول إلى المحرر" : "Enter Moon Studio"}</span>
                <ArrowRight className={`w-3.5 h-3.5 ${isAr ? "rotate-180" : ""}`} />
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== TOP CENTER NOTCH (Yellow Annotation) ===== */}
      <AnimatePresence>
        {isUiVisible && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-40 pointer-events-auto"
            dir={isAr ? "rtl" : "ltr"}
          >
            <div
              className="flex items-center gap-3.5 py-2 px-5 sm:px-6 shadow-[0_8px_32px_rgba(0,0,0,0.18)] transition-all hover:py-2.5 group"
              style={{
                /* From https://css.glass */
                background: 'rgba(255, 255, 255, 0.47)',
                borderBottomLeftRadius: '20px',
                borderBottomRightRadius: '20px',
                borderTopLeftRadius: '0px',
                borderTopRightRadius: '0px',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.96)',
                borderTop: 'none',
              }}
            >
              {/* Moon Logo Jewel */}
              <div
                className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl overflow-hidden shrink-0 flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.1)] border border-white/90"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.55) 100%)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                }}
              >
                <div className="absolute inset-0 p-0.5 flex items-center justify-center">
                  <MetallicPaint
                    imageSrc={moonLogoWhite}
                    scale={1.1}
                  />
                </div>
                <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/60 to-transparent pointer-events-none" />
              </div>

              {/* Title & Description */}
              <div className={isAr ? "text-right" : "text-left"}>
                <h1 className="text-xs sm:text-sm font-black text-slate-900 leading-tight tracking-tight px-1">
                  {isAr ? "تصميم وتطوير: إسحاق فالح" : "DESIGN & DEVELOPED BY ISAAC FALEH"}
                </h1>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      

      {/* ===== BOTTOM CENTER CONTROLS DOCK (Orange Annotation) ===== */}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 pointer-events-auto"
        >
          {/* Wallpaper Toggle: One square that switches, no text, just icon */}
          <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setWallpaper(wallpaper === 'topography' ? 'spline' : 'topography')}
              className="text-slate-800 hover:text-slate-950 hover:bg-white/80 transition-all duration-200 cursor-pointer w-10 h-10 relative overflow-hidden"
              style={{
                /* From https://css.glass */
                background: 'rgba(255, 255, 255, 0.47)',
                borderRadius: '14px',
                boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.96)',
              }}
              title={
                wallpaper === 'topography'
                  ? (isAr ? "خلفية طبوغرافيا ثلاثية الأبعاد (انقر للتبديل إلى Spline 3D)" : "Topography 3D (Click to switch to Spline 3D)")
                  : (isAr ? "خلفية Spline 3D (انقر للتبديل إلى الطبوغرافيا)" : "Spline 3D (Click to switch to Topography)")
              }
            >
              <AnimatePresence mode="wait" initial={false}>
                {wallpaper === 'topography' ? (
                  <motion.div
                    key="topography"
                    initial={{ rotate: -30, opacity: 0, scale: 0.8 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    exit={{ rotate: 30, opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Mountain className="h-4 w-4 text-slate-900" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="spline"
                    initial={{ rotate: -30, opacity: 0, scale: 0.8 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    exit={{ rotate: 30, opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Layers className="h-4 w-4 text-slate-900" />
                  </motion.div>
                )}
              </AnimatePresence>
            </Button>
          </motion.div>

          {/* Replay Opening Metallic Paint Animation */}
          <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}>
            <Button
              variant="outline"
              size="icon"
              onClick={handleReplayOpening}
              className="text-slate-800 hover:text-slate-950 hover:bg-white/80 transition-all duration-200 cursor-pointer w-10 h-10"
              style={{
                /* From https://css.glass */
                background: 'rgba(255, 255, 255, 0.47)',
                borderRadius: '14px',
                boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.96)',
              }}
              title={isAr ? "إعادة تشغيل حركة الشعار المعدني" : "Replay Metallic Paint Reveal"}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </motion.div>

          {/* Language Switcher */}
          <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onLanguageChange(currentLanguage === 'en' ? 'ar' : 'en')}
              className="text-slate-800 hover:text-slate-950 hover:bg-white/80 transition-all duration-200 cursor-pointer w-10 h-10"
              style={{
                /* From https://css.glass */
                background: 'rgba(255, 255, 255, 0.47)',
                borderRadius: '14px',
                boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.96)',
              }}
              title="تبديل اللغة (Language)"
            >
              <Languages className="h-4 w-4" />
            </Button>
          </motion.div>

          {/* Hide/Show UI */}
          <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsUiVisible(!isUiVisible)}
              className="text-slate-800 hover:text-slate-950 hover:bg-white/80 transition-all duration-200 cursor-pointer w-10 h-10"
              style={{
                /* From https://css.glass */
                background: 'rgba(255, 255, 255, 0.47)',
                borderRadius: '14px',
                boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.96)',
              }}
              title={isUiVisible ? 'Hide UI overlay' : 'Show UI overlay'}
            >
              {isUiVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* Main Authentication Card */}
      <AnimatePresence>
        {isUiVisible && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.96 }}
            transition={{
              type: 'spring',
              damping: 24,
              stiffness: 180,
              delay: showOpeningAnimation ? 0 : 0.1,
            }}
            className="absolute top-[50%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none max-h-[94vh] overflow-y-auto py-3 px-3 w-full flex justify-center"
            dir={isAr ? "rtl" : "ltr"}
          >
            {/* Outer wrapper */}
            <div className="relative group/card w-[560px] md:w-[600px] max-w-[95vw]">
              <GlassSurface
                width="100%"
                height="auto"
                borderRadius={16}
                blur={20}
                backgroundOpacity={0.47}
                brightness={60}
                className="glass-surface--block w-[580px] max-w-[95vw] pointer-events-auto overflow-hidden relative shadow-[0_12px_45px_rgba(0,0,0,0.18)]"
                style={{
                  /* From https://css.glass */
                  background: 'rgba(255, 255, 255, 0.47)',
                  borderRadius: '16px',
                  boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255, 255, 255, 0.96)',
                }}
              >
                
                {/* Continuous liquid silver specular reflection on top border */}
                <motion.div
                  className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-white/95 to-transparent"
                  animate={{
                    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  style={{
                    backgroundSize: '250% 100%',
                  }}
                />

                {/* Inner specular top sheen */}
                <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-white/40 to-transparent pointer-events-none" />

                <CardHeader className="pb-3 pt-6 px-7 relative z-10">
                  <CardTitle className="text-2xl font-black tracking-tight flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.07 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={handleReplayOpening}
                        title={isAr ? "شعار قمر التفاعلي - انقر لإعادة حركة الافتتاح" : "Interactive Moon Chrome Emblem (Click to replay)"}
                        className="relative w-14 h-14 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center cursor-pointer transition-all duration-300 group shadow-[0_8px_24px_rgba(0,0,0,0.12)] border border-white/90"
                        style={{
                          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.78) 0%, rgba(255, 255, 255, 0.48) 100%)',
                          backdropFilter: 'blur(30px)',
                          WebkitBackdropFilter: 'blur(30px)',
                          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12), inset 0 1.5px 2px rgba(255, 255, 255, 1), inset 0 -1.5px 2px rgba(0, 0, 0, 0.06)',
                        }}
                      >
                        {/* Specular gloss top reflection */}
                        <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/70 to-transparent pointer-events-none rounded-t-2xl z-10" />

                        {/* Interactive Metallic Chrome Logo inside the Glass Jewel */}
                        <div className="absolute inset-0 p-1 flex items-center justify-center z-0">
                          <MetallicPaint
                            imageSrc={moonLogoWhite}
                            scale={1.2}
                          />
                        </div>

                        {/* Dynamic Shimmer Light Sweep across glass */}
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/50 to-transparent pointer-events-none z-20"
                          animate={{
                            transform: ['translateX(-120%) translateY(-120%)', 'translateX(120%) translateY(120%)'],
                          }}
                          transition={{
                            duration: 3.5,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            repeatDelay: 2,
                          }}
                        />
                      </motion.button>
                      <div>
                        <span className="text-slate-900 block font-black text-xl tracking-tight leading-tight">
                          {isAr ? "محرر MOON" : "Moon Editor"}
                        </span>
                        <span className="text-[10.5px] text-slate-700 font-bold tracking-wider uppercase block mt-0.5">
                          {isAr ? "بوابة البيانات المترابطة التجريبية ببفريم" : "BIBFRAME Linked Data Pilot Portal"}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onLanguageChange(isAr ? "en" : "ar")}
                      className="px-3.5 py-1.5 rounded-full text-xs font-black text-slate-800 bg-white/70 hover:bg-white border border-white/60 backdrop-blur-xl transition-all duration-200 cursor-pointer flex items-center gap-1.5 shadow-sm hover:border-slate-400 hover:shadow-md"
                    >
                      <Languages className="w-3.5 h-3.5 text-slate-800" />
                      <span>{isAr ? "EN" : "عربي"}</span>
                    </button>
                  </CardTitle>
                  <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-900/10">
                    <div className="overflow-hidden h-4 flex items-center">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.p
                          key={activeTab}
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          transition={{ duration: 0.22, ease: "easeOut" }}
                          className="text-slate-700 text-[11px] font-bold tracking-wide"
                        >
                          {activeTab === 'login' 
                            ? (isAr ? "تسجيل الدخول لتجربة المحرر" : "Sign In to Test Editor")
                            : (isAr ? "طلب حساب فاحص (يتطلب موافقة)" : "Request Access (Requires Approval)")}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                    <span className="text-[10.5px] text-slate-700 font-mono font-bold tracking-widest uppercase">
                      v3.0.1
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="px-7 pb-7 pt-2 relative z-10">
                  {/* Segmented @react-bits/GlassSurface Tab Switcher */}
                  <GlassSurface
                    width="100%"
                    height="auto"
                    borderRadius={16}
                    blur={16}
                    backgroundOpacity={0.47}
                    brightness={60}
                    className="glass-surface--block w-full mb-5"
                    style={{
                      /* From https://css.glass */
                      background: 'rgba(255, 255, 255, 0.47)',
                      borderRadius: '16px',
                      boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255, 255, 255, 0.96)',
                    }}
                  >
                    <div className="grid grid-cols-2 p-1 relative w-full">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('login');
                          setError('');
                          setSuccess('');
                          setPendingApprovalInfo(null);
                        }}
                        className={`relative z-10 py-2.5 px-3 rounded-xl text-xs font-black transition-colors duration-200 cursor-pointer flex items-center justify-center gap-2 ${
                          activeTab === 'login' ? 'text-slate-950' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {activeTab === 'login' && (
                          <motion.div
                            layoutId="cssGlassActiveTabPill"
                            className="absolute inset-0 bg-white/85 rounded-[12px] border border-white shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                        )}
                        <span className="relative z-10">{isAr ? "تسجيل الدخول" : "Sign In"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('signup');
                          setError('');
                          setSuccess('');
                          setPendingApprovalInfo(null);
                        }}
                        className={`relative z-10 py-2.5 px-3 rounded-xl text-xs font-black transition-colors duration-200 cursor-pointer flex items-center justify-center gap-2 ${
                          activeTab === 'signup' ? 'text-slate-950' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {activeTab === 'signup' && (
                          <motion.div
                            layoutId="cssGlassActiveTabPill"
                            className="absolute inset-0 bg-white/85 rounded-[12px] border border-white shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                        )}
                        <span className="relative z-10">{isAr ? "طلب الانضمام" : "Sign Up"}</span>
                      </button>
                    </div>
                  </GlassSurface>

                  {/* ===== TAB CONTENT ANIMATED CONTAINER WITH SMOOTH SLIDE & HEIGHT SPRING ===== */}
                  <motion.div
                    layout
                    transition={{
                      layout: { type: "spring", stiffness: 350, damping: 32 }
                    }}
                    className="relative"
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {activeTab === 'login' ? (
                        <motion.form
                          key="login-form"
                          onSubmit={handleLoginSubmit}
                          initial={{ opacity: 0, x: isAr ? 32 : -32, filter: 'blur(4px)' }}
                          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                          exit={{ opacity: 0, x: isAr ? -32 : 32, filter: 'blur(4px)' }}
                          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                          className="space-y-4"
                        >
                      <div className="space-y-1.5">
                        <Label className="text-slate-800 text-[11px] font-bold block" htmlFor="identifier">
                          {isAr ? "اسم المستخدم أو البريد الإلكتروني *" : "User or Email *"}
                        </Label>
                        <div className="relative group">
                          <User strokeWidth={2.5} className={`absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-3.5 h-4.5 w-4.5 text-slate-950 group-focus-within:text-black transition-colors duration-200`} />
                          <Input
                            id="identifier"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            className={`${isAr ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4 text-left'} h-11 text-slate-900 placeholder:text-slate-500 font-medium transition-all rounded-xl border focus-within:ring-2 focus-within:ring-slate-900/15`}
                            style={{
                              background: 'rgba(255, 255, 255, 0.47)',
                              borderRadius: '12px',
                              backdropFilter: 'blur(20px)',
                              WebkitBackdropFilter: 'blur(20px)',
                              border: '1px solid rgba(255, 255, 255, 0.96)',
                              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
                            }}
                            placeholder={isAr ? "اسم المستخدم أو البريد الإلكتروني" : "Username or email"}
                            disabled={loading}
                            dir={isAr ? "rtl" : "ltr"}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-slate-800 text-[11px] font-bold block" htmlFor="password">
                          {isAr ? "كلمة المرور *" : "Password *"}
                        </Label>
                        <div className="relative group">
                          <Lock strokeWidth={2.5} className={`absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-3.5 h-4.5 w-4.5 text-slate-950 group-focus-within:text-black transition-colors duration-200`} />
                          <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={`${isAr ? 'pr-10 pl-11 text-right' : 'pl-10 pr-11 text-left'} h-11 text-slate-900 placeholder:text-slate-500 font-medium transition-all rounded-xl border focus-within:ring-2 focus-within:ring-slate-900/15`}
                            style={{
                              background: 'rgba(255, 255, 255, 0.47)',
                              borderRadius: '12px',
                              backdropFilter: 'blur(20px)',
                              WebkitBackdropFilter: 'blur(20px)',
                              border: '1px solid rgba(255, 255, 255, 0.96)',
                              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
                            }}
                            placeholder={isAr ? "أدخل كلمة المرور" : "Enter password"}
                            disabled={loading}
                            dir={isAr ? "rtl" : "ltr"}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className={`absolute ${isAr ? 'left-3.5' : 'right-3.5'} top-3.5 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer`}
                            disabled={loading}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <AnimatePresence mode="wait">
                        {error && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="p-3.5 rounded-xl bg-rose-50/85 border border-rose-300/80 text-rose-900 text-xs backdrop-blur-xl leading-relaxed shadow-sm"
                          >
                            <div className="flex items-start gap-2.5">
                              <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                              <span className="font-medium">{error}</span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Sign In Submit Button */}
                      <motion.div whileHover={{ scale: loading ? 1 : 1.015 }} whileTap={{ scale: loading ? 1 : 0.98 }} className="pt-2">
                        <Button
                          type="submit"
                          disabled={loading}
                          className="w-full h-12 text-slate-950 font-black text-sm tracking-wider rounded-2xl shadow-none flex items-center justify-center gap-2.5 transition-all cursor-pointer hover:bg-white/70 active:scale-[0.99]"
                          style={{
                            /* From https://css.glass */
                            background: 'rgba(255, 255, 255, 0.47)',
                            borderRadius: '16px',
                            boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            border: '1px solid rgba(255, 255, 255, 0.96)',
                          }}
                        >
                          {loading ? (
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                              <span>{isAr ? "جارٍ التحقق..." : "Authenticating..."}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <ShinyText
                                text={isAr ? "تسجيل الدخول إلى محرر MOON" : "SIGN IN TO TEST MOON"}
                                color="#020617"
                                shineColor="#64748b"
                                speed={3}
                                className="font-black text-slate-950 text-sm tracking-wider"
                              />
                              <ArrowRight className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
                            </div>
                          )}
                        </Button>
                      </motion.div>
                    </motion.form>
                      ) : (
                        <motion.form
                          key="signup-form"
                          onSubmit={handleSignupSubmit}
                          initial={{ opacity: 0, x: isAr ? -32 : 32, filter: 'blur(4px)' }}
                          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                          exit={{ opacity: 0, x: isAr ? 32 : -32, filter: 'blur(4px)' }}
                          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                          className="space-y-3"
                        >
                      {/* Username */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Username */}
                        <div className="space-y-1">
                          <Label className="text-slate-800 text-[10.5px] font-bold block" htmlFor="regUsername">
                            {isAr ? "اسم المستخدم *" : "User / Username *"}
                          </Label>
                          <div className="relative group">
                            <User strokeWidth={2.5} className={`absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-2.5 h-4.5 w-4.5 text-slate-950 group-focus-within:text-black transition-colors`} />
                            <Input
                              id="regUsername"
                              value={regUsername}
                              onChange={(e) => setRegUsername(e.target.value)}
                              className={`${isAr ? 'pr-11 pl-4 text-right' : 'pl-11 pr-4 text-left'} h-10 text-slate-900 placeholder:text-slate-500 font-medium transition-all rounded-xl border focus-within:ring-2 focus-within:ring-slate-900/15`}
                              style={{
                                background: 'rgba(255, 255, 255, 0.47)',
                                borderRadius: '12px',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                border: '1px solid rgba(255, 255, 255, 0.96)',
                                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
                              }}
                              placeholder={isAr ? "مثال: سارة أحمد أو sahmed" : "e.g. Sarah Ahmed"}
                              disabled={loading}
                              dir={isAr ? "rtl" : "ltr"}
                              required
                            />
                          </div>
                        </div>

                        {/* Email */}
                        <div className="space-y-1">
                          <Label className="text-slate-800 text-[10.5px] font-bold block" htmlFor="regEmail">
                            {isAr ? "البريد الإلكتروني *" : "EMAIL ADDRESS *"}
                          </Label>
                          <div className="relative group">
                            <Mail strokeWidth={2.5} className={`absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-2.5 h-4.5 w-4.5 text-slate-950 group-focus-within:text-black transition-colors`} />
                            <Input
                              id="regEmail"
                              type="email"
                              value={regEmail}
                              onChange={(e) => setRegEmail(e.target.value)}
                              className={`${isAr ? 'pr-11 pl-4 text-right' : 'pl-11 pr-4 text-left'} h-10 text-slate-900 placeholder:text-slate-500 font-medium transition-all rounded-xl border focus-within:ring-2 focus-within:ring-slate-900/15`}
                              style={{
                                background: 'rgba(255, 255, 255, 0.47)',
                                borderRadius: '12px',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                border: '1px solid rgba(255, 255, 255, 0.96)',
                                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
                              }}
                              placeholder={isAr ? "مثال: sarah@library.iq" : "e.g. sarah@library.edu"}
                              disabled={loading}
                              dir={isAr ? "rtl" : "ltr"}
                              required
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Institution */}
                        <div className="space-y-1">
                          <Label className="text-slate-800 text-[10.5px] font-bold block" htmlFor="regInstitution">
                            {isAr ? "المؤسسة أو المكتبة أو الجامعة *" : "INSTITUTION / ORGANIZATION *"}
                          </Label>
                          <div className="relative group">
                            <Building2 strokeWidth={2.5} className={`absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-2.5 h-4.5 w-4.5 text-slate-950 group-focus-within:text-black transition-colors`} />
                            <Input
                              id="regInstitution"
                              value={regInstitution}
                              onChange={(e) => setRegInstitution(e.target.value)}
                              className={`${isAr ? 'pr-11 pl-4 text-right' : 'pl-11 pr-4 text-left'} h-10 text-slate-900 placeholder:text-slate-500 font-medium transition-all rounded-xl border focus-within:ring-2 focus-within:ring-slate-900/15`}
                              style={{
                                background: 'rgba(255, 255, 255, 0.47)',
                                borderRadius: '12px',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                border: '1px solid rgba(255, 255, 255, 0.96)',
                                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
                              }}
                              placeholder={isAr ? "مثال: مكتبة العتبة، جامعة بغداد" : "e.g. Library of Congress"}
                              disabled={loading}
                              dir={isAr ? "rtl" : "ltr"}
                              required
                            />
                          </div>
                        </div>

                        {/* Password */}
                        <div className="space-y-1">
                          <Label className="text-slate-800 text-[10.5px] font-bold block" htmlFor="regPassword">
                            {isAr ? "كلمة المرور (٦ خانات على الأقل) *" : "PASSWORD (MIN 6 CHARS) *"}
                          </Label>
                          <div className="relative group">
                            <Lock strokeWidth={2.5} className={`absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-2.5 h-4.5 w-4.5 text-slate-950 group-focus-within:text-black transition-colors`} />
                            <Input
                              id="regPassword"
                              type="password"
                              value={regPassword}
                              onChange={(e) => setRegPassword(e.target.value)}
                              className={`${isAr ? 'pr-11 pl-4 text-right' : 'pl-11 pr-4 text-left'} h-10 text-slate-900 placeholder:text-slate-500 font-medium transition-all rounded-xl border focus-within:ring-2 focus-within:ring-slate-900/15`}
                              style={{
                                background: 'rgba(255, 255, 255, 0.47)',
                                borderRadius: '12px',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                border: '1px solid rgba(255, 255, 255, 0.96)',
                                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
                              }}
                              placeholder={isAr ? "أنشئ كلمة المرور" : "Create password"}
                              disabled={loading}
                              dir={isAr ? "rtl" : "ltr"}
                              required
                            />
                          </div>
                        </div>
                      </div>

                      {/* Fast-Approval Bypass / Invite Code (Optional) */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-slate-800 text-[10.5px] font-bold flex items-center gap-1.5" htmlFor="regInviteCode">
                            <KeyRound className="w-3.5 h-3.5 text-slate-700" />
                            <span>{isAr ? "رمز الدعوة والتجاوز الفوري (اختياري)" : "INVITE / BYPASS CODE (OPTIONAL)"}</span>
                          </Label>
                          <span className="text-[9.5px] text-slate-700 font-bold px-2 py-0.5 rounded-full bg-white/70 border border-white shadow-xs">
                            {isAr ? "يعتمد الحساب فوراً" : "Approves account at once"}
                          </span>
                        </div>
                        <div className="relative group">
                          <KeyRound strokeWidth={2.5} className={`absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-2.5 h-4.5 w-4.5 text-slate-950 group-focus-within:text-black transition-colors`} />
                          <Input
                            id="regInviteCode"
                            value={regInviteCode}
                            onChange={(e) => setRegInviteCode(e.target.value)}
                            className={`${isAr ? 'pr-11 pl-4 text-right' : 'pl-11 pr-4 text-left'} h-10 text-slate-900 placeholder:text-slate-500 font-medium transition-all rounded-xl border focus-within:ring-2 focus-within:ring-slate-900/15`}
                            style={{
                              /* From https://css.glass */
                              background: 'rgba(255, 255, 255, 0.47)',
                              borderRadius: '12px',
                              backdropFilter: 'blur(20px)',
                              WebkitBackdropFilter: 'blur(20px)',
                              border: '1px solid rgba(255, 255, 255, 0.96)',
                              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
                            }}
                            placeholder={isAr ? "رمز الدعوة أو التجاوز إن كان متوفراً لديك" : "Invite or bypass code if available"}
                            disabled={loading}
                            dir={isAr ? "rtl" : "ltr"}
                          />
                        </div>
                      </div>

                      <AnimatePresence mode="wait">
                        {error && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="p-3.5 rounded-xl bg-rose-50/85 border border-rose-300/80 text-rose-900 text-xs backdrop-blur-xl leading-relaxed shadow-sm"
                          >
                            <div className="flex items-start gap-2.5">
                              <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                              <span className="font-medium">{error}</span>
                            </div>
                          </motion.div>
                        )}

                        {pendingApprovalInfo && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="p-4 rounded-2xl text-slate-900 text-xs backdrop-blur-xl space-y-2.5 shadow-sm"
                            style={{
                              background: 'rgba(255, 255, 255, 0.65)',
                              borderRadius: '16px',
                              border: '1px solid rgba(255, 255, 255, 0.96)',
                              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
                            }}
                          >
                            <div className="flex items-center gap-2 font-bold text-slate-900">
                              <Clock className="h-4 w-4 animate-spin text-slate-700" />
                              <span>{isAr ? "طلبك قيد المراجعة والموافقة" : "Awaiting Administrator Approval"}</span>
                            </div>
                            <div className="space-y-1 text-[11px] text-slate-700 bg-white/70 p-2.5 rounded-xl border border-slate-200 font-mono">
                              <div><span className="text-slate-500">User:</span> {pendingApprovalInfo.user}</div>
                              <div><span className="text-slate-500">Email:</span> {pendingApprovalInfo.email}</div>
                              <div><span className="text-slate-500">Institution:</span> {pendingApprovalInfo.institution}</div>
                            </div>
                            <p className="text-[11px] leading-relaxed text-slate-600">
                              {isAr
                                ? "تم إرسال طلبك إلى المشرف إسحاق فالح للموافقة الفورية من لوحة تحكم Moon Studio."
                                : "Your request has been dispatched to administrator Isaac Faleh for instant approval."}
                            </p>
                            <a
                              href={`mailto:eshak100falah@gmail.com?subject=${encodeURIComponent(`Moon Editor Access Request: ${pendingApprovalInfo.user}`)}&body=${encodeURIComponent(`Hello Isaac,\n\nA new tester has requested access to the Moon BIBFRAME Editor:\n\nUser: ${pendingApprovalInfo.user}\nEmail: ${pendingApprovalInfo.email}\nInstitution: ${pendingApprovalInfo.institution}\nSubmitted At: ${new Date().toLocaleString()}\n\nPlease approve this request from your Admin account in Moon Studio.\n\nThank you!`)}`}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-b from-slate-900 to-black hover:from-slate-800 hover:to-slate-950 text-white text-xs font-black transition-all shadow-md cursor-pointer w-full"
                            >
                              <Mail className="h-3.5 w-3.5" />
                              <span>{isAr ? "إرسال إشعار للمشرف عبر البريد" : "Send Email Notification to Isaac"}</span>
                            </a>
                          </motion.div>
                        )}

                        {success && !pendingApprovalInfo && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-3.5 rounded-xl bg-emerald-50/85 border border-emerald-300/80 text-emerald-900 text-xs backdrop-blur-xl flex items-start gap-2.5 shadow-sm"
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                            <span className="font-medium">{success}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Sign Up Submit Button */}
                      <motion.div whileHover={{ scale: loading ? 1 : 1.015 }} whileTap={{ scale: loading ? 1 : 0.98 }} className="pt-2">
                        <Button
                          type="submit"
                          disabled={loading}
                          className="w-full h-12 text-slate-950 font-black text-sm tracking-wider rounded-2xl shadow-none flex items-center justify-center gap-2.5 transition-all cursor-pointer hover:bg-white/70 active:scale-[0.99]"
                          style={{
                            /* From https://css.glass */
                            background: 'rgba(255, 255, 255, 0.47)',
                            borderRadius: '16px',
                            boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            border: '1px solid rgba(255, 255, 255, 0.96)',
                          }}
                        >
                          {loading ? (
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                              <span>{isAr ? "جارٍ الإرسال..." : "Submitting..."}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <ShinyText
                                text={isAr ? "إرسال طلب الانضمام" : "Submit Access Request"}
                                color="#020617"
                                shineColor="#64748b"
                                speed={3}
                                className="font-black text-slate-950 text-sm tracking-wider"
                              />
                              <ArrowRight className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
                            </div>
                          )}
                        </Button>
                      </motion.div>
                    </motion.form>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  <div className="mt-5 pt-3.5 border-t border-slate-900/10 flex items-center justify-between text-[10.5px] text-slate-500 tracking-wider">
                    <span className="font-semibold text-slate-700">BIBFRAME 3.0.1</span>
                    <span className="text-[10.5px] text-slate-800 font-mono font-bold">MOON ENGINE</span>
                  </div>
                </CardContent>
              </GlassSurface>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== TESTER APPROVAL CENTER (admin password first) ===== */}
      <TesterApprovalCenter
        open={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        users={adminUsers}
        loading={usersLoading}
        error={adminError || usersError}
        busyUser={busyUser}
        onRefresh={refreshAdminUsers}
        onApprove={handleApproveTester}
        onReject={handleRejectTester}
        onDelete={handleDeleteTester}
        lockedContent={isAdminUnlocked ? undefined : (
          <form onSubmit={handleAdminUnlock} className="max-w-sm mx-auto py-8 space-y-4 text-center">
            <div
              className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-amber-200"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.32), rgba(255,255,255,0.10))',
                border: '1px solid rgba(255,255,255,0.45)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 8px 24px rgba(0,0,0,0.25)',
              }}
            >
              <Lock className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-bold text-white">{isAr ? 'تحقق المشرف العام' : 'Super Admin verification'}</h3>
            <p className="text-xs text-white/70">
              {isAr ? 'أدخل كلمة مرور المشرف العام لمراجعة طلبات الفاحصين.' : "Enter the Super Admin password to review tester requests."}
            </p>
            <input
              type="password"
              value={adminPasscode}
              onChange={(e) => setAdminPasscode(e.target.value)}
              placeholder={isAr ? 'كلمة مرور المشرف العام' : 'Super Admin password'}
              className="w-full h-12 px-4 text-center text-base tracking-widest text-white placeholder:text-white/50 outline-none focus:ring-2 focus:ring-white/40"
              style={{
                borderRadius: 16,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08))',
                border: '1px solid rgba(255,255,255,0.4)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
              }}
              autoFocus
            />
            {adminError && <p className="text-xs text-rose-200">{adminError}</p>}
            <button
              type="submit"
              disabled={adminUnlocking || !adminPasscode}
              className="w-full h-11 font-black text-sm text-amber-950 rounded-full hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              style={{
                background: 'linear-gradient(180deg, #fde68a 0%, #fbbf24 55%, #f59e0b 100%)',
                border: '1px solid rgba(254,243,199,0.9)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -2px 6px rgba(180,83,9,0.35), 0 8px 20px rgba(245,158,11,0.35)',
              }}
            >
              {adminUnlocking ? (isAr ? 'جارٍ التحقق…' : 'Verifying…') : (isAr ? 'فتح مركز الاعتماد' : 'Open the Approval Center')}
            </button>
          </form>
        )}
      />
    {/* ===== 3D INTERACTIVE LANYARD PASS OVERLAY (On Login & Signup) ===== */}
      <AnimatePresence>
        {lanyardPass && (
          <LanyardPassOverlay
            user={lanyardPass.user}
            role={lanyardPass.role}
            institution={lanyardPass.institution}
            type={lanyardPass.type}
            isAr={isAr}
            onProceed={handleProceedFromLanyard}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
