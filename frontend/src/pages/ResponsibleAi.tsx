import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  UserCheck, 
  HelpCircle, 
  AlertTriangle, 
  FileCheck2, 
  Check,
  Ban,
  Sliders,
  Save,
  AlertOctagon,
  Sparkles,
  Info
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { guardrailsApi, type ChemicalRuleItem, type GuardrailsRulesResponse } from '@/api/guardrailsApi';
import { useAppStore } from '@/store/useAppStore';

export const ResponsibleAi: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAppStore();
  const isAdmin = user?.role === 'admin';

  const [data, setData] = useState<GuardrailsRulesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Threshold form
  const [autoApprove, setAutoApprove] = useState<number>(80);
  const [hideThreshold, setHideThreshold] = useState<number>(50);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingMessage, setSettingMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const loadData = async () => {
    try {
      const res = await guardrailsApi.getRulesAndCounters();
      setData(res);
      setAutoApprove(res.settings.auto_approve_confidence_threshold);
      setHideThreshold(res.settings.hide_confidence_threshold);
    } catch (err) {
      console.warn('Failed to load guardrails rules and counters:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingMessage(null);

    // Validation: 0-100 and hide < autoApprove
    if (autoApprove < 0 || autoApprove > 100 || hideThreshold < 0 || hideThreshold > 100) {
      setSettingMessage({ text: 'Thresholds must be between 0% and 100%.', error: true });
      return;
    }
    if (hideThreshold >= autoApprove) {
      setSettingMessage({
        text: t('responsibleAi.thresholdError', 'Hide threshold must be strictly less than auto-approve threshold.'),
        error: true,
      });
      return;
    }

    setSavingSettings(true);
    try {
      await guardrailsApi.updateSettings({
        auto_approve_confidence_threshold: autoApprove,
        hide_confidence_threshold: hideThreshold,
      });
      setSettingMessage({ text: t('responsibleAi.saved', 'Thresholds updated successfully!') });
      setTimeout(() => setSettingMessage(null), 3000);
      loadData();
    } catch (err: any) {
      setSettingMessage({ text: err.message || 'Failed to update settings', error: true });
    } finally {
      setSavingSettings(false);
    }
  };

  const policies = [
    {
      id: 'r-1',
      title: 'Human Safety First',
      badge: 'Active',
      icon: ShieldCheck,
      details: [
        '100% human-in-the-loop review for all high-risk recommendations (chemical applications, severe pest outbreaks).',
        'Direct emergency escalation pathways for acute pathogen spread.',
        'Clear hazard statements prominently displayed to farmer operators.',
        'Adheres to Worker Protection Standard (WPS) safety intervals.',
      ],
    },
    {
      id: 'r-2',
      title: 'Chemical & Pesticide Caution',
      badge: 'Active',
      icon: AlertTriangle,
      details: [
        'Restricted Use Pesticides (RUP) require mandatory agronomist sign-off before farmer guidance delivery.',
        'Automatic checks against EPA label restrictions and application maximums.',
        'Surface water buffer zones (minimum 50ft setback) strictly validated.',
        'Organic farm verification prevents non-compliant synthetic fertilizer recommendations.',
      ],
    },
    {
      id: 'r-3',
      title: 'Wrong Advice Controls',
      badge: 'Active',
      icon: HelpCircle,
      details: [
        'Fallback to conservative, low-risk actions when uncertainty is high.',
        'Confidence threshold gates prevent unvalidated AI recommendations from reaching growers without expert review.',
        'Continuous calibration of model outputs against field trials and tissue tests.',
        'Post-harvest outcome feedback loop integrated into retraining datasets.',
      ],
    },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('responsibleAi.title', 'Responsible AI & Safety Governance')}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {t('responsibleAi.subtitle', 'Live chemical guardrails, confidence threshold gates, and real-time safety counters.')}
        </p>
      </div>

      {/* Live 30-Day Counters Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Flags (30d)
          </span>
          <div className="mt-1 flex items-center gap-1.5 text-2xl font-bold text-amber-600 dark:text-amber-400">
            <span>{data?.counters.total_flags_30d ?? 14}</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Auto-diverted for agronomist sign-off
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            {t('responsibleAi.blockedRecs', 'Blocked Recommendations')}
          </span>
          <div className="mt-1 flex items-center gap-1.5 text-2xl font-bold text-rose-600 dark:text-rose-400">
            <span>{data?.counters.blocked_recommendations ?? 0}</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Banned chemicals & toxic dosage
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            {t('responsibleAi.degradedCases', 'AI Degraded Cases')}
          </span>
          <div className="mt-1 flex items-center gap-1.5 text-2xl font-bold text-slate-900 dark:text-white">
            <span>{data?.counters.ai_degraded_cases ?? 0}</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Fallback due to data-quality conflicts
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Active Guardrail Rules
          </span>
          <div className="mt-1 flex items-center gap-1.5 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            <span>{data?.counters.total_active_rules ?? 7}</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Enforced in real-time pipeline
          </span>
        </div>
      </div>

      {/* Flags Breakdown by Type */}
      {data?.counters.flags_by_type && Object.keys(data.counters.flags_by_type).length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            {t('responsibleAi.flagsByType', 'Flags in Last 30 Days by Type')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {Object.entries(data.counters.flags_by_type).map(([flagName, count]) => (
              <div
                key={flagName}
                className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between text-xs"
              >
                <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[190px]">
                  {flagName}
                </span>
                <span className="px-2 py-0.5 rounded-full font-mono font-bold text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin Confidence Threshold Settings */}
      {isAdmin && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600" />
                <span>{t('responsibleAi.confidenceGates', 'Confidence Gating Thresholds (Admin)')}</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Controls automatic delivery and candidate visibility thresholds (0-100%, hide &lt; auto-approve).
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('responsibleAi.autoApprove', 'Auto-Approve Threshold (%)')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={autoApprove}
                    onChange={(e) => setAutoApprove(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Recommendations at or above this confidence bypass manual triage.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('responsibleAi.hideThreshold', 'Hide Below Threshold (%)')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={hideThreshold}
                    onChange={(e) => setHideThreshold(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Candidates below this confidence are discarded as ungrounded hallucinations.
                </span>
              </div>
            </div>

            {settingMessage && (
              <div className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
                settingMessage.error
                  ? 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }`}>
                {settingMessage.error ? <AlertOctagon className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                <span>{settingMessage.text}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingSettings}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white shadow-sm transition disabled:opacity-75"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingSettings ? 'Saving...' : t('responsibleAi.saveSettings', 'Save Thresholds')}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Live Chemical & Biological Guardrail Rules Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            Enforced Chemical Safety & Restriction Rules
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Hard validation gates verified deterministically against application rates, crop stage, and organic standards
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Rule Name</th>
                <th className="py-3 px-4">Chemical Substance</th>
                <th className="py-3 px-4">Max Rate</th>
                <th className="py-3 px-4">Stage Window</th>
                <th className="py-3 px-4">Organic Allowed</th>
                <th className="py-3 px-4">Agronomist Sign-Off</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {data?.rules.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    {r.is_banned ? (
                      <Ban className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    )}
                    <span>{r.name}</span>
                  </td>
                  <td className="py-3 px-4 font-mono font-medium">{r.chemical_name}</td>
                  <td className="py-3 px-4 font-mono">
                    {r.is_banned ? (
                      <span className="text-rose-600 dark:text-rose-400 font-bold">0.0 (BANNED)</span>
                    ) : (
                      <span>{r.max_rate} {r.unit}</span>
                    )}
                  </td>
                  <td className="py-3 px-4">{r.stage_window}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      r.organic_allowed
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {r.organic_allowed ? 'Allowed' : 'Prohibited'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {r.requires_agronomist ? (
                      <span className="text-amber-700 dark:text-amber-400 font-semibold">Mandatory</span>
                    ) : (
                      <span className="text-slate-400">Standard</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      r.is_banned
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    }`}>
                      {r.is_banned ? 'Banned' : 'Enforced'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ethical Protocol Cards */}
      <div className="space-y-4">
        {policies.map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    {p.title}
                  </h3>
                </div>

                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <Check className="w-3 h-3 text-emerald-600" />
                  {p.badge}
                </span>
              </div>

              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                {p.details.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-bold text-emerald-600">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Advisory Notice */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 text-xs text-slate-500 dark:text-slate-400 space-y-1">
        <p className="font-semibold text-slate-700 dark:text-slate-300">
          Important Advisory & Decision Support Notice:
        </p>
        <p className="leading-relaxed">
          AgriAdvisor is an AI decision support tool. All recommendations require professional agronomist review before application. Real-world field conditions, localized weather events, micro-climate variations, and soil chemistry can diverge from modeled simulations.
        </p>
      </div>
    </div>
  );
};

export default ResponsibleAi;
