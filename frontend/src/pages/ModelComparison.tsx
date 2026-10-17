import React, { useState, useEffect } from 'react';
import { Check, Info, Award, Zap, DollarSign, Clock, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { modelsApi } from '@/api/modelsApi';
import { type ModelComparisonItem } from '@/mocks/data';
import { useAppStore } from '@/store/useAppStore';

export const ModelComparison: React.FC = () => {
  const { t } = useTranslation();
  const { currentModel, setCurrentModel } = useAppStore();
  const [models, setModels] = useState<ModelComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    modelsApi.getModels().then((data) => {
      setModels(data);
      setLoading(false);
    });
  }, []);

  // Fix #2: Top Pick badge must follow highest AgriAdvisor score dynamically
  const highestScore = models.length > 0 ? Math.max(...models.map((m) => m.agriAdvisorScore)) : 87;

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        {t('common.loading', 'Loading model comparison data...')}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('nav.modelComparison', 'Model Comparison')}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Compare GenAI models on capability, cost, and agricultural performance.
        </p>
      </div>

      {/* Model Selection Pills Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {models.map((m) => {
          const isSelected = currentModel === m.name;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setCurrentModel(m.name)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                isSelected
                  ? 'bg-emerald-800 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>{m.name}</span>
              {isSelected && <Check className="w-3.5 h-3.5" />}
            </button>
          );
        })}
      </div>

      {/* Green Recommendation Box */}
      <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
        <Info className="w-5 h-5 text-emerald-700 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="font-semibold text-emerald-950 dark:text-white">Recommendation: </strong>
          Claude 3.5 Sonnet scores highest on output quality (91) and AgriAdvisor benchmarks (87) with a strong privacy posture (no training on inputs). For cost-sensitive deployments, consider GPT-4o or Llama 3.1 self-hosted. Gemini excels when 1M-token context is needed for long-form agronomic reports.
        </p>
      </div>

      {/* Comparison Matrix Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="py-4 px-5 min-w-[160px]">Dimension</th>
                {models.map((m) => {
                  const isTopPick = m.agriAdvisorScore === highestScore;
                  return (
                    <th key={m.id} className="py-4 px-4 min-w-[170px]">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white capitalize">
                            {m.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-normal lowercase">
                            {m.provider}
                          </div>
                        </div>

                        {/* Top Pick Badge follows highest score */}
                        {isTopPick && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-700 text-white shadow-sm">
                            <Award className="w-3 h-3" />
                            {t('common.topPick', 'Top Pick')}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              <tr>
                <td className="py-3.5 px-5 font-semibold text-slate-900 dark:text-white">Capability Score</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3.5 px-4 font-medium">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${m.capabilityScore}%` }} />
                      </div>
                      <span>{m.capabilityScore}%</span>
                    </div>
                  </td>
                ))}
              </tr>

              <tr>
                <td className="py-3.5 px-5 font-semibold text-slate-900 dark:text-white">Cost / 1K tokens</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3.5 px-4 font-mono font-medium">
                    {m.costPer1kTokens}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="py-3.5 px-5 font-semibold text-slate-900 dark:text-white">Avg. Latency</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3.5 px-4 font-mono">
                    {m.avgLatency}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="py-3.5 px-5 font-semibold text-slate-900 dark:text-white">Context Window</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3.5 px-4 font-mono">
                    {m.contextWindow}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="py-3.5 px-5 font-semibold text-slate-900 dark:text-white">Multimodal</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3.5 px-4">
                    {m.multimodal ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Yes (Vision)</span>
                    ) : (
                      <span className="text-slate-400">Text only</span>
                    )}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="py-3.5 px-5 font-semibold text-slate-900 dark:text-white">Privacy Model</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3.5 px-4">
                    {m.privacyModel}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="py-3.5 px-5 font-semibold text-slate-900 dark:text-white">Integration</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3.5 px-4 font-mono text-[11px]">
                    {m.integration}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="py-3.5 px-5 font-semibold text-slate-900 dark:text-white">Output Quality</td>
                {models.map((m) => (
                  <td key={m.id} className="py-3.5 px-4 font-medium">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-sky-600 h-full rounded-full" style={{ width: `${m.outputQuality}%` }} />
                      </div>
                      <span>{m.outputQuality}%</span>
                    </div>
                  </td>
                ))}
              </tr>

              <tr className="bg-slate-50/70 dark:bg-slate-800/40">
                <td className="py-4 px-5 font-bold text-slate-900 dark:text-white">AgriAdvisor Score</td>
                {models.map((m) => {
                  const isTopPick = m.agriAdvisorScore === highestScore;
                  return (
                    <td key={m.id} className="py-4 px-4 font-bold text-sm">
                      <span className={isTopPick ? 'text-emerald-700 dark:text-emerald-400 text-base' : 'text-slate-900 dark:text-white'}>
                        {m.agriAdvisorScore}
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Score Summary Cards at Bottom */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {models.map((m) => {
          const isTopPick = m.agriAdvisorScore === highestScore;
          return (
            <div
              key={m.id}
              className={`bg-white dark:bg-slate-900 border rounded-xl p-5 shadow-sm space-y-3 transition ${
                isTopPick
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">{m.name}</h4>
                  <span className="text-[10px] text-slate-400">{m.provider}</span>
                </div>
                {isTopPick && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Top Pick
                  </span>
                )}
              </div>

              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  AgriAdvisor Score
                </div>
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {m.agriAdvisorScore}
                </div>
              </div>

              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isTopPick ? 'bg-emerald-600' : 'bg-slate-400'}`}
                  style={{ width: `${m.agriAdvisorScore}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                <span>Cost: {m.costPer1kTokens}</span>
                <span>Latency: {m.avgLatency}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
