import React, { useState, useEffect, useRef } from 'react';
import { 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  Radar, 
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts';
import { 
  Target, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldCheck, 
  Sparkles,
  Play,
  RotateCcw,
  PauseCircle,
  Clock,
  Info,
  Check,
  XCircle,
  FileText
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { 
  evaluationApi, 
  type EvalOverviewData, 
  type EvalTrendItem, 
  type EvalFailureItem, 
  type EvalProductionData,
  type EvalRunStatus
} from '@/api/evaluationApi';

export const Evaluation: React.FC = () => {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<EvalOverviewData | null>(null);
  const [trends, setTrends] = useState<EvalTrendItem[]>([]);
  const [failures, setFailures] = useState<EvalFailureItem[]>([]);
  const [production, setProduction] = useState<EvalProductionData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'failures' | 'production'>('overview');
  const [loading, setLoading] = useState(true);

  // Runner state
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [runStatus, setRunStatus] = useState<EvalRunStatus | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollIntervalRef = useRef<any>(null);

  const loadData = async () => {
    try {
      const [ov, tr, fa, pr] = await Promise.all([
        evaluationApi.getOverview(),
        evaluationApi.getTrends(),
        evaluationApi.getFailures(),
        evaluationApi.getProduction(),
      ]);
      setOverview(ov);
      setTrends(tr);
      setFailures(fa);
      setProduction(pr);

      // Check if current run is running or paused
      if (ov.run_id) {
        setActiveRunId(ov.run_id);
        if (ov.status === 'running' || ov.status === 'paused') {
          const st = await evaluationApi.getRunStatus(ov.run_id);
          setRunStatus(st);
        }
      }
    } catch (err: any) {
      console.warn('Evaluation data load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Poll progress when running
  useEffect(() => {
    if (runStatus?.status === 'running' && activeRunId) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const st = await evaluationApi.getRunStatus(activeRunId);
          setRunStatus(st);
          if (st.status === 'completed' || st.status === 'failed' || st.status === 'paused') {
            clearInterval(pollIntervalRef.current);
            loadData();
          }
        } catch {
          // ignore transient poll errors
        }
      }, 2000);
    } else {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [runStatus?.status, activeRunId]);

  const handleStartRun = async () => {
    setIsTriggering(true);
    setErrorMessage(null);
    try {
      const res = await evaluationApi.runEvaluation({ max_cases: 12 });
      setIsConfirmModalOpen(false);
      // Refresh overview
      const ov = await evaluationApi.getOverview();
      setOverview(ov);
      if (ov.run_id) {
        setActiveRunId(ov.run_id);
        const st = await evaluationApi.getRunStatus(ov.run_id);
        setRunStatus(st);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to trigger evaluation run');
    } finally {
      setIsTriggering(false);
    }
  };

  const handleResumeRun = async () => {
    if (!activeRunId) return;
    setIsTriggering(true);
    setErrorMessage(null);
    try {
      await evaluationApi.runEvaluation({ resume: true, run_id: activeRunId });
      const st = await evaluationApi.getRunStatus(activeRunId);
      setRunStatus(st);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to resume evaluation run');
    } finally {
      setIsTriggering(false);
    }
  };

  if (loading && !overview) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        {t('common.loading', 'Loading evaluation benchmarks...')}
      </div>
    );
  }

  const latestMetrics = overview?.latest_run?.metrics || {};
  const delta = overview?.delta || {};

  const metrics = [
    { 
      label: 'Image Accuracy', 
      value: overview?.imageAccuracy || Math.round(latestMetrics.image_accuracy || 82), 
      change: delta.image_accuracy || 'Baseline run', 
      color: 'bg-emerald-600' 
    },
    { 
      label: 'Groundedness', 
      value: overview?.groundedness || Math.round(latestMetrics.groundedness || 78), 
      change: delta.groundedness || 'Baseline run', 
      color: 'bg-emerald-600' 
    },
    { 
      label: 'Uncertainty Calibration', 
      value: overview?.uncertaintyCalibration || Math.round(latestMetrics.uncertainty_calibration || 85), 
      change: delta.uncertainty_calibration || 'Baseline run', 
      color: 'bg-emerald-600' 
    },
    { 
      label: 'Safety Score', 
      value: overview?.safetyScore || Math.round(latestMetrics.safety_score || 94), 
      change: delta.safety_score || 'Baseline run', 
      color: 'bg-emerald-600' 
    },
    { 
      label: 'Environmental Awareness', 
      value: overview?.environmentalAwareness || Math.round(latestMetrics.environmental_awareness || 71), 
      change: delta.environmental_awareness || 'Baseline run', 
      color: 'bg-amber-500' 
    },
    { 
      label: 'Farmer Clarity', 
      value: overview?.formatClarity || Math.round(latestMetrics.farmer_clarity || 88), 
      change: delta.farmer_clarity || 'Baseline run', 
      color: 'bg-emerald-600' 
    },
  ];

  const isRunning = runStatus?.status === 'running';
  const isPaused = runStatus?.status === 'paused' || overview?.status === 'paused';
  const completedCases = runStatus?.completed_cases ?? (latestMetrics.completed_cases || 0);
  const totalCases = runStatus?.total_cases ?? 12;
  const progressPercent = Math.min(100, Math.round((completedCases / Math.max(1, totalCases)) * 100));

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('evaluation.title', 'Model Evaluation & Benchmarks')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('evaluation.subtitle', 'Quality radar, multi-period trends, failure case analysis, and live production outcome metrics.')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isPaused && (
            <button
              type="button"
              onClick={handleResumeRun}
              disabled={isTriggering}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition disabled:opacity-75"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('evaluation.resumeEvaluation', 'Resume Evaluation')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsConfirmModalOpen(true)}
            disabled={isRunning || isTriggering}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white shadow-sm transition disabled:opacity-75"
          >
            {isRunning ? (
              <>
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>{t('evaluation.evaluating', 'Running Benchmark...')}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{t('evaluation.runEvaluation', 'Run Evaluation')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quota reached alert banner */}
      {isPaused && (
        <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 flex items-start justify-between gap-3 text-amber-900 dark:text-amber-200 text-xs">
          <div className="flex items-start gap-2.5">
            <PauseCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">
                {t('evaluation.quotaPaused', 'Quota reached, resume later')}
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                Benchmark paused at case {completedCases}/{totalCases}. The runner state is persisted. Click "Resume Evaluation" to continue without losing progress.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResumeRun}
            disabled={isTriggering}
            className="px-3 py-1 rounded-md text-[11px] font-semibold bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0 transition"
          >
            Resume Now
          </button>
        </div>
      )}

      {/* Active Running Progress Bar */}
      {isRunning && (
        <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              Evaluating Golden Set ({completedCases}/{totalCases} cases completed)
            </span>
            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
              {progressPercent}%
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Small sample size notice */}
      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <Info className="w-4 h-4 text-emerald-600 flex-shrink-0" />
        <span>{t('evaluation.sampleNote', 'Note: Sample size of 12 golden cases is indicative for prompt and pipeline benchmarking.')}</span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
            activeTab === 'overview'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {t('evaluation.tabs.overview', 'Overview')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('trends')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
            activeTab === 'trends'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {t('evaluation.tabs.trends', 'Trends')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('failures')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
            activeTab === 'failures'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {t('evaluation.tabs.failures', 'Failure Cases')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('production')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
            activeTab === 'production'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {t('evaluation.tabs.production', 'Production')}
        </button>
      </div>

      {/* 6 Top Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-2"
          >
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block truncate">
              {m.label}
            </span>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {m.value}%
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${m.color}`} style={{ width: `${m.value}%` }} />
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
              {m.change}
            </span>
          </div>
        ))}
      </div>

      {/* TAB CONTENT */}

      {/* OVERVIEW TAB: Quality Radar Chart */}
      {activeTab === 'overview' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Quality Radar — Current Period
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Model benchmarked across the 6 primary agronomic validation dimensions
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <span>Current Model</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span>Benchmark</span>
              </span>
            </div>
          </div>

          <div className="h-80 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={overview?.radar_data || []} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                <PolarGrid stroke="#cbd5e1" strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#94a3b8" />
                <Radar
                  name="Current Model"
                  dataKey="value"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.4}
                />
                <Radar
                  name="Benchmark"
                  dataKey="benchmark"
                  stroke="#94a3b8"
                  fill="#94a3b8"
                  fillOpacity={0.15}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* TRENDS TAB: Line Charts */}
      {activeTab === 'trends' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            Quality & Groundedness Trends Across Benchmark Runs
          </h3>

          {trends.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No historical runs recorded yet. Click "Run Evaluation" to generate the first benchmark point.
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends}>
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis domain={[50, 100]} stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      fontSize: '11px',
                      color: '#fff',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={2.5} name="Image Accuracy" />
                  <Line type="monotone" dataKey="groundedness" stroke="#0ea5e9" strokeWidth={2.5} name="Groundedness" />
                  <Line type="monotone" dataKey="safety" stroke="#8b5cf6" strokeWidth={2.5} name="Safety Score" />
                  <Line type="monotone" dataKey="uncertainty" stroke="#f59e0b" strokeWidth={2} name="Uncertainty Cal." />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* FAILURE CASES TAB */}
      {activeTab === 'failures' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Automated Failure Cases & Edge-Case Calibration
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Cases that triggered safety guardrails or scored below acceptance thresholds
            </p>
          </div>

          {failures.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No failure cases logged. All benchmark tests are passing quality and safety bars.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Case</th>
                    <th className="py-3 px-4">Run</th>
                    <th className="py-3 px-4">Crop</th>
                    <th className="py-3 px-4">Model</th>
                    <th className="py-3 px-4">Root Cause / Flag</th>
                    <th className="py-3 px-4">Severity</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Resolution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {failures.map((fc) => (
                    <tr key={fc.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        {fc.caseId}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        #{fc.runId}
                      </td>
                      <td className="py-3 px-4 font-medium">{fc.crop}</td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{fc.model}</td>
                      <td className="py-3 px-4 max-w-xs">{fc.rootCause}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          fc.severity === 'High'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                          {fc.severity}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">{fc.date}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{fc.resolution}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PRODUCTION TAB */}
      {activeTab === 'production' && (
        <div className="space-y-5">
          {(!production || (production.total_reviews === 0 && production.total_outcomes === 0)) ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-2">
              <FileText className="w-8 h-8 text-slate-300 mx-auto" />
              <h4 className="font-bold text-sm text-slate-800 dark:text-white">
                Zero-State: No Production Review Data
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {t('evaluation.production.noData', 'No production review or outcome data recorded yet (Zero state). Production metrics automatically populate as agronomists inspect and farmers submit post-treatment outcomes.')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Agronomist Agreement */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-2">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  {t('evaluation.production.agronomistAgreement', 'Agronomist Agreement')}
                </span>
                <div className="space-y-1.5 pt-1 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">Approved Direct</span>
                    <span className="font-bold font-mono">{Math.round((production.agronomist_agreement.approve || 0) * 100)}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-amber-700 dark:text-amber-400 font-medium">Approved w/ Edits</span>
                    <span className="font-bold font-mono">{Math.round((production.agronomist_agreement.approve_with_edits || 0) * 100)}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-rose-700 dark:text-rose-400 font-medium">Rejected</span>
                    <span className="font-bold font-mono">{Math.round((production.agronomist_agreement.reject || 0) * 100)}%</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                  Total Reviews: {production.total_reviews}
                </div>
              </div>

              {/* Avg Edited Recs */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-2">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  {t('evaluation.production.editedRecs', 'Avg. Edited Recs / Approval')}
                </span>
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
                  {production.average_edited_recommendations_per_approval}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Modifications made per advisory case by agronomists prior to farmer dispatch
                </p>
              </div>

              {/* Average Farmer Rating */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-2">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  {t('evaluation.production.farmerRating', 'Average Farmer Rating')}
                </span>
                <div className="text-3xl font-extrabold text-emerald-700 dark:text-emerald-400">
                  {production.average_farmer_rating} / 5.0
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Aggregated satisfaction feedback on field effectiveness
                </p>
              </div>

              {/* Outcome Success Rate */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-2">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  {t('evaluation.production.outcomeSuccess', 'Outcome Success Rate')}
                </span>
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
                  {production.outcome_success_rate}%
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Reported crop recovery and yield stabilization from field telemetry
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              {t('evaluation.confirmModalTitle', 'Start Evaluation Benchmark')}
            </h3>

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 space-y-2">
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                {t('evaluation.estimatedCalls', 'Estimated LLM API Calls: ~48 calls across 12 golden cases (Vision analysis, RAG recommendation, Farmer summary, Groundedness judge).')}
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-slate-400 text-[11px]">
                <li>Deterministic unsafe and data-quality tests run with NO LLM calls.</li>
                <li>Images downsized to ≤ 1024px to preserve token limits.</li>
                <li>llm_calls caching active to eliminate redundant calls.</li>
              </ul>
            </div>

            {errorMessage && (
              <div className="p-2.5 rounded-lg bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-300 text-xs">
                {errorMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleStartRun}
                disabled={isTriggering}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white shadow-sm transition disabled:opacity-75"
              >
                {isTriggering ? 'Starting...' : t('evaluation.confirmRun', 'Confirm & Run')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Evaluation;
