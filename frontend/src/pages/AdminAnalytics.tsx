import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Download,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  Activity,
  Layers,
  Star,
  FileSpreadsheet,
  Globe,
  RefreshCw,
  Building2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { analyticsApi, type AdminAnalyticsData } from '@/api/analyticsApi';

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444'];
const BAR_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];

export const AdminAnalytics: React.FC = () => {
  const { t } = useTranslation();

  const [preset, setPreset] = useState<'7' | '30' | '90' | 'custom'>('30');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exportingSection, setExportingSection] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sorting for agronomist table
  const [sortField, setSortField] = useState<'reviewed' | 'open' | 'turnaround' | 'rating'>('reviewed');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Compute ISO dates based on preset
  const { fromIso, toIso } = useMemo(() => {
    if (preset === 'custom') {
      return {
        fromIso: customFrom ? new Date(customFrom).toISOString() : undefined,
        toIso: customTo ? new Date(customTo + 'T23:59:59').toISOString() : undefined,
      };
    }
    const days = parseInt(preset, 10);
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - days);
    return {
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
    };
  }, [preset, customFrom, customTo]);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await analyticsApi.getAnalytics({ from: fromIso, to: toIso });
      setData(res);
    } catch (err: any) {
      console.error('Failed to load analytics:', err);
      setErrorMsg(err.message || 'Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [fromIso, toIso]);

  const handleExportCsv = async (section: string) => {
    setExportingSection(section);
    try {
      await analyticsApi.downloadExportCsv(section, fromIso, toIso);
    } catch (err: any) {
      alert(`Export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setExportingSection(null);
    }
  };

  // Helper to render KPI Delta
  const renderDelta = (
    current: number | null,
    prev: number | null,
    lowerIsBetter: boolean = false,
    formatPct: boolean = false
  ) => {
    if (current === null || prev === null) {
      return <span className="text-xs text-slate-400 font-medium">No prior data</span>;
    }
    const diff = current - prev;
    if (Math.abs(diff) < 0.0001) {
      return <span className="text-xs text-slate-400 font-medium">0% vs prior</span>;
    }

    const pct = prev > 0 ? (diff / prev) * 100 : 0;
    const isGood = lowerIsBetter ? diff < 0 : diff > 0;

    const displayDiff = formatPct
      ? `${(diff * 100).toFixed(1)}%`
      : Math.abs(pct) > 0.1
      ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
      : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}`;

    return (
      <div className={`flex items-center gap-1 text-xs font-bold ${isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
        {diff > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
        <span>{displayDiff}</span>
        <span className="text-[10px] text-slate-400 font-normal">vs prev</span>
      </div>
    );
  };

  // Sorted agronomists
  const sortedAgronomists = useMemo(() => {
    if (!data?.agent_stats) return [];
    return [...data.agent_stats].sort((a, b) => {
      let valA: number = 0;
      let valB: number = 0;
      if (sortField === 'reviewed') {
        valA = a.reviewed;
        valB = b.reviewed;
      } else if (sortField === 'open') {
        valA = a.open;
        valB = b.open;
      } else if (sortField === 'turnaround') {
        valA = a.avg_hours_to_decision ?? 999;
        valB = b.avg_hours_to_decision ?? 999;
      } else if (sortField === 'rating') {
        valA = a.avg_rating ?? 0;
        valB = b.avg_rating ?? 0;
      }
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [data?.agent_stats, sortField, sortAsc]);

  const kpis = data?.kpis;

  return (
    <div className="space-y-8 pb-16 max-w-7xl mx-auto">
      {/* Page Header & Range Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {t('analytics.title', 'Admin Analytics Dashboard')}
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-bold bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-full">
              SQL Real-Time
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {t('analytics.subtitle', 'Comprehensive system performance, operational speed, triage workload, and agronomic insights')}
          </p>
        </div>

        {/* Date Selector & Global Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
            {(['7', '30', '90'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPreset(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  preset === d
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {d}d
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPreset('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                preset === 'custom'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {t('analytics.custom', 'Custom')}
            </button>
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-xs bg-transparent border-0 text-slate-700 dark:text-slate-200 focus:ring-0"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-xs bg-transparent border-0 text-slate-700 dark:text-slate-200 focus:ring-0"
              />
            </div>
          )}

          <button
            type="button"
            onClick={loadData}
            title="Refresh"
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs">
          {errorMsg}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            {t('analytics.kpisHeading', 'Key Performance Indicators')}
          </h2>
          <button
            type="button"
            onClick={() => handleExportCsv('kpis')}
            disabled={exportingSection === 'kpis'}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exportingSection === 'kpis' ? 'Exporting...' : t('analytics.exportKpis', 'Export KPIs CSV')}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* 1. Cases In Range */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {t('analytics.casesInRange', 'Cases In Range')}
            </span>
            <div className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
              {loading ? '-' : kpis?.cases_in_range.value ?? 0}
            </div>
            <div className="mt-1">
              {renderDelta(kpis?.cases_in_range.value ?? 0, kpis?.cases_in_range.previous_value ?? 0)}
            </div>
          </div>

          {/* 2. Avg Hours to Decision */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {t('analytics.avgHours', 'Avg Turnaround')}
            </span>
            <div className="mt-1 text-2xl font-black text-indigo-600 dark:text-indigo-400">
              {loading ? '-' : kpis?.avg_hours_to_decision.value !== null && kpis?.avg_hours_to_decision.value !== undefined ? `${kpis.avg_hours_to_decision.value}h` : '-'}
            </div>
            <div className="mt-1">
              {renderDelta(kpis?.avg_hours_to_decision.value ?? null, kpis?.avg_hours_to_decision.previous_value ?? null, true)}
            </div>
          </div>

          {/* 3. AI Agreement Rate */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {t('analytics.aiAgreement', 'AI Agreement Rate')}
            </span>
            <div className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {loading || data?.ai_agreement_rate === null || data?.ai_agreement_rate === undefined
                ? '-'
                : `${(data.ai_agreement_rate * 100).toFixed(1)}%`}
            </div>
            <span className="text-[10px] text-slate-400">Approved without edits</span>
          </div>

          {/* 4. Avg Farmer Rating */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {t('analytics.avgRating', 'Avg Rating')}
            </span>
            <div className="mt-1 text-2xl font-black text-amber-500 flex items-center gap-1">
              <span>{loading ? '-' : kpis?.avg_rating.value !== null && kpis?.avg_rating.value !== undefined ? kpis.avg_rating.value : '-'}</span>
              <Star className="w-4 h-4 fill-amber-500" />
            </div>
            <div className="mt-1">
              {renderDelta(kpis?.avg_rating.value ?? null, kpis?.avg_rating.previous_value ?? null)}
            </div>
          </div>

          {/* 5. Outcome Success Rate */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {t('analytics.outcomeRate', 'Outcome Success')}
            </span>
            <div className="mt-1 text-2xl font-black text-teal-600 dark:text-teal-400">
              {loading ? '-' : kpis?.outcome_success_rate.value !== null && kpis?.outcome_success_rate.value !== undefined ? `${(kpis.outcome_success_rate.value * 100).toFixed(0)}%` : '-'}
            </div>
            <div className="mt-1">
              {renderDelta(kpis?.outcome_success_rate.value ?? null, kpis?.outcome_success_rate.previous_value ?? null, false, true)}
            </div>
          </div>

          {/* 6. Unassigned Pool (Now) */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">
              {t('analytics.unassigned', 'Unassigned Now')}
            </span>
            <div className="mt-1 text-2xl font-black text-amber-600">
              {loading ? '-' : kpis?.unassigned_now.value ?? 0}
            </div>
            <span className="text-[10px] text-slate-400">Awaiting expert triage</span>
          </div>

          {/* 7. Pending Review (Now) */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">
              {t('analytics.pending', 'Pending Review')}
            </span>
            <div className="mt-1 text-2xl font-black text-blue-600">
              {loading ? '-' : kpis?.pending_now.value ?? 0}
            </div>
            <span className="text-[10px] text-slate-400">In agronomist review queue</span>
          </div>

          {/* 8. Reassignment Rate */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {t('analytics.reassignRate', 'Reassign Rate')}
            </span>
            <div className="mt-1 text-2xl font-black text-slate-700 dark:text-slate-300">
              {loading ? '-' : kpis?.reassign_rate.value !== null && kpis?.reassign_rate.value !== undefined ? `${(kpis.reassign_rate.value * 100).toFixed(1)}%` : '-'}
            </div>
            <div className="mt-1">
              {renderDelta(kpis?.reassign_rate.value ?? null, kpis?.reassign_rate.previous_value ?? null, true, true)}
            </div>
          </div>

          {/* 9. AI Degraded Rate */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {t('analytics.aiDegraded', 'AI Degraded Rate')}
            </span>
            <div className="mt-1 text-2xl font-black text-slate-700 dark:text-slate-300">
              {loading ? '-' : kpis?.ai_degraded_rate.value !== null && kpis?.ai_degraded_rate.value !== undefined ? `${(kpis.ai_degraded_rate.value * 100).toFixed(1)}%` : '-'}
            </div>
            <div className="mt-1">
              {renderDelta(kpis?.ai_degraded_rate.value ?? null, kpis?.ai_degraded_rate.previous_value ?? null, true, true)}
            </div>
          </div>

          {/* 10. Sensor Report Rate */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {t('analytics.sensorRate', 'Sensor Attached')}
            </span>
            <div className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {loading ? '-' : kpis?.sensor_report_rate.value !== null && kpis?.sensor_report_rate.value !== undefined ? `${(kpis.sensor_report_rate.value * 100).toFixed(1)}%` : '-'}
            </div>
            <div className="mt-1">
              {renderDelta(kpis?.sensor_report_rate.value ?? null, kpis?.sensor_report_rate.previous_value ?? null, false, true)}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Daily Volume Chart & Decision Mix Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cases Per Day Line Chart */}
        <div className="lg:col-span-2 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('analytics.casesPerDay', 'Case Throughput (Created vs Decided)')}
              </h3>
              <p className="text-xs text-slate-400">Zero-filled timeline over selected range</p>
            </div>
            <button
              type="button"
              onClick={() => handleExportCsv('cases')}
              disabled={exportingSection === 'cases'}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exportingSection === 'cases' ? 'Exporting...' : t('analytics.exportCases', 'Export Cases CSV')}</span>
            </button>
          </div>

          <div className="h-64 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">Loading chart...</div>
            ) : !data?.cases_per_day.length ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">No case activity recorded</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.cases_per_day} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '11px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line type="monotone" dataKey="created" name="Created" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="decided" name="Decided" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Decision Mix Donut */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('analytics.decisionMix', 'Decision Mix')}
              </h3>
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                AI Match: {data?.ai_agreement_rate !== null && data?.ai_agreement_rate !== undefined ? `${(data.ai_agreement_rate * 100).toFixed(0)}%` : '-'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">Agronomist review outcomes for cases</p>

            <div className="h-48 w-full flex items-center justify-center">
              {loading ? (
                <div className="text-xs text-slate-400">Loading chart...</div>
              ) : !data?.decision_mix || (data.decision_mix.approve === 0 && data.decision_mix.approve_with_edits === 0 && data.decision_mix.reject === 0) ? (
                <div className="text-xs text-slate-400">No decisions in range</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Approved', value: data.decision_mix.approve },
                        { name: 'With Edits', value: data.decision_mix.approve_with_edits },
                        { name: 'Rejected', value: data.decision_mix.reject },
                      ]}
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {PIE_COLORS.map((col, idx) => (
                        <Cell key={idx} fill={col} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
            <div>
              <span className="text-[10px] text-slate-400 block">Approve</span>
              <span className="text-sm font-black text-emerald-600">{data?.decision_mix.approve ?? 0}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">Edits</span>
              <span className="text-sm font-black text-amber-500">{data?.decision_mix.approve_with_edits ?? 0}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">Reject</span>
              <span className="text-sm font-black text-rose-500">{data?.decision_mix.reject ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Funnel & Response Time Buckets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Funnel */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            {t('analytics.funnel', 'Case Lifecycle Funnel')}
          </h3>
          <p className="text-xs text-slate-400 mb-5">Stage progression and dropout percentages</p>

          <div className="space-y-3">
            {data?.status_funnel.map((item, idx) => {
              const maxCount = data.status_funnel[0]?.count || 1;
              const widthPct = Math.max(8, Math.round((item.count / maxCount) * 100));
              return (
                <div key={item.stage} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="capitalize text-slate-700 dark:text-slate-300">
                      {idx + 1}. {item.stage.replace('_', ' ')}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{item.count}</span>
                      {idx > 0 && item.drop_off_pct > 0 && (
                        <span className="text-[10px] text-rose-500 font-medium">-{item.drop_off_pct}% drop</span>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 dark:bg-emerald-400 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Response Time Buckets */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            {t('analytics.responseTime', 'Response Time Distribution')}
          </h3>
          <p className="text-xs text-slate-400 mb-5">Time from case assignment to decision</p>

          <div className="grid grid-cols-2 gap-3.5">
            <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/40">
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 block">&lt; 1 hour</span>
              <div className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-400">
                {data?.response_time_buckets.lt_1h ?? 0}
              </div>
              <span className="text-[10px] text-slate-400">Fastest turnaround</span>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/40">
              <span className="text-xs font-semibold text-blue-800 dark:text-blue-300 block">1 - 4 hours</span>
              <div className="mt-2 text-2xl font-black text-blue-700 dark:text-blue-400">
                {data?.response_time_buckets['1_4h'] ?? 0}
              </div>
              <span className="text-[10px] text-slate-400">Optimal turnaround</span>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/40">
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 block">4 - 24 hours</span>
              <div className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">
                {data?.response_time_buckets['4_24h'] ?? 0}
              </div>
              <span className="text-[10px] text-slate-400">Same day standard</span>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-800/40">
              <span className="text-xs font-semibold text-rose-800 dark:text-rose-300 block">&gt; 24 hours</span>
              <div className="mt-2 text-2xl font-black text-rose-600 dark:text-rose-400">
                {data?.response_time_buckets.gt_24h ?? 0}
              </div>
              <span className="text-[10px] text-slate-400">Delayed / overdue</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Agronomist Workload Table */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('analytics.agronomistWorkload', 'Agronomist Performance & Workload')}
            </h3>
            <p className="text-xs text-slate-400">Workload distribution, velocity, quality ratings, and timeouts</p>
          </div>
          <button
            type="button"
            onClick={() => handleExportCsv('agents')}
            disabled={exportingSection === 'agents'}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exportingSection === 'agents' ? 'Exporting...' : t('analytics.exportAgents', 'Export Agents CSV')}</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3 rounded-l-xl">Agronomist</th>
                <th className="py-2.5 px-3">Status</th>
                <th
                  onClick={() => {
                    setSortField('open');
                    setSortAsc(!sortAsc);
                  }}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                >
                  Open Cases {sortField === 'open' && (sortAsc ? '▲' : '▼')}
                </th>
                <th
                  onClick={() => {
                    setSortField('reviewed');
                    setSortAsc(!sortAsc);
                  }}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                >
                  Reviewed {sortField === 'reviewed' && (sortAsc ? '▲' : '▼')}
                </th>
                <th
                  onClick={() => {
                    setSortField('turnaround');
                    setSortAsc(!sortAsc);
                  }}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                >
                  Avg Turnaround {sortField === 'turnaround' && (sortAsc ? '▲' : '▼')}
                </th>
                <th
                  onClick={() => {
                    setSortField('rating');
                    setSortAsc(!sortAsc);
                  }}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                >
                  Avg Rating {sortField === 'rating' && (sortAsc ? '▲' : '▼')}
                </th>
                <th className="py-2.5 px-3 rounded-r-xl">Timeouts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedAgronomists.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    No agronomists registered
                  </td>
                </tr>
              ) : (
                sortedAgronomists.map((ag) => (
                  <tr key={ag.agronomist_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                      {ag.agronomist}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          ag.available
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        {ag.available ? 'Available' : 'Unavailable'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                      {ag.open}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                      {ag.reviewed}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                      {ag.avg_hours_to_decision !== null ? `${ag.avg_hours_to_decision}h` : '-'}
                    </td>
                    <td className="py-3 px-3">
                      {ag.avg_rating !== null ? (
                        <div className="flex items-center gap-1 font-bold text-amber-500">
                          <span>{ag.avg_rating}</span>
                          <Star className="w-3 h-3 fill-amber-500" />
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-mono font-bold ${
                          ag.timeout_count > 0 ? 'text-rose-500' : 'text-slate-400'
                        }`}
                      >
                        {ag.timeout_count}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 5: Crops & Issues Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Crop */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            {t('analytics.byCrop', 'Cases by Crop')}
          </h3>
          <p className="text-xs text-slate-400 mb-4">Volume breakdown across crops</p>

          <div className="h-56 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">Loading...</div>
            ) : !data?.by_crop.length ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">No crop data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_crop} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="crop" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
                  <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* By Issue Category */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            {t('analytics.byIssue', 'Cases by Issue Category')}
          </h3>
          <p className="text-xs text-slate-400 mb-4">Diagnostic category breakdown</p>

          <div className="h-56 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">Loading...</div>
            ) : !data?.by_issue_category.length ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">No category data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_issue_category} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="category" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Row 6: Sensor Findings & Weather Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sensor Findings */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('analytics.sensorFindings', 'Sensor Interpretation Findings')}
              </h3>
              <p className="text-xs text-slate-400">Agronomic stresses identified from in-field sensors</p>
            </div>
            <button
              type="button"
              onClick={() => handleExportCsv('sensors')}
              disabled={exportingSection === 'sensors'}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exportingSection === 'sensors' ? 'Exporting...' : t('analytics.exportSensors', 'Export Sensors CSV')}</span>
            </button>
          </div>

          <div className="space-y-2 pt-2">
            {data?.sensor_findings.map((item) => (
              <div key={item.key} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 capitalize">
                  {item.key.replace('_', ' ')}
                </span>
                <span className="font-mono font-bold text-xs bg-white dark:bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
                  {item.count} cases
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Weather Alerts by Rule */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('analytics.weatherAlerts', 'Proactive Weather & Sensor Alerts')}
            </h3>
            <p className="text-xs text-slate-400">Alert triggers generated for farms in range</p>
          </div>

          <div className="space-y-2 pt-2">
            {(!data?.alerts_by_rule || data.alerts_by_rule.length === 0) ? (
              <div className="py-8 text-center text-xs text-slate-400">No alerts triggered in this period</div>
            ) : (
              data.alerts_by_rule.map((al) => (
                <div key={al.rule} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 capitalize">
                      {al.rule.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-xs bg-white dark:bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                    {al.count} alerts
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Row 7: Language Mix, Ratings Distribution, & Top Farms */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Language Mix */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            {t('analytics.languages', 'Language Mix')}
          </h3>
          <p className="text-xs text-slate-400 mb-4">Farmer preferences and active messaging</p>

          <div className="space-y-4 text-xs">
            <div>
              <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">Registered Farmers</span>
              <div className="flex flex-wrap gap-2">
                {data?.language_mix.farmers.map((l) => (
                  <span key={l.language} className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 font-medium">
                    {l.language.toUpperCase()}: <span className="font-bold">{l.count}</span>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">Communication Messages</span>
              <div className="flex flex-wrap gap-2">
                {data?.language_mix.messages.map((m) => (
                  <span key={m.language} className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 font-medium">
                    {m.language.toUpperCase()}: <span className="font-bold">{m.count}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Rating Distribution */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            {t('analytics.ratings', 'Rating Distribution')}
          </h3>
          <p className="text-xs text-slate-400 mb-4">Farmer feedback ratings (1 - 5 stars)</p>

          <div className="space-y-2">
            {data?.rating_distribution.map((r) => {
              const totalRatings = data.rating_distribution.reduce((acc, curr) => acc + curr.count, 0) || 1;
              const pct = Math.round((r.count / totalRatings) * 100);
              return (
                <div key={r.rating} className="flex items-center gap-2 text-xs">
                  <span className="w-8 font-bold text-slate-700 dark:text-slate-300 flex items-center gap-0.5">
                    {r.rating} <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                  </span>
                  <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 font-mono text-right text-slate-500">{r.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Farms by Cases */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            {t('analytics.topFarms', 'Top Farms by Cases')}
          </h3>
          <p className="text-xs text-slate-400 mb-4">Highest triage volume locations</p>

          <div className="space-y-2">
            {(!data?.top_farms_by_cases || data.top_farms_by_cases.length === 0) ? (
              <div className="py-4 text-center text-xs text-slate-400">No farm cases recorded</div>
            ) : (
              data.top_farms_by_cases.slice(0, 5).map((f) => (
                <div key={f.farm_id} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <div className="flex items-center gap-2 truncate">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate text-slate-800 dark:text-slate-200 font-medium">{f.farm_name}</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 ml-2">
                    {f.count}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
