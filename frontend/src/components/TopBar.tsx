import React, { useState, useRef, useEffect } from 'react';
import { 
  Bell, 
  Moon, 
  Sun, 
  ChevronDown, 
  Globe, 
  Wifi, 
  WifiOff, 
  Scale, 
  Check, 
  UserCheck, 
  Menu,
  ShieldCheck,
  Sprout,
  KeyRound,
  LogOut,
  X,
  Lock
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore, type UserRole } from '@/store/useAppStore';
import { mockFarms } from '@/mocks/data';
import { useNotifications } from '@/hooks/useNotifications';
import { modelsApi } from '@/api/modelsApi';
import { 
  auth, 
  fbSignOut, 
  EmailAuthProvider, 
  reauthenticateWithCredential, 
  updatePassword 
} from '@/lib/firebase';

interface TopBarProps {
  onMobileMenuToggle?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onMobileMenuToggle }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const {
    theme,
    toggleTheme,
    currentFarm,
    setCurrentFarm,
    currentModel,
    setCurrentModel,
    unitSystem,
    setUnitSystem,
    user,
    setUser,
    switchRole,
    isOnline,
    offlineCount,
  } = useAppStore();

  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const [farmDropdownOpen, setFarmDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  // Change password modal states
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const farmRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    if (!currentPassword || !newPassword) {
      setPasswordError(t('auth.allFieldsRequired', 'Please fill in all fields'));
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError(t('auth.passwordTooShort', 'New password must be at least 6 characters'));
      return;
    }
    if (!auth || !auth.currentUser || !auth.currentUser.email) {
      setPasswordError(t('auth.sessionMissing', 'No active authenticated session found.'));
      return;
    }

    setPasswordLoading(true);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      setPasswordSuccess(t('auth.passwordUpdated', 'Password updated successfully!'));
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => {
        setIsChangePasswordOpen(false);
        setPasswordSuccess(null);
      }, 1500);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setPasswordError(t('auth.wrongCurrentPassword', 'Incorrect current password'));
      } else if (code === 'auth/too-many-requests') {
        setPasswordError(t('auth.tooManyAttempts', 'Too many attempts, try again later'));
      } else {
        setPasswordError(err.message || t('auth.genericPasswordError', 'Failed to update password'));
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      if (auth) {
        await fbSignOut(auth);
      }
    } catch (err) {
      console.warn('Sign out error:', err);
    } finally {
      setUser(null);
      setProfileDropdownOpen(false);
      navigate('/');
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (farmRef.current && !farmRef.current.contains(e.target as Node)) setFarmDropdownOpen(false);
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelDropdownOpen(false);
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangDropdownOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifDropdownOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [liveModels, setLiveModels] = useState<Array<{ id: string; name: string; model_key: string }>>([
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', model_key: 'gemini-2.5-flash-lite' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', model_key: 'gemini-2.5-flash' },
  ]);

  useEffect(() => {
    modelsApi.getLiveModels().then((data) => {
      if (data && data.live_models && data.live_models.length > 0) {
        setLiveModels(data.live_models.map((m) => ({ id: m.id, name: m.name, model_key: m.model_key || m.id })));
        if (data.active_model) {
          const matched = data.live_models.find((m) => (m.model_key || m.id) === data.active_model || m.name.toLowerCase() === data.active_model.toLowerCase());
          if (matched) {
            setCurrentModel(matched.name);
          }
        }
      }
    }).catch(() => {});
  }, [setCurrentModel]);

  const handleModelChange = async (m: { id: string; name: string; model_key: string }) => {
    setCurrentModel(m.name);
    setModelDropdownOpen(false);
    try {
      await modelsApi.setActiveModel(m.model_key);
    } catch (err) {
      console.warn('Could not persist active model to backend settings:', err);
    }
  };

  const languages = [
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिंदी (Hindi)' },
    { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  ];

  return (
    <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between">
      {/* Left controls */}
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={onMobileMenuToggle}
          className="md:hidden p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Toggle mobile menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Farm Switcher Dropdown */}
        <div className="relative" ref={farmRef}>
          <button
            type="button"
            onClick={() => setFarmDropdownOpen(!farmDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 transition"
          >
            <span className="w-4 h-4 rounded-sm bg-emerald-700 text-white flex items-center justify-center font-bold text-[10px]">
              {currentFarm.name.charAt(0)}
            </span>
            <span>{currentFarm.name}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {farmDropdownOpen && (
            <div className="absolute left-0 mt-1.5 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1 z-50 text-xs">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Select Active Farm
              </div>
              {mockFarms.map((farm) => (
                <button
                  key={farm.id}
                  onClick={() => {
                    setCurrentFarm(farm);
                    setFarmDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-emerald-50 dark:hover:bg-emerald-950/40 ${
                    currentFarm.id === farm.id
                      ? 'font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50/50'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div>
                    <div>{farm.name}</div>
                    <div className="text-[10px] text-slate-400">{farm.location}</div>
                  </div>
                  {currentFarm.id === farm.id && <Check className="w-4 h-4 text-emerald-600" />}
                </button>
              ))}
              <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
                <Link
                  to="/settings"
                  onClick={() => setFarmDropdownOpen(false)}
                  className="w-full px-3 py-1.5 text-left text-emerald-700 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium flex items-center gap-1.5"
                >
                  <span>+ Manage Farms</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Model Dropdown */}
        <div className="relative" ref={modelRef}>
          <button
            type="button"
            onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 transition"
          >
            <span className="font-semibold text-slate-800 dark:text-white">{currentModel}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {modelDropdownOpen && (
            <div className="absolute left-0 mt-1.5 w-52 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1 z-50 text-xs">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Live AI Models (Zero Cost)
              </div>
              {liveModels.map((m) => {
                const isSelected = currentModel === m.name || currentModel.toLowerCase() === m.model_key.toLowerCase();
                return (
                  <button
                    key={m.id}
                    onClick={() => handleModelChange(m)}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-emerald-50 dark:hover:bg-emerald-950/40 ${
                      isSelected
                        ? 'font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50/50'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div>
                      <span>{m.name}</span>
                      <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">Free Tier (Live)</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                );
              })}
              <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
                <Link
                  to="/models"
                  onClick={() => setModelDropdownOpen(false)}
                  className="w-full px-3 py-1.5 text-left text-slate-500 hover:text-emerald-600 block text-[11px]"
                >
                  Compare All Models &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Online / Offline status badge */}
        <div
          title={isOnline ? 'Online - Cloud Sync Active' : `Offline - ${offlineCount} draft(s) cached locally`}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border ${
            isOnline
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
          }`}
        >
          {isOnline ? (
            <Wifi className="w-3 h-3 text-emerald-600" />
          ) : (
            <WifiOff className="w-3 h-3 text-amber-600" />
          )}
          <span className="hidden md:inline">
            {isOnline ? 'Online' : `Offline (${offlineCount})`}
          </span>
        </div>

        {/* Unit Toggle Quick Button */}
        <button
          type="button"
          onClick={() => setUnitSystem(unitSystem === 'imperial' ? 'metric' : 'imperial')}
          title="Toggle Metric (kg/ha, °C) / Imperial (lb/ac, °F)"
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
        >
          <Scale className="w-3.5 h-3.5 text-slate-500" />
          <span className="hidden lg:inline capitalize">{unitSystem}</span>
          <span className="text-[10px] text-slate-400">
            {unitSystem === 'imperial' ? 'lb/ac' : 'kg/ha'}
          </span>
        </button>

        {/* Language selector */}
        <div className="relative" ref={langRef}>
          <button
            type="button"
            onClick={() => setLangDropdownOpen(!langDropdownOpen)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="Change language"
          >
            <Globe className="w-4 h-4" />
          </button>

          {langDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1 z-50 text-xs">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Language / भाषा
              </div>
              {languages.map((lng) => (
                <button
                  key={lng.code}
                  onClick={() => {
                    useAppStore.getState().setLanguage(lng.code as any);
                    setLangDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 ${
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

        {/* Notification Bell Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
            className="relative p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            aria-label="View notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {notifDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-80 sm:w-96 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl py-2 z-50">
              <div className="flex items-center justify-between px-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-slate-900 dark:text-white">
                    Notifications
                  </span>
                  {unreadCount > 0 && (
                    <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    className="text-[11px] text-emerald-600 hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    No new notifications
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        markAsRead(n.id);
                        if (n.caseId) {
                          setNotifDropdownOpen(false);
                          navigate(`/cases/${n.caseId}`);
                        }
                      }}
                      className={`p-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition ${
                        !n.read ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {n.title}
                        </div>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          {n.time}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-500 dark:text-slate-400 text-[11px] line-clamp-2">
                        {n.message}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-2 px-3 border-t border-slate-100 dark:border-slate-800 text-center">
                <Link
                  to="/notifications"
                  onClick={() => setNotifDropdownOpen(false)}
                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline block py-1"
                >
                  View All Notifications &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Dark/Light toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
          aria-label="Toggle dark mode"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* User profile avatar & menu */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center gap-2 pl-1 pr-1.5 py-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <div className="w-7 h-7 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold text-xs ring-2 ring-emerald-600/30">
              {user?.avatarInitials || 'U'}
            </div>
            <span className="hidden xl:inline text-xs font-medium text-slate-700 dark:text-slate-300">
              {user?.displayName || 'User'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {profileDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-2 z-50 text-xs">
              <div className="px-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                <p className="font-semibold text-slate-900 dark:text-white">{user?.displayName || 'User'}</p>
                <p className="text-[11px] text-slate-400 truncate">{user?.email || ''}</p>
                <span className="mt-1.5 inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Role: {user?.role || 'farmer'}
                </span>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    setPasswordError(null);
                    setPasswordSuccess(null);
                    setCurrentPassword('');
                    setNewPassword('');
                    setIsChangePasswordOpen(true);
                  }}
                  className="w-full px-3 py-2 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                >
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('auth.changePassword', 'Change password')}</span>
                </button>
                <Link
                  to="/settings"
                  onClick={() => setProfileDropdownOpen(false)}
                  className="w-full px-3 py-2 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 block"
                >
                  {t('nav.settings', 'Settings')}
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full px-3 py-2 text-left text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 font-medium border-t border-slate-100 dark:border-slate-800 mt-1"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  <span>{t('auth.signOut', 'Sign out')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Change Password Modal */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setIsChangePasswordOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('auth.changePassword', 'Change password')}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Update your account login password
                </p>
              </div>
            </div>

            {passwordError && (
              <div className="mb-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="mb-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
                {passwordSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1" htmlFor="topbar-current-password">
                  {t('auth.currentPassword', 'Current password')}
                </label>
                <input
                  id="topbar-current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1" htmlFor="topbar-new-password">
                  {t('auth.newPassword', 'New password')}
                </label>
                <input
                  id="topbar-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsChangePasswordOpen(false)}
                  className="flex-1 py-2 rounded-xl font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="flex-1 py-2 rounded-xl font-semibold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 transition"
                >
                  {passwordLoading ? 'Updating...' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
