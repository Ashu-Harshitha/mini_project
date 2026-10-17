import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  Sprout, 
  Sparkles, 
  UserCheck, 
  Languages, 
  Eye, 
  EyeOff, 
  Moon, 
  Sun, 
  Globe, 
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Check
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore, type UserRole } from '@/store/useAppStore';
import { 
  auth, 
  isFirebaseConfigured, 
  signInWithEmailAndPassword 
} from '@/lib/firebase';
import { authApi } from '@/api/authApi';

const AUTH_DOMAIN = import.meta.env.VITE_AUTH_EMAIL_DOMAIN || 'agriadvisor.app';
const SHOW_DEMO_LOGINS = import.meta.env.VITE_SHOW_DEMO_LOGINS === 'true';

const signInSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_.]+$/, 'Letters, digits, underscores, or periods only'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerSchema = z
  .object({
    fullName: z.string().min(2, 'Please enter your full name'),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(20, 'Username must be at most 20 characters')
      .regex(/^[a-zA-Z0-9_.]+$/, 'Letters, digits, underscores, or periods only'),
    email: z.string().email('Invalid email address').optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Confirm your password'),
    language: z.enum(['en', 'hi', 'kn']),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type SignInFormData = z.infer<typeof signInSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;

export const LandingPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthResolved, setUser, theme, toggleTheme, setLanguage } = useAppStore();

  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  const fromLocation = (location.state as any)?.from?.pathname;

  // React Hook Form for Sign In
  const {
    register: registerSignIn,
    handleSubmit: handleSignInSubmit,
    setValue: setSignInValue,
    formState: { errors: signInErrors },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  // React Hook Form for Register (Farmer only)
  const {
    register: registerSignUp,
    handleSubmit: handleSignUpSubmit,
    formState: { errors: signUpErrors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      username: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      language: (i18n.language as any) || 'en',
    },
  });

  // Authenticated users opening "/" are redirected by role
  if (isAuthResolved && user) {
    if (fromLocation) {
      return <Navigate to={fromLocation} replace />;
    }
    if (user.role === 'agronomist') {
      return <Navigate to="/review-queue" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  const mapErrorMessage = (err: any): string => {
    const code = err?.code || '';
    const message = err?.message || '';

    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/user-not-found' ||
      code === 'auth/wrong-password' ||
      message.includes('401')
    ) {
      return t('auth.invalidCredentials', 'Invalid username or password');
    }
    if (code === 'auth/too-many-requests') {
      return t('auth.tooManyAttempts', 'Too many attempts, try again later');
    }
    if (code === 'auth/network-request-failed' || message.includes('Failed to fetch')) {
      return t('auth.networkError', 'Cannot reach the server');
    }
    if (message.includes('409') || message.toLowerCase().includes('already taken')) {
      return t('auth.usernameTaken', 'Username already taken');
    }
    if (message.includes('429')) {
      return t('auth.tooManyRegistrations', 'Too many attempts, try again in a minute');
    }
    return err?.message || t('auth.genericError', 'An error occurred during authentication.');
  };

  const handleAfterLoginSuccess = async () => {
    try {
      const me = await authApi.getMe();
      const initials = (me.full_name || me.username || 'User')
        .split(' ')
        .map((s) => s[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      setUser({
        id: me.id,
        uid: auth?.currentUser?.uid || `usr-${me.username}`,
        username: me.username,
        email: me.email || auth?.currentUser?.email || '',
        displayName: me.full_name || me.username,
        role: me.role as UserRole,
        language: me.language as 'en' | 'hi' | 'kn',
        phone: me.phone || '',
        avatarInitials: initials || 'U',
      });

      if (me.language) {
        setLanguage(me.language as any);
      }

      if (fromLocation) {
        navigate(fromLocation, { replace: true });
        return;
      }

      if (me.role === 'agronomist') {
        navigate('/review-queue', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err: any) {
      setErrorMessage(mapErrorMessage(err));
    }
  };

  const onSignIn = async (data: SignInFormData) => {
    setLoading(true);
    setErrorMessage(null);

    if (!isFirebaseConfigured || !auth) {
      setErrorMessage(t('auth.firebaseNotConfigured', 'Firebase is not configured'));
      setLoading(false);
      return;
    }

    try {
      const email = `${data.username.trim().toLowerCase()}@${AUTH_DOMAIN}`;
      await signInWithEmailAndPassword(auth, email, data.password);
      await handleAfterLoginSuccess();
    } catch (err: any) {
      setErrorMessage(mapErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async (data: RegisterFormData) => {
    setLoading(true);
    setErrorMessage(null);

    if (!isFirebaseConfigured || !auth) {
      setErrorMessage(t('auth.firebaseNotConfigured', 'Firebase is not configured'));
      setLoading(false);
      return;
    }

    try {
      // 1. Call backend registration (farmer only)
      await authApi.register({
        full_name: data.fullName,
        username: data.username.trim().toLowerCase(),
        password: data.password,
        email: data.email ? data.email : undefined,
        phone: data.phone ? data.phone : undefined,
        language: data.language,
      });

      // 2. Immediately sign in with Firebase
      const email = `${data.username.trim().toLowerCase()}@${AUTH_DOMAIN}`;
      await signInWithEmailAndPassword(auth, email, data.password);

      // 3. Populate store and navigate to dashboard
      await handleAfterLoginSuccess();
    } catch (err: any) {
      setErrorMessage(mapErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = (username: string) => {
    setTab('signin');
    setSignInValue('username', username, { shouldValidate: true });
    setSignInValue('password', '123456', { shouldValidate: true });
    setErrorMessage(null);
  };

  const languages = [
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिंदी (Hindi)' },
    { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  ];

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      {/* Top Bar for Language & Theme */}
      <header className="w-full flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-800 text-white flex items-center justify-center shadow-md">
            <Sprout className="w-5 h-5 text-emerald-300" />
          </div>
          <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white">
            AgriAdvisor AI
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Language selector */}
          <div className="relative">
            <button
              type="button"
              id="lang-picker-btn"
              onClick={() => setLangDropdownOpen(!langDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-xs font-medium text-slate-700 dark:text-slate-200 transition"
              aria-label="Change language"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{languages.find((l) => l.code === i18n.language)?.label || 'English'}</span>
            </button>

            {langDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1 z-50 text-xs">
                {languages.map((lng) => (
                  <button
                    key={lng.code}
                    type="button"
                    onClick={() => {
                      setLanguage(lng.code as any);
                      setLangDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-emerald-50 dark:hover:bg-emerald-950/40 ${
                      i18n.language === lng.code
                        ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span>{lng.label}</span>
                    {i18n.language === lng.code && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dark / Light toggle */}
          <button
            type="button"
            id="theme-toggle-btn"
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 transition"
            aria-label="Toggle dark mode"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col md:flex-row items-stretch max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 gap-8 items-center justify-center">
        {/* Left Column: Dark Green Branding Panel (Desktop) / Compact Header (Mobile) */}
        <div className="w-full md:w-1/2 rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-950 text-white p-6 sm:p-8 md:p-12 shadow-2xl flex flex-col justify-between border border-emerald-800/40 relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-emerald-600/10 blur-3xl pointer-events-none" />

          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-800/60 border border-emerald-700/60 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-6">
              <Sprout className="w-3.5 h-3.5" />
              <span>Smart Agriculture Decision Support</span>
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight leading-tight text-white">
              AgriAdvisor AI
            </h1>
            <p className="mt-3 text-sm md:text-base text-emerald-100/90 leading-relaxed font-medium">
              {t('auth.landingTagline', 'AI-assisted crop advice, reviewed by experts')}
            </p>

            {/* 3 Short Feature Rows with Icons */}
            <div className="mt-8 md:mt-12 space-y-5">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-800/80 border border-emerald-700/60 flex items-center justify-center flex-shrink-0 text-emerald-300 shadow-sm">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-white">
                    {t('auth.feature1', 'AI crop diagnosis from photos')}
                  </h3>
                  <p className="text-[11px] text-emerald-200/80 mt-0.5">
                    Instant multimodal vision analysis for deficiency and pest detection.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-800/80 border border-emerald-700/60 flex items-center justify-center flex-shrink-0 text-emerald-300 shadow-sm">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-white">
                    {t('auth.feature2', 'Expert agronomist review')}
                  </h3>
                  <p className="text-[11px] text-emerald-200/80 mt-0.5">
                    Certified specialists verify every critical recommendation before action.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-800/80 border border-emerald-700/60 flex items-center justify-center flex-shrink-0 text-emerald-300 shadow-sm">
                  <Languages className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-white">
                    {t('auth.feature3', 'Advice in your language with voice')}
                  </h3>
                  <p className="text-[11px] text-emerald-200/80 mt-0.5">
                    Clear guidance synthesized in English, Hindi, and Kannada with audio readouts.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-emerald-800/50 flex items-center gap-2 text-emerald-300/80 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>EPA & university extension compliant agronomic safety protocols</span>
          </div>
        </div>

        {/* Right Column: Centered Login Card */}
        <div className="w-full md:w-1/2 max-w-md mx-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl relative">
            {/* Inline warning banner if Firebase is unconfigured */}
            {!isFirebaseConfigured && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>{t('auth.firebaseNotConfigured', 'Firebase is not configured')}</span>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Tabs: Sign in vs Create farmer account */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6">
              <button
                type="button"
                id="tab-signin"
                onClick={() => {
                  setTab('signin');
                  setErrorMessage(null);
                }}
                className={`flex-1 pb-3 text-xs sm:text-sm font-semibold border-b-2 text-center transition ${
                  tab === 'signin'
                    ? 'border-emerald-700 text-emerald-800 dark:text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                {t('auth.signIn', 'Sign in')}
              </button>
              <button
                type="button"
                id="tab-register"
                onClick={() => {
                  setTab('register');
                  setErrorMessage(null);
                }}
                className={`flex-1 pb-3 text-xs sm:text-sm font-semibold border-b-2 text-center transition ${
                  tab === 'register'
                    ? 'border-emerald-700 text-emerald-800 dark:text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                {t('auth.createAccount', 'Create farmer account')}
              </button>
            </div>

            {/* TAB 1: SIGN IN FORM */}
            {tab === 'signin' && (
              <form onSubmit={handleSignInSubmit(onSignIn)} className="space-y-4 text-xs">
                <div>
                  <label htmlFor="signin-username" className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    {t('auth.username', 'Username')}
                  </label>
                  <input
                    id="signin-username"
                    type="text"
                    autoComplete="username"
                    {...registerSignIn('username')}
                    placeholder="e.g. farmer or dr_chen"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white px-3.5 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition"
                  />
                  {signInErrors.username && (
                    <p className="text-rose-500 text-[11px] mt-1">{signInErrors.username.message}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="signin-password" className="block text-slate-700 dark:text-slate-300 font-medium">
                      {t('auth.password', 'Password')}
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      id="signin-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      {...registerSignIn('password')}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white pl-3.5 pr-10 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      tabIndex={-1}
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {signInErrors.password && (
                    <p className="text-rose-500 text-[11px] mt-1">{signInErrors.password.message}</p>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                  {t('auth.forgotPassword', 'Forgot password? Contact your administrator.')}
                </div>

                <button
                  type="submit"
                  id="btn-sign-in"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl font-semibold text-xs text-white bg-emerald-800 hover:bg-emerald-900 shadow-md transition disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {loading ? (
                    <span>Signing in...</span>
                  ) : (
                    <>
                      <span>{t('auth.signIn', 'Sign in')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* TAB 2: CREATE FARMER ACCOUNT FORM */}
            {tab === 'register' && (
              <form onSubmit={handleSignUpSubmit(onRegister)} className="space-y-3.5 text-xs">
                <div>
                  <label htmlFor="register-fullname" className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    {t('auth.fullName', 'Full name')}
                  </label>
                  <input
                    id="register-fullname"
                    type="text"
                    autoComplete="name"
                    {...registerSignUp('fullName')}
                    placeholder="e.g. James Donovan"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white px-3.5 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition"
                  />
                  {signUpErrors.fullName && (
                    <p className="text-rose-500 text-[11px] mt-1">{signUpErrors.fullName.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="register-username" className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    {t('auth.username', 'Username')}
                  </label>
                  <input
                    id="register-username"
                    type="text"
                    autoComplete="username"
                    {...registerSignUp('username')}
                    placeholder="3-20 lowercase letters, digits, _, ."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white px-3.5 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition"
                  />
                  {signUpErrors.username && (
                    <p className="text-rose-500 text-[11px] mt-1">{signUpErrors.username.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="register-email" className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                      {t('auth.contactEmail', 'Email (optional)')}
                    </label>
                    <input
                      id="register-email"
                      type="email"
                      autoComplete="email"
                      {...registerSignUp('email')}
                      placeholder="farmer@domain.com"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white px-3.5 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition"
                    />
                    {signUpErrors.email && (
                      <p className="text-rose-500 text-[11px] mt-1">{signUpErrors.email.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="register-phone" className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                      {t('auth.phone', 'Phone (optional)')}
                    </label>
                    <input
                      id="register-phone"
                      type="tel"
                      autoComplete="tel"
                      {...registerSignUp('phone')}
                      placeholder="+1 (555) 000-0000"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white px-3.5 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="register-language" className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    {t('auth.preferredLanguage', 'Preferred language')}
                  </label>
                  <select
                    id="register-language"
                    {...registerSignUp('language')}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white px-3.5 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition"
                  >
                    <option value="en">English</option>
                    <option value="hi">हिंदी (Hindi)</option>
                    <option value="kn">ಕನ್ನಡ (Kannada)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="register-password" className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                      {t('auth.password', 'Password')}
                    </label>
                    <div className="relative">
                      <input
                        id="register-password"
                        type={showRegisterPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        {...registerSignUp('password')}
                        placeholder="••••••••"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white pl-3 pr-8 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        tabIndex={-1}
                      >
                        {showRegisterPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {signUpErrors.password && (
                      <p className="text-rose-500 text-[11px] mt-1">{signUpErrors.password.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="register-confirm-password" className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                      {t('auth.confirmPassword', 'Confirm password')}
                    </label>
                    <div className="relative">
                      <input
                        id="register-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        {...registerSignUp('confirmPassword')}
                        placeholder="••••••••"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white pl-3 pr-8 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {signUpErrors.confirmPassword && (
                      <p className="text-rose-500 text-[11px] mt-1">{signUpErrors.confirmPassword.message}</p>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  id="btn-create-account"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl font-semibold text-xs text-white bg-emerald-800 hover:bg-emerald-900 shadow-md transition disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {loading ? (
                    <span>Creating account...</span>
                  ) : (
                    <>
                      <span>{t('auth.createAccount', 'Create farmer account')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Note under the card */}
            <p className="mt-5 text-[11px] text-slate-400 text-center leading-relaxed">
              {t(
                'auth.staffNote',
                'Agronomist or admin? Sign in with the account provided by your administrator.'
              )}
            </p>

            {/* Demo fills if enabled */}
            {SHOW_DEMO_LOGINS && (
              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center mb-2">
                  Demo Fast Credentials
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleFillDemo('farmer')}
                    className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-[11px] font-medium text-slate-700 dark:text-slate-300 text-center transition"
                  >
                    Farmer
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFillDemo('agronomist')}
                    className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-[11px] font-medium text-slate-700 dark:text-slate-300 text-center transition"
                  >
                    Agronomist
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFillDemo('admin')}
                    className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-[11px] font-medium text-slate-700 dark:text-slate-300 text-center transition"
                  >
                    Admin
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-4 px-6 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400 bg-white/50 dark:bg-slate-900/50">
        <p>
          {t(
            'auth.disclaimer',
            'AgriAdvisor is a decision-support tool, not a replacement for licensed agronomic advice.'
          )}
        </p>
      </footer>
    </div>
  );
};
