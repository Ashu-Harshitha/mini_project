import React, { useState, useEffect } from 'react';
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
  Layers
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { evaluationApi } from '@/api/evaluationApi';
import { type EvaluationData } from '@/mocks/data';

export const Evaluation: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<EvaluationData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'failures'>('overview');

  useEffect(() => {
    evaluationApi.getEvaluationData().then(setData);
  }, []);

  if (!data) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading evaluation benchmarks...</div>;
  }

  const metrics = [
    { label: 'Image Accuracy', value: data.imageAccuracy, change: '+4% vs last month', color: 'bg-emerald-600' },
    { label: 'Groundedness', value: data.groundedness, change: '-1% vs last month', color: 'bg-emerald-600' },
    { label: 'Uncertainty Calibration', value: data.uncertaintyCalibration, change: '+5% vs last month', color: 'bg-emerald-600' },
    { label: 'Safety Score', value: data.safetyScore, change: '+2% vs last month', color: 'bg-emerald-600' },
    { label: 'Environmental Awareness', value: data.environmentalAwareness, change: '+1% vs last month', color: 'bg-amber-500' },
    { label: 'Format Clarity', value: data.formatClarity, change: '+3% vs last month', color: 'bg-emerald-600' },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('nav.evaluation', 'Evaluation')}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Model performance metrics, quality scores, and failure case analysis.
        </p>
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
          Overview
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
          Trends
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
          Failure Cases
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
              {m.value}
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${m.color}`} style={{ width: `${m.value}%` }} />
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
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
              <RadarChart data={data.radarMetrics} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
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
            Quality & Groundedness Trends — 6 Months
          </h3>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trends}>
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis domain={[60, 100]} stroke="#94a3b8" fontSize={11} tickLine={false} />
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
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* FAILURE CASES TAB */}
      {activeTab === 'failures' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Automated Failure Cases & Calibrations
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Edge cases flagged by agronomist review or automated safety guardrails
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Case</th>
                  <th className="py-3 px-4">Crop</th>
                  <th className="py-3 px-4">Model</th>
                  <th className="py-3 px-4">Root Cause</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Resolution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {data.failureCases.map((fc) => (
                  <tr key={fc.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                      {fc.caseId}
                    </td>
                    <td className="py-3 px-4 font-medium">{fc.crop}</td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{fc.model}</td>
                    <td className="py-3 px-4 max-w-sm">{fc.rootCause}</td>
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
        </div>
      )}
    </div>
  );
};
