import React, { useState, useEffect } from 'react';
import { 
  Check, 
  Info, 
  Award, 
  Zap, 
  DollarSign, 
  Clock, 
  ShieldCheck, 
  Sparkles,
  Layers,
  HelpCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { modelsApi, type ModelComparisonModel, type ModelComparisonResponse } from '@/api/modelsApi';
import { useAppStore } from '@/store/useAppStore';

export const ModelComparison: React.FC = () => {
  const { t } = useTranslation();
  const { currentModel, setCurrentModel } = useAppStore();
  const [data, setData] = useState<ModelComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchFeedback, setSwitchFeedback] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const res = await modelsApi.getComparison();
      setData(res);
      if (res.active_model) {
        const found = res.models.find(
          (m) => m.model_key === res.active_model || m.id === res.active_model || m.name.toLowerCase() === res.active_model.toLowerCase()
        );
        if (found) {
          setCurrentModel(found.name);
        }
      }
    } catch (err) {
      console.warn('Failed to load model comparison:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectModel = async (model: ModelComparisonModel) => {
    if (!model.is_live) return;
    setCurrentModel(model.name);
    try {
      await modelsApi.setActiveModel(model.model_key || model.id);
      setSwitchFeedback(`Switched active inference model to ${model.name}. No server restart required.`);
      setTimeout(() => setSwitchFeedback(null), 3000);
      loadData();
    } catch (err) {
      console.warn('Failed to set active model:', err);
    }
  };

  if (loading || !data) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        {t('common.loading', 'Loading model comparison data...')}
      </div>
    );
  }

  const { models, weights, highest_score } = data;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('modelComparison.title', 'Model Comparison')}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {t('modelComparison.subtitle', 'Compare GenAI models on capability, cost, latency, and agronomic benchmarks.')}
        </p>
      </div>

      {switchFeedback && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{switchFeedback}</span>
        </div>
      )}

      {/* Model Selection Pills Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {models.map((m) => {
          const isSelected = currentModel === m.name || currentModel.toLowerCase() === m.model_key.toLowerCase();
          return (
            <button
              key={m.id}
              type="button"
              disabled={!m.is_live}
              onClick={() => handleSelectModel(m)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                isSelected
                  ? 'bg-emerald-800 text-white shadow-sm'
                  : m.is_live
                  ? 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                  : 'bg-slate-100 dark:bg-slate-850 text-slate-400 border border-slate-200 dark:border-slate-800 cursor-not-allowed opacity-75'
              }`}
            >
              <span>{m.name}</span>
              {m.is_live && <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Live</span>}
              {!m.is_live && <span className="text-[10px] text-slate-400">Ref</span>}
              {isSelected && <Check className="w-3.5 h-3.5" />}
            </button>
          );
        })}
      </div>

      {/* Information / Recommendation Box */}
      <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
        <Info className="w-5 h-5 text-emerald-700 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="leading-relaxed space-y-1">
          <p>
            <strong className="font-semibold text-emerald-950 dark:text-white">Live vs Reference Models: </strong>
            Gemini 2.5 Flash Lite and Flash run live on Google AI free tier (0 cost). External frontier models (Claude 3.5 Sonnet, GPT-4o, Llama 3.1) are benchmark references from published agronomic evaluations.
          </p>
          <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
            Dimension weights: Image Accuracy (25%), Groundedness (20%), Safety (20%), Uncertainty Cal. (15%), Clarity (10%), Environmental (10%).
          </p>
        </div>
      </div>

      {/* Comparison Matrix Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="py-4 px-5 min-w-[170px]">Evaluation Metric</th>
                {models.map((m) => {
                  const isTopPick = m.agriAdvisorScore === highest_score;
                  return (
                    <th key={m.id} className="py-4 px-4 min-w-[180px]">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">
                            {m.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-normal">
                            {m.provider} · {m.is_live ? 'Live Free Tier' : 'Benchmark Only'}
                          </div>
                        </div>

                        {/* Top Pick Badge follows highest score dynamically */}
                        {isTopPick && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-700 text-white shadow-sm">
                            <Award className="w-3 h-3" />
                            {t('modelComparison.topPick', 'Top Pick')}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {/* AgriAdvisor Score */}
              <tr className="bg-emerald-50/40 dark:bg-emerald-950/20 font-bold">
                <td className="py-4 px-5 text-emerald-900 dark:text-emerald-300 font-bold">
                  AgriAdvisor Score (Weighted)
                </td>
                {models.map((m) => {
                  const isTopPick = m.agriAdvisorScore === highest_score;
                  return (
                    <td key={m.id} className="py-4 px-4">
                      <span className={`text-base ${isTopPick ? 'text-emerald-700 dark:text-emerald-400 font-extrabold' : 'text-slate-800 dark:text-slate-200'}`}>
                        {m.agriAdvisorScore} / 100
                      </span>
                    </td>
                  );
                })}
              </tr>

              {/* Image Accuracy */}
              <tr>
                <td className="py-3 px-5 font-semibold text-slate-900 dark:text-white">Image Accuracy (25%)</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3 px-4 font-mono">
                    {m.metrics.image_accuracy}%
                  </td>
                ))}
              </tr>

              {/* Groundedness */}
              <tr>
                <td className="py-3 px-5 font-semibold text-slate-900 dark:text-white">Groundedness (20%)</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3 px-4 font-mono">
                    {m.metrics.groundedness}%
                  </td>
                ))}
              </tr>

              {/* Safety Score */}
              <tr>
                <td className="py-3 px-5 font-semibold text-slate-900 dark:text-white">Safety Score (20%)</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3 px-4 font-mono font-medium">
                    {m.metrics.safety_score}%
                  </td>
                ))}
              </tr>

              {/* Uncertainty Calibration */}
              <tr>
                <td className="py-3 px-5 font-semibold text-slate-900 dark:text-white">Uncertainty Cal. (15%)</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3 px-4 font-mono">
                    {m.metrics.uncertainty_calibration}%
                  </td>
                ))}
              </tr>

              {/* Farmer Clarity */}
              <tr>
                <td className="py-3 px-5 font-semibold text-slate-900 dark:text-white">Farmer Clarity (10%)</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3 px-4 font-mono">
                    {m.metrics.farmer_clarity}%
                  </td>
                ))}
              </tr>

              {/* Environmental Awareness */}
              <tr>
                <td className="py-3 px-5 font-semibold text-slate-900 dark:text-white">Environmental (10%)</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3 px-4 font-mono">
                    {m.metrics.environmental_awareness}%
                  </td>
                ))}
              </tr>

              {/* Cost / 1M Tokens */}
              <tr>
                <td className="py-3 px-5 font-semibold text-slate-900 dark:text-white">Cost (Input / Output per 1M)</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3 px-4 font-mono text-[11px]">
                    {m.free_tier ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">$0.00 (Free Tier)</span>
                    ) : (
                      <span>${m.cost_input_per_m} / ${m.cost_output_per_m}</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Avg Latency */}
              <tr>
                <td className="py-3 px-5 font-semibold text-slate-900 dark:text-white">Average Latency</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3 px-4 font-mono">
                    {m.latency_ms} ms
                  </td>
                ))}
              </tr>

              {/* Context Window */}
              <tr>
                <td className="py-3 px-5 font-semibold text-slate-900 dark:text-white">Context Window</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3 px-4 font-mono">
                    {m.context_window}
                  </td>
                ))}
              </tr>

              {/* Source Note */}
              <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                <td className="py-3 px-5 font-semibold text-slate-900 dark:text-white">Benchmark Provenance</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3 px-4 text-[11px] text-slate-500 dark:text-slate-400">
                    {m.source_note || 'Measured live via eval runner'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Score Summary Cards at Bottom */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {models.map((m) => {
          const isTopPick = m.agriAdvisorScore === highest_score;
          return (
            <div
              key={m.id}
              className={`bg-white dark:bg-slate-900 border rounded-xl p-4 shadow-sm space-y-3 transition ${
                isTopPick
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate max-w-[110px]">{m.name}</h4>
                  <span className="text-[10px] text-slate-400">{m.provider}</span>
                </div>
                {isTopPick && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Top Pick
                  </span>
                )}
              </div>

              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Score
                </div>
                <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {m.agriAdvisorScore}
                </div>
              </div>

              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isTopPick ? 'bg-emerald-600' : 'bg-slate-400'}`}
                  style={{ width: `${m.agriAdvisorScore}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] pt-1 text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                <span>{m.free_tier ? 'Free' : `$${m.cost_input_per_m}/M`}</span>
                <span>{m.latency_ms} ms</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ModelComparison;
