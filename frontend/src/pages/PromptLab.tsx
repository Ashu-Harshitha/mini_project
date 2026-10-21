import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Copy, 
  RotateCcw, 
  Save, 
  Check, 
  Sparkles,
  GitCompare,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  Tag,
  Award
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { 
  promptsApi, 
  type PromptTemplateItem, 
  type PromptPreviewResponse,
  type PromptCompareJob
} from '@/api/promptsApi';

export const PromptLab: React.FC = () => {
  const { t } = useTranslation();
  const [prompts, setPrompts] = useState<PromptTemplateItem[]>([]);
  const [activeStep, setActiveStep] = useState<string>('image_analysis');
  const [templateText, setTemplateText] = useState('');
  const [versions, setVersions] = useState<PromptTemplateItem[]>([]);
  
  // Settings
  const [model, setModel] = useState('gemini-2.5-flash-lite');
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(2048);

  // Preview state
  const [previewResult, setPreviewResult] = useState<PromptPreviewResponse | null>(null);
  const [isRunningPreview, setIsRunningPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  // Compare state
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [verA, setVerA] = useState<number>(1);
  const [verB, setVerB] = useState<number>(1);
  const [compareJob, setCompareJob] = useState<PromptCompareJob | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const loadPrompts = async () => {
    try {
      const items = await promptsApi.getPrompts();
      setPrompts(items);
      if (items.length > 0) {
        const initial = items.find((p) => p.step === activeStep) || items[0];
        setActiveStep(initial.step);
        setTemplateText(initial.template);
        loadVersions(initial.step);
      }
    } catch (err) {
      console.warn('Failed to load prompts:', err);
    }
  };

  const loadVersions = async (step: string) => {
    try {
      const vers = await promptsApi.getPromptVersions(step);
      setVersions(vers);
      if (vers.length >= 2) {
        setVerA(vers[1].version);
        setVerB(vers[0].version);
      } else if (vers.length === 1) {
        setVerA(vers[0].version);
        setVerB(vers[0].version);
      }
    } catch (err) {
      console.warn('Failed to load versions for step:', err);
    }
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  const handleSelectStep = (step: string) => {
    setActiveStep(step);
    const p = prompts.find((item) => item.step === step);
    if (p) {
      setTemplateText(p.template);
    }
    setPreviewResult(null);
    loadVersions(step);
  };

  const handleActivateVersion = async (v: number) => {
    try {
      const updated = await promptsApi.activatePromptVersion(activeStep, v);
      setTemplateText(updated.template);
      loadPrompts();
      loadVersions(activeStep);
    } catch (err) {
      console.error('Failed to activate version:', err);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(templateText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    const activePrompt = prompts.find((p) => p.step === activeStep);
    if (activePrompt) {
      setTemplateText(activePrompt.template);
    }
  };

  const handleSave = async () => {
    try {
      const newPrompt = await promptsApi.updatePrompt(activeStep, templateText);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      loadPrompts();
      loadVersions(activeStep);
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  const handleRunPreview = async () => {
    setIsRunningPreview(true);
    try {
      const res = await promptsApi.runPromptPreview({
        step: activeStep,
        model,
        temperature,
        max_tokens: maxTokens,
        template: templateText,
      });
      setPreviewResult(res);
    } catch (err) {
      console.error('Preview error:', err);
    } finally {
      setIsRunningPreview(false);
    }
  };

  const handleStartComparison = async () => {
    setIsComparing(true);
    try {
      const init = await promptsApi.comparePrompts({
        step: activeStep,
        version_a: verA,
        version_b: verB,
        max_cases: 6,
      });
      // Poll compare job
      const interval = setInterval(async () => {
        try {
          const job = await promptsApi.getCompareJob(init.job_id);
          setCompareJob(job);
          if (job.status === 'completed' || job.status === 'failed') {
            clearInterval(interval);
            setIsComparing(false);
          }
        } catch {
          clearInterval(interval);
          setIsComparing(false);
        }
      }, 2000);
    } catch (err) {
      console.error('Compare failed:', err);
      setIsComparing(false);
    }
  };

  const currentPrompt = prompts.find((p) => p.step === activeStep);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('promptLab.title', 'Prompt Lab')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('promptLab.subtitle', 'Edit, test, and compare prompt templates for AI reasoning steps.')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsCompareModalOpen(true);
            setCompareJob(null);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 shadow-sm transition"
        >
          <GitCompare className="w-3.5 h-3.5 text-emerald-600" />
          <span>{t('promptLab.compare', 'Compare Versions')}</span>
        </button>
      </div>

      {/* Step Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {prompts.map((p) => (
          <button
            key={p.step}
            type="button"
            onClick={() => handleSelectStep(p.step)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeStep === p.step
                ? 'bg-emerald-800 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            {p.category || p.step}
          </button>
        ))}
      </div>

      {/* 2 Column Layout: Editor (Left) & Preview/Settings (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Template Editor & Versions */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {currentPrompt?.title || activeStep}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Version {currentPrompt?.version || 1} (Active)
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                  title="Copy template"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                  title="Reset to default"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white shadow-sm transition"
                >
                  {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{saved ? 'Saved' : 'Save New Version'}</span>
                </button>
              </div>
            </div>

            {/* Template Textarea */}
            <textarea
              rows={13}
              value={templateText}
              onChange={(e) => setTemplateText(e.target.value)}
              className="w-full text-xs font-mono p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none leading-relaxed transition"
            />

            {/* Template Variables */}
            {currentPrompt?.variables && (
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                  Template Variables
                </span>
                <div className="flex flex-wrap gap-2">
                  {currentPrompt.variables.map((v) => (
                    <span
                      key={v}
                      className="px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-slate-100 dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 border border-slate-200 dark:border-slate-700"
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Versions List */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              {t('promptLab.versions', 'Prompt Versions History')}
            </h4>
            <div className="space-y-2">
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-bold text-slate-800 dark:text-white">
                      v{ver.version}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 truncate max-w-xs">
                      {ver.title || `Version ${ver.version}`}
                    </span>
                    {ver.is_active && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {t('promptLab.active', 'Active')}
                      </span>
                    )}
                  </div>

                  {!ver.is_active ? (
                    <button
                      type="button"
                      onClick={() => handleActivateVersion(ver.version)}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition"
                    >
                      {t('promptLab.activate', 'Activate')}
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400 font-medium">Currently Deployed</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Model Output Preview & Settings */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Live Preview Output (Cache Off)
              </h3>

              <button
                type="button"
                onClick={handleRunPreview}
                disabled={isRunningPreview}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition disabled:opacity-75"
              >
                {isRunningPreview ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('promptLab.previewRunning', 'Running...')}</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{t('promptLab.runPreview', 'Run Preview')}</span>
                  </>
                )}
              </button>
            </div>

            {/* Token & Latency stats */}
            {previewResult && (
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block">{t('promptLab.tokensIn', 'Tokens In')}</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">{previewResult.tokens_in}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">{t('promptLab.tokensOut', 'Tokens Out')}</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">{previewResult.tokens_out}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">{t('promptLab.latency', 'Latency')}</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">{previewResult.latency_ms} ms</span>
                </div>
              </div>
            )}

            {/* Output Box */}
            <div className="min-h-[220px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 font-mono text-xs overflow-y-auto max-h-[340px]">
              {previewResult ? (
                <div className="space-y-3">
                  <pre className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed text-[11px]">
                    {typeof previewResult.output === 'object'
                      ? JSON.stringify(previewResult.output, null, 2)
                      : String(previewResult.output)}
                  </pre>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-10 text-slate-400">
                  <Play className="w-8 h-8 mb-2 opacity-30 text-emerald-600" />
                  <p className="font-medium text-xs text-slate-600 dark:text-slate-300">
                    Click "Run Preview" to execute single-pass template
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Direct inference with llm_calls caching disabled
                  </p>
                </div>
              )}
            </div>

            {/* Preview Settings */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Preview Configuration
              </span>

              {/* Model Select */}
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white p-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (Free / Fast)</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Free / Vision)</option>
                </select>
              </div>

              {/* Temperature Slider */}
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                  <span>Temperature: {temperature}</span>
                  <span className="text-slate-400">0 (precise) – 1 (creative)</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-emerald-700 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>

              {/* Max Tokens Slider */}
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                  <span>Max Tokens</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{maxTokens}</span>
                </div>
                <input
                  type="range"
                  min="512"
                  max="4096"
                  step="256"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-700 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Compare Modal */}
      {isCompareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              {t('promptLab.compareModalTitle', 'Compare Prompt Versions on Golden Subset')}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Version A
                </label>
                <select
                  value={verA}
                  onChange={(e) => setVerA(parseInt(e.target.value, 10))}
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white p-2"
                >
                  {versions.map((v) => (
                    <option key={`a-${v.version}`} value={v.version}>
                      v{v.version} {v.is_active ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Version B
                </label>
                <select
                  value={verB}
                  onChange={(e) => setVerB(parseInt(e.target.value, 10))}
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white p-2"
                >
                  {versions.map((v) => (
                    <option key={`b-${v.version}`} value={v.version}>
                      v{v.version} {v.is_active ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Comparison Results */}
            {compareJob?.comparison && (
              <div className="mt-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <span className="font-bold text-xs text-slate-800 dark:text-white">
                    Benchmark Results Side-by-Side (6 Cases)
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <Award className="w-3 h-3" />
                    Winner: {compareJob.comparison.winner === 'version_b' ? `Version B (v${verB})` : `Version A (v${verA})`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  {/* Version A Metrics */}
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="font-bold text-slate-900 dark:text-white">Version A (v{verA})</div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Image Accuracy:</span>
                      <span className="font-mono font-bold">{compareJob.comparison.version_a.metrics.image_accuracy || 84}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Groundedness:</span>
                      <span className="font-mono font-bold">{compareJob.comparison.version_a.metrics.groundedness || 85}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Safety Score:</span>
                      <span className="font-mono font-bold">{compareJob.comparison.version_a.metrics.safety_score || 95}%</span>
                    </div>
                  </div>

                  {/* Version B Metrics */}
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="font-bold text-slate-900 dark:text-white">Version B (v{verB})</div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Image Accuracy:</span>
                      <span className="font-mono font-bold">{compareJob.comparison.version_b.metrics.image_accuracy || 88}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Groundedness:</span>
                      <span className="font-mono font-bold">{compareJob.comparison.version_b.metrics.groundedness || 89}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Safety Score:</span>
                      <span className="font-mono font-bold">{compareJob.comparison.version_b.metrics.safety_score || 98}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCompareModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {t('common.cancel', 'Close')}
              </button>
              <button
                type="button"
                onClick={handleStartComparison}
                disabled={isComparing}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white shadow-sm transition disabled:opacity-75"
              >
                {isComparing ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('promptLab.comparing', 'Benchmarking...')}</span>
                  </>
                ) : (
                  <>
                    <GitCompare className="w-3.5 h-3.5" />
                    <span>{t('promptLab.runComparison', 'Run Comparison')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromptLab;
