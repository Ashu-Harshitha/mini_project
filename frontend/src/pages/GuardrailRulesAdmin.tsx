import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Plus, 
  Check, 
  AlertTriangle, 
  ToggleLeft, 
  ToggleRight, 
  Sliders, 
  Lock,
  Layers
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { guardrailsApi, type GuardrailRule } from '@/api/guardrailsApi';
import { useAppStore } from '@/store/useAppStore';

export const GuardrailRulesAdmin: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAppStore();
  const [rules, setRules] = useState<GuardrailRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState('Chemical Safety');
  const [newRuleDesc, setNewRuleDesc] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    guardrailsApi.getGuardrails().then((data) => {
      setRules(data);
      setLoading(false);
    });
  }, []);

  const handleToggle = async (rule: GuardrailRule) => {
    const updated = await guardrailsApi.toggleGuardrail(rule.id, !rule.enabled);
    setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
    setToast(`Rule "${rule.ruleName}" is now ${updated.enabled ? 'Enforced' : 'Disabled'}`);
    setTimeout(() => setToast(null), 3000);
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName) return;

    const created = await guardrailsApi.addGuardrail({
      ruleName: newRuleName,
      category: newRuleCategory,
      description: newRuleDesc,
      status: 'Enforced',
      enabled: true,
    });
    setRules([...rules, created]);
    setIsAddModalOpen(false);
    setNewRuleName('');
    setNewRuleDesc('');
    setToast('New safety guardrail rule configured and active!');
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <span>Safety Guardrail Rules (Admin)</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
              Admin Exclusive
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Configure automated policy enforcement barriers, chemical hazard constraints, and decision thresholds.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white shadow-md transition"
        >
          <Plus className="w-4 h-4 text-emerald-300" />
          <span>Add Guardrail Rule</span>
        </button>
      </div>

      {toast && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2 animate-fadeIn">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{toast}</span>
        </div>
      )}

      {/* Rules List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition"
          >
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {rule.category}
                </span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {rule.ruleName}
                </h3>
              </div>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                {rule.description}
              </p>
              <div className="text-[11px] text-slate-400">
                Triggered in <strong>{rule.triggerCount}</strong> cases this season
              </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  rule.enabled
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {rule.status}
              </span>

              <button
                type="button"
                onClick={() => handleToggle(rule)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
                title={rule.enabled ? 'Disable rule' : 'Enable rule'}
              >
                {rule.enabled ? (
                  <ToggleRight className="w-7 h-7 text-emerald-600" />
                ) : (
                  <ToggleLeft className="w-7 h-7 text-slate-400" />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Rule Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Configure New Guardrail Rule
            </h3>

            <form onSubmit={handleAddRule} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Rule Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inversion Wind Speed Cutoff"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Category
                </label>
                <select
                  value={newRuleCategory}
                  onChange={(e) => setNewRuleCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5"
                >
                  <option value="Chemical Safety">Chemical Safety</option>
                  <option value="Environmental">Environmental Protection</option>
                  <option value="Decision Quality">Decision Quality / Confidence</option>
                  <option value="Privacy">Privacy & Compliance</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Rule Logic & Restrictions
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe constraint, trigger condition, and fallback action..."
                  value={newRuleDesc}
                  onChange={(e) => setNewRuleDesc(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-800 text-white font-semibold"
                >
                  Save Guardrail
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
