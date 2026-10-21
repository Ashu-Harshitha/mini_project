import React, { useState, useEffect } from 'react';
import { 
  Save, 
  Plus, 
  Trash2, 
  Check, 
  Scale, 
  Globe, 
  ShieldCheck, 
  Download, 
  AlertTriangle,
  Lock,
  UserCheck,
  Database,
  RefreshCw
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store/useAppStore';
import { units, type UnitSystem } from '@/lib/units';
import { farmsApi } from '@/api/farmsApi';
import { authApi } from '@/api/authApi';
import { notificationsApi } from '@/api/notificationsApi';
import { adminApi, type DemoStatusResponse } from '@/api/adminApi';
import { auth, updatePassword } from '@/lib/firebase';

export const Settings: React.FC = () => {
  const { t } = useTranslation();
  const {
    currentFarm,
    setCurrentFarm,
    currentModel,
    setCurrentModel,
    unitSystem,
    setUnitSystem,
    language,
    setLanguage,
    user,
    setUser,
  } = useAppStore();

  const [available, setAvailable] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const [farmName, setFarmName] = useState(currentFarm.name);
  const [operator, setOperator] = useState(currentFarm.operator);
  const [location, setLocation] = useState(currentFarm.location);
  const [totalAcreage, setTotalAcreage] = useState(currentFarm.totalAcreage);
  const [primaryCrops, setPrimaryCrops] = useState(currentFarm.primaryCrops.join(', '));
  const [irrigation, setIrrigation] = useState(currentFarm.irrigationSystem);

  const [threshold, setThreshold] = useState(88);
  const [requireHumanReviewAll, setRequireHumanReviewAll] = useState(false);

  // Notification channel preference states
  const [prefEmail, setPrefEmail] = useState(user?.channel_prefs?.email ?? true);
  const [prefWhatsapp, setPrefWhatsapp] = useState(user?.channel_prefs?.whatsapp ?? false);
  const [contactEmail, setContactEmail] = useState(user?.email || '');
  const [contactPhone, setContactPhone] = useState(user?.phone || '');
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Demo Data Management states
  const [demoStatus, setDemoStatus] = useState<DemoStatusResponse | null>(null);
  const [isDemoActionLoading, setIsDemoActionLoading] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [demoResult, setDemoResult] = useState<{ message: string; counts?: Record<string, number>; isError?: boolean } | null>(null);

  useEffect(() => {
    if (user?.role === 'admin') {
      adminApi.getDemoStatus()
        .then((res) => setDemoStatus(res))
        .catch(() => setDemoStatus(null));
    }
  }, [user?.role]);

  const handleLoadDemo = async () => {
    setShowLoadModal(false);
    setIsDemoActionLoading(true);
    setDemoResult(null);
    try {
      const res = await adminApi.loadDemoData({ cases: 30 });
      setDemoResult({ message: res.message, counts: res.counts, isError: false });
      const statusRes = await adminApi.getDemoStatus();
      setDemoStatus(statusRes);
    } catch (err: any) {
      setDemoResult({ message: err?.message || 'Failed to load demo data', isError: true });
    } finally {
      setIsDemoActionLoading(false);
    }
  };

  const handleResetDemo = async () => {
    setShowResetModal(false);
    setIsDemoActionLoading(true);
    setDemoResult(null);
    try {
      const res = await adminApi.resetDemoData();
      setDemoResult({ message: res.message, counts: res.deleted, isError: false });
      const statusRes = await adminApi.getDemoStatus();
      setDemoStatus(statusRes);
    } catch (err: any) {
      setDemoResult({ message: err?.message || 'Failed to remove demo data', isError: true });
    } finally {
      setIsDemoActionLoading(false);
    }
  };


  // New field modal state
  const [isAddFieldOpen, setIsAddFieldOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldAcreage, setNewFieldAcreage] = useState(40);
  const [newFieldSoil, setNewFieldSoil] = useState('Silt loam');
  const [newFieldCrop, setNewFieldCrop] = useState('Corn');

  const handleSaveAll = async () => {
    const updated = await farmsApi.updateFarm(currentFarm.id, {
      name: farmName,
      operator,
      location,
      totalAcreage,
      primaryCrops: primaryCrops.split(',').map((c) => c.trim()),
      irrigationSystem: irrigation,
    });
    setCurrentFarm(updated);
    setToastMessage('Settings saved successfully!');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName) return;

    const updated = await farmsApi.addField(currentFarm.id, {
      id: `f-${Date.now()}`,
      name: newFieldName,
      acreage: newFieldAcreage,
      soilType: newFieldSoil,
      currentCrop: newFieldCrop,
    });
    setCurrentFarm(updated);
    setIsAddFieldOpen(false);
    setNewFieldName('');
    setToastMessage('Field added successfully!');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleDeleteField = (fieldId: string) => {
    const updatedFields = currentFarm.fields.filter((f) => f.id !== fieldId);
    setCurrentFarm({ ...currentFarm, fields: updatedFields });
  };

  const handleExportData = () => {
    const exportPayload = {
      farm: currentFarm,
      unitSystem,
      language,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentFarm.name.toLowerCase().replace(/\s+/g, '_')}_data.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('nav.settings', 'Settings')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Farm profile, model preferences, units, and account configuration.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSaveAll}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white shadow-md transition"
        >
          <Save className="w-4 h-4 text-emerald-300" />
          <span>{t('common.save', 'Save Changes')}</span>
        </button>
      </div>

      {toastMessage && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2 animate-fadeIn">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* SECTION 1: FARM PROFILE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-5">
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider pb-3 border-b border-slate-100 dark:border-slate-800">
          Farm Profile
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
              Farm Name
            </label>
            <input
              type="text"
              value={farmName}
              onChange={(e) => setFarmName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
              Operator Name
            </label>
            <input
              type="text"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
              Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
              Total Acreage ({units.convertArea(totalAcreage, unitSystem).unit})
            </label>
            <input
              type="number"
              value={totalAcreage}
              onChange={(e) => setTotalAcreage(parseInt(e.target.value, 10))}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
              Primary Crops (comma separated)
            </label>
            <input
              type="text"
              value={primaryCrops}
              onChange={(e) => setPrimaryCrops(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
              Irrigation System
            </label>
            <input
              type="text"
              value={irrigation}
              onChange={(e) => setIrrigation(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Fields Management Table */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Fields ({currentFarm.fields.length})
            </span>
            <button
              type="button"
              onClick={() => setIsAddFieldOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Field</span>
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-[11px] font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Field Name</th>
                  <th className="py-2.5 px-3">Acreage</th>
                  <th className="py-2.5 px-3">Soil Type</th>
                  <th className="py-2.5 px-3">Current Crop</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {currentFarm.fields.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-semibold">{f.name}</td>
                    <td className="py-2.5 px-3">{units.convertArea(f.acreage, unitSystem).label}</td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{f.soilType}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {f.currentCrop}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteField(f.id)}
                        className="text-slate-400 hover:text-rose-600 transition p-1"
                        title="Delete field"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECTION 2: MODEL PREFERENCES */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-5">
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider pb-3 border-b border-slate-100 dark:border-slate-800">
          Model Preferences
        </h3>

        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
              Default AI Model
            </label>
            <select
              value={currentModel}
              onChange={(e) => setCurrentModel(e.target.value)}
              className="w-full sm:w-80 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (Free Tier - Default)</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (Free Tier)</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 mb-1">
              <span className="font-medium">Confidence threshold for auto-approval: {threshold}%</span>
            </div>
            <input
              type="range"
              min="60"
              max="95"
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
              className="w-full sm:w-80 accent-emerald-700 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Cases below this threshold require mandatory agronomist review.
            </p>
          </div>

          {/* Require human review toggle */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">
                Require human review for all cases
              </span>
              <span className="text-[11px] text-slate-400">
                Override confidence threshold — all cases go to agronomist
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={requireHumanReviewAll}
                onChange={(e) => setRequireHumanReviewAll(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
            </label>
          </div>
        </div>
      </div>

      {/* SECTION 3: UNITS & LOCALIZATION */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-5">
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider pb-3 border-b border-slate-100 dark:border-slate-800">
          Units & Localization
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
          {/* Fix #5: Metric / Imperial Toggle */}
          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1.5 font-medium">
              Measurement Unit System
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setUnitSystem('imperial')}
                className={`p-3 rounded-lg border text-left transition ${
                  unitSystem === 'imperial'
                    ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>Imperial</span>
                  {unitSystem === 'imperial' && <Check className="w-4 h-4 text-emerald-600" />}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">lb/ac, gal/ac, acres, °F, in</div>
              </button>

              <button
                type="button"
                onClick={() => setUnitSystem('metric')}
                className={`p-3 rounded-lg border text-left transition ${
                  unitSystem === 'metric'
                    ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>Metric</span>
                  {unitSystem === 'metric' && <Check className="w-4 h-4 text-emerald-600" />}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">kg/ha, L/ha, ha, °C, mm</div>
              </button>
            </div>
          </div>

          {/* Language Picker */}
          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1.5 font-medium">
              Interface Language
            </label>
            <select
              value={language}
              onChange={(e) => {
                const newLang = e.target.value as 'en' | 'hi' | 'kn';
                setLanguage(newLang);
                authApi.updateLanguage(newLang).catch(console.warn);
              }}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="en">English (US)</option>
              <option value="hi">हिंदी (Hindi)</option>
              <option value="kn">ಕನ್ನಡ (Kannada)</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Changes apply instantly across all pages and guidance reports.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION: AGRONOMIST AVAILABILITY */}
      {(user?.role === 'agronomist' || user?.role === 'admin') && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span>Case Assignment Availability</span>
          </h3>
          <div className="flex items-center justify-between text-xs">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">
                Available for New Cases
              </span>
              <span className="text-[11px] text-slate-400">
                When enabled, the automated triage engine assigns pending farmer cases to you.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={available}
                onChange={(e) => {
                  const val = e.target.checked;
                  setAvailable(val);
                  authApi.updateAvailability(val).catch(console.warn);
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-700"></div>
            </label>
          </div>
        </div>
      )}

      {/* SECTION: CHANGE PASSWORD */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <Lock className="w-4 h-4 text-emerald-600" />
          <span>Security & Password</span>
        </h3>

        {passwordMsg && (
          <div className="p-3 rounded-lg text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200">
            {passwordMsg}
          </div>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newPassword || newPassword.length < 6) {
              setPasswordMsg('Password must be at least 6 characters.');
              return;
            }
            if (auth?.currentUser) {
              setUpdatingPassword(true);
              try {
                await updatePassword(auth.currentUser, newPassword);
                setPasswordMsg('Password updated successfully!');
                setNewPassword('');
              } catch (err: any) {
                setPasswordMsg(err.message || 'Failed to update password');
              } finally {
                setUpdatingPassword(false);
              }
            }
          }}
          className="space-y-3 max-w-sm text-xs"
        >
          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
              New Password (min 6 characters)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
          <button
            type="submit"
            disabled={updatingPassword || !newPassword}
            className="px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white font-semibold shadow disabled:opacity-50 transition"
          >
            {updatingPassword ? 'Updating...' : 'Change Password'}
          </button>
        </form>
      </div>

      {/* SECTION 4: NOTIFICATIONS & CHANNELS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              {t('settings.notificationChannels', 'Notification Channels & Alerts')}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {t('settings.notificationDesc', 'Configure how diagnostic reports, decision updates, and reminders reach you.')}
            </p>
          </div>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSavingPrefs(true);
            try {
              await notificationsApi.updateNotificationPrefs({
                channel_prefs: {
                  email: prefEmail,
                  whatsapp: prefWhatsapp,
                  sms: false,
                },
                email: contactEmail,
                phone: contactPhone,
              });
              if (user) {
                setUser({
                  ...user,
                  email: contactEmail,
                  phone: contactPhone,
                  channel_prefs: {
                    email: prefEmail,
                    whatsapp: prefWhatsapp,
                    sms: false,
                  },
                });
              }
              setToastMessage(t('settings.prefsSaved', 'Notification preferences saved successfully!'));
              setTimeout(() => setToastMessage(null), 3000);
            } catch (err: any) {
              setToastMessage(err.message || 'Failed to update preferences');
              setTimeout(() => setToastMessage(null), 3000);
            } finally {
              setSavingPrefs(false);
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-3 text-xs divide-y divide-slate-100 dark:divide-slate-800">
            {/* Email Channel */}
            <div className="flex items-start justify-between pt-2 gap-4">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white block">
                  {t('settings.emailChannel', 'Email Notifications')}
                </span>
                <span className="text-[11px] text-slate-400">
                  {t('settings.emailDesc', 'Receive localized HTML report and direct case links via SMTP email')}
                </span>
              </div>
              <input
                type="checkbox"
                checked={prefEmail}
                onChange={(e) => setPrefEmail(e.target.checked)}
                className="w-4 h-4 accent-emerald-600 rounded mt-0.5"
              />
            </div>

            {/* WhatsApp Channel */}
            <div className="flex items-start justify-between pt-3 gap-4">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white block">
                  {t('settings.whatsappChannel', 'WhatsApp Alerts')}
                </span>
                <span className="text-[11px] text-slate-400">
                  {t('settings.whatsappDesc', 'Direct mobile messaging for high-priority case decisions and guidance')}
                </span>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium pt-1">
                  {t('settings.whatsappSandboxHint', 'Note: Twilio WhatsApp sandbox requires sending "join <keyword>" to the sandbox number before messages can be received.')}
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefWhatsapp}
                onChange={(e) => setPrefWhatsapp(e.target.checked)}
                className="w-4 h-4 accent-emerald-600 rounded mt-0.5"
              />
            </div>

            {/* SMS Channel */}
            <div className="flex items-start justify-between pt-3 gap-4 opacity-60">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white block">
                  {t('settings.smsChannel', 'SMS Text Alerts')}
                </span>
                <span className="text-[11px] text-slate-400">
                  {t('settings.smsDesc', 'Standard cellular SMS text messages')}
                </span>
                <p className="text-[10px] text-slate-400 italic pt-0.5">
                  {t('settings.smsDisabledHint', 'SMS provider channel is currently disabled. Please use WhatsApp or Email.')}
                </p>
              </div>
              <input
                type="checkbox"
                checked={false}
                disabled
                className="w-4 h-4 accent-slate-400 rounded mt-0.5 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('settings.contactPhone', 'Contact Phone')}
              </label>
              <input
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+919876543210"
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                {t('settings.phoneHint', 'Enter E.164 phone or 10-digit number (defaults to +91).')}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('settings.contactEmail', 'Contact Email')}
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="farmer@example.com"
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={savingPrefs}
              className="px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs shadow disabled:opacity-50 transition"
            >
              {savingPrefs ? t('settings.saving', 'Saving...') : t('settings.saveChannels', 'Save Notification Preferences')}
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 5: DATA & PRIVACY */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider pb-3 border-b border-slate-100 dark:border-slate-800">
          Data & Privacy
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">Data Residency</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">United States (Iowa Region)</span>
          </div>

          <div>
            <span className="text-slate-400 block text-[11px]">Audit Trail Retention</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">2 years (SOC2 / GDPR compliant)</span>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportData}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Farm Data</span>
          </button>
        </div>
      </div>

      {/* SECTION: DEMO DATA (Admin Only, shown only when demo is enabled) */}
      {user?.role === 'admin' && demoStatus?.enabled && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                {t('settings.demoTitle', 'Demo Data Management')}
              </h3>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {t('settings.demoEnabled', 'Demo Loader Active')}
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('settings.demoDesc', 'Seed synthetic cases, farmers, agronomists, outbreaks, and alerts for testing without real farm impact.')}
          </p>

          {/* Counts pill display */}
          {demoStatus.has_demo_data && (
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-2">
                {t('settings.demoActiveRecords', 'Active demo records in database')}:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-white dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700">
                  <span className="text-slate-400 text-[10px] block">Cases</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{demoStatus.counts.cases}</span>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700">
                  <span className="text-slate-400 text-[10px] block">Farmers / Agronomists</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{demoStatus.counts.users}</span>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700">
                  <span className="text-slate-400 text-[10px] block">Farms</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{demoStatus.counts.farms}</span>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700">
                  <span className="text-slate-400 text-[10px] block">Weather Alerts</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{demoStatus.counts.weather_alerts}</span>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700">
                  <span className="text-slate-400 text-[10px] block">Notifications</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{demoStatus.counts.notifications}</span>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700">
                  <span className="text-slate-400 text-[10px] block">Outbreaks</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{demoStatus.counts.outbreaks}</span>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700">
                  <span className="text-slate-400 text-[10px] block">Eval Runs</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{demoStatus.counts.eval_runs}</span>
                </div>
              </div>
            </div>
          )}

          {/* Result summary banner */}
          {demoResult && (
            <div className={`p-3 rounded-xl text-xs border ${
              demoResult.isError
                ? 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/60 dark:border-rose-900 dark:text-rose-200'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200'
            }`}>
              <div className="flex items-center gap-2 font-semibold">
                {demoResult.isError ? (
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                ) : (
                  <Check className="w-4 h-4 text-emerald-600" />
                )}
                <span>{demoResult.message}</span>
              </div>
              {demoResult.counts && Object.keys(demoResult.counts).length > 0 && (
                <div className="mt-2 pt-2 border-t border-emerald-100 dark:border-emerald-900/40 flex flex-wrap gap-2 text-[11px]">
                  {Object.entries(demoResult.counts).map(([k, v]) => (
                    <span key={k} className="px-2 py-0.5 rounded bg-emerald-100/70 dark:bg-emerald-900/50">
                      <strong>{k}:</strong> {v}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              disabled={isDemoActionLoading}
              onClick={() => setShowLoadModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white shadow transition disabled:opacity-50"
            >
              {isDemoActionLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Database className="w-3.5 h-3.5 text-emerald-300" />
              )}
              <span>{isDemoActionLoading ? t('settings.loadingDemo', 'Loading Demo Data...') : t('settings.loadDemoBtn', 'Load demo data')}</span>
            </button>

            <button
              type="button"
              disabled={isDemoActionLoading || !demoStatus?.has_demo_data}
              onClick={() => setShowResetModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('settings.removeDemoBtn', 'Remove demo data')}</span>
            </button>
          </div>
        </div>
      )}


      {/* Add Field Modal */}
      {isAddFieldOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">Add New Field</h3>
            <form onSubmit={handleAddField} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">Field Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. East 60 - Creek Lot"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">Acreage</label>
                <input
                  type="number"
                  required
                  value={newFieldAcreage}
                  onChange={(e) => setNewFieldAcreage(parseInt(e.target.value, 10))}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">Soil Type</label>
                <input
                  type="text"
                  value={newFieldSoil}
                  onChange={(e) => setNewFieldSoil(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">Current Crop</label>
                <input
                  type="text"
                  value={newFieldCrop}
                  onChange={(e) => setNewFieldCrop(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddFieldOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-800 text-white font-semibold"
                >
                  Save Field
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Load Demo Data Confirmation Modal */}
      {showLoadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {t('settings.confirmLoadTitle', 'Load Demo Data?')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Safe idempotent generation
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t('settings.confirmLoadDesc', 'This will seed 30 cases across 8 farmers, 4 agronomists, weather alerts, and outbreak clusters. Production data will remain untouched.')}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLoadModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {t('settings.cancelBtn', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleLoadDemo}
                className="px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-xs font-semibold text-white shadow"
              >
                {t('settings.confirmBtn', 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Demo Data Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {t('settings.confirmRemoveTitle', 'Remove Demo Data?')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Dependency-ordered deletion
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t('settings.confirmRemoveDesc', 'This will delete all demo cases, users, farms, alerts, and evaluation runs tagged as demo data. This action is irreversible.')}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {t('settings.cancelBtn', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleResetDemo}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white shadow"
              >
                {t('settings.confirmBtn', 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

