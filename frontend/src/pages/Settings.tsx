import React, { useState } from 'react';
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
  UserCheck
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store/useAppStore';
import { units, type UnitSystem } from '@/lib/units';
import { farmsApi } from '@/api/farmsApi';
import { authApi } from '@/api/authApi';
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

  const [notifCaseCompleted, setNotifCaseCompleted] = useState(true);
  const [notifExpertReview, setNotifExpertReview] = useState(true);
  const [notifSafetyAlerts, setNotifSafetyAlerts] = useState(true);
  const [notifWeeklySummary, setNotifWeeklySummary] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
              <option value="GPT-4o">GPT-4o (OpenAI)</option>
              <option value="Claude 3.5 Sonnet">Claude 3.5 Sonnet (Anthropic)</option>
              <option value="Gemini 1.5 Pro">Gemini 1.5 Pro (Google)</option>
              <option value="Llama 3.1 70B">Llama 3.1 70B (Meta / Self-hosted)</option>
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

      {/* SECTION 4: NOTIFICATIONS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider pb-3 border-b border-slate-100 dark:border-slate-800">
          Notifications
        </h3>

        <div className="space-y-3 text-xs divide-y divide-slate-100 dark:divide-slate-800">
          <div className="flex items-center justify-between pt-2">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Case completed</span>
              <span className="text-[11px] text-slate-400">Receive alerts when AI analysis is ready</span>
            </div>
            <input
              type="checkbox"
              checked={notifCaseCompleted}
              onChange={(e) => setNotifCaseCompleted(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded"
            />
          </div>

          <div className="flex items-center justify-between pt-3">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Expert review required</span>
              <span className="text-[11px] text-slate-400">Alert when a case needs agronomist review</span>
            </div>
            <input
              type="checkbox"
              checked={notifExpertReview}
              onChange={(e) => setNotifExpertReview(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded"
            />
          </div>

          <div className="flex items-center justify-between pt-3">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Safety alerts</span>
              <span className="text-[11px] text-slate-400">High priority flags on acute chemical restrictions</span>
            </div>
            <input
              type="checkbox"
              checked={notifSafetyAlerts}
              onChange={(e) => setNotifSafetyAlerts(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded"
            />
          </div>

          <div className="flex items-center justify-between pt-3">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Weekly summary report</span>
              <span className="text-[11px] text-slate-400">Email digest of farm activity to farm manager</span>
            </div>
            <input
              type="checkbox"
              checked={notifWeeklySummary}
              onChange={(e) => setNotifWeeklySummary(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded"
            />
          </div>
        </div>
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
    </div>
  );
};
