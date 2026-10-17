import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Copy, 
  RotateCcw, 
  Save, 
  Check, 
  Sliders, 
  Code2, 
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { promptsApi } from '@/api/promptsApi';
import { type PromptTemplate } from '@/mocks/data';
import { UncertaintyBadge } from '@/components/UncertaintyBadge';

export const PromptLab: React.FC = () => {
  const { t } = useTranslation();
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [activePromptId, setActivePromptId] = useState<string>('p-1');
  const [templateText, setTemplateText] = useState('');
  const [model, setModel] = useState('GPT-4o');
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [previewResult, setPreviewResult] = useState<any | null>(null);
  const [isRunningPreview, setIsRunningPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    promptsApi.getPrompts().then((items) => {
      setPrompts(items);
      if (items.length > 0) {
        setActivePromptId(items[0].id);
        setTemplateText(items[0].template);
      }
    });
  }, []);

  const activePrompt = prompts.find((p) => p.id === activePromptId) || prompts[0];

  const handleSelectPrompt = (id: string) => {
    setActivePromptId(id);
    const p = prompts.find((item) => item.id === id);
    if (p) {
      setTemplateText(p.template);
      setPreviewResult(null);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(templateText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    if (activePrompt) {
      setTemplateText(activePrompt.template);
    }
  };

  const handleSave = async () => {
    await promptsApi.updatePrompt(activePromptId, templateText);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleRunPreview = async () => {
    setIsRunningPreview(true);
    try {
      const res = await promptsApi.runPromptPreview(activePromptId, model, temperature, maxTokens);
      setPreviewResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRunningPreview(false);
    }
  };

  if (!activePrompt) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading prompt lab...</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('nav.promptLab', 'Prompt Lab')}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Edit and preview prompt templates for each AI analysis step.
        </p>
      </div>

      {/* Step Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {prompts.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleSelectPrompt(p.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activePromptId === p.id
                ? 'bg-emerald-800 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            {p.category}
          </button>
        ))}
      </div>

      {/* 2 Column Grid: Editor (Left) & Preview Panel (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Template Editor */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {activePrompt.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {activePrompt.subtitle}
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
                <span>{saved ? 'Saved' : 'Save'}</span>
              </button>
            </div>
          </div>

          {/* Template Textarea */}
          <textarea
            rows={14}
            value={templateText}
            onChange={(e) => setTemplateText(e.target.value)}
            className="w-full text-xs font-mono p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none leading-relaxed transition"
          />

          {/* Template Variables */}
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Template Variables
            </span>
            <div className="flex flex-wrap gap-2">
              {activePrompt.variables.map((v) => (
                <span
                  key={v}
                  className="px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-slate-100 dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 border border-slate-200 dark:border-slate-700"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Model Output Preview & Settings */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Model Output Preview
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
                    <span>Running...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run Preview</span>
                  </>
                )}
              </button>
            </div>

            {/* Output Box */}
            <div className="min-h-[220px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 font-mono text-xs overflow-y-auto max-h-[300px]">
              {previewResult ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-400">
                    <span>Model: {previewResult.model}</span>
                    <UncertaintyBadge band={previewResult.output.uncertainty_level} size="sm" />
                  </div>
                  <pre className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed text-[11px]">
                    {JSON.stringify(previewResult.output, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-10 text-slate-400">
                  <Code2 className="w-8 h-8 mb-2 opacity-40" />
                  <p className="font-medium text-xs text-slate-600 dark:text-slate-300">
                    Click "Run Preview" to test this template
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Uses current farm data to simulate structured LLM inference
                  </p>
                </div>
              )}
            </div>

            {/* Preview Settings */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Preview Settings
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
                  <option value="GPT-4o">GPT-4o</option>
                  <option value="Claude 3.5 Sonnet">Claude 3.5 Sonnet</option>
                  <option value="Gemini 1.5 Pro">Gemini 1.5 Pro</option>
                  <option value="Llama 3.1 70B">Llama 3.1 70B</option>
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
    </div>
  );
};
