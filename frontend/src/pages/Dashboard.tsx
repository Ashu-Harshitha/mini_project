import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  PlusCircle, 
  FileText, 
  TrendingUp, 
  Clock, 
  Users, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  CheckCircle2, 
  ArrowRight,
  ExternalLink,
  X
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { StatCard } from '@/components/StatCard';
import { UncertaintyBadge } from '@/components/UncertaintyBadge';
import { ConfidenceBar } from '@/components/ConfidenceBar';
import { useAppStore } from '@/store/useAppStore';
import { mockCases } from '@/mocks/data';
import { units } from '@/lib/units';

export const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentFarm, unitSystem } = useAppStore();

  const acreageLabel = units.convertArea(currentFarm.totalAcreage, unitSystem).label;

  // Alerts state
  const [alerts, setAlerts] = useState([
    {
      id: 'a-1',
      type: 'red',
      message: 'High-risk chemical flagged in Case C-2844 — expert review required',
      time: '1h ago',
      link: '/cases/c-2844',
    },
    {
      id: 'a-2',
      type: 'yellow',
      message: 'Model confidence below threshold on 3 recent wheat cases',
      time: '3h ago',
      link: '/cases/c-2845',
    },
    {
      id: 'a-3',
      type: 'blue',
      message: 'New agronomy RAG index refreshed — 2,847 documents indexed',
      time: '6h ago',
      link: '/rag-explorer',
    },
    {
      id: 'a-4',
      type: 'green',
      message: 'Agronomist Dr. Chen approved 12 cases this week',
      time: '1d ago',
      link: '/review-queue',
    },
  ]);

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  // Chart data: Case volume this week
  const volumeData = [
    { day: 'Mon', cases: 14, resolved: 10 },
    { day: 'Tue', cases: 18, resolved: 15 },
    { day: 'Wed', cases: 15, resolved: 13 },
    { day: 'Thu', cases: 24, resolved: 18 },
    { day: 'Fri', cases: 28, resolved: 22 },
    { day: 'Sat', cases: 12, resolved: 8 },
    { day: 'Sun', cases: 8, resolved: 6 },
  ];

  // Chart data: Avg confidence 6 months
  const confidenceData = [
    { month: 'Apr', confidence: 71 },
    { month: 'May', confidence: 73 },
    { month: 'Jun', confidence: 76 },
    { month: 'Jul', confidence: 78 },
    { month: 'Aug', confidence: 81 },
    { month: 'Sep', confidence: 85 },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('dashboard.title', 'Dashboard')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {currentFarm.name} · {t('app.season', 'Season')}: Fall 2026 · {acreageLabel}
          </p>
        </div>

        <Link
          to="/new-case"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white shadow-sm transition"
        >
          <PlusCircle className="w-4 h-4 text-emerald-300" />
          <span>+ {t('wizard.title', 'New Case')}</span>
        </Link>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('dashboard.casesThisWeek', 'Cases This Week')}
          value="108"
          subtext={`+14% ${t('dashboard.vsLastMonth', 'vs last month')}`}
          icon={<FileText className="w-5 h-5" />}
        />
        <StatCard
          title={t('dashboard.avgConfidence', 'Avg. Confidence')}
          value="82%"
          subtext={`+3% ${t('dashboard.vsLastMonth', 'vs last month')}`}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          title={t('dashboard.pendingReview', 'Pending Review')}
          value="7"
          subtext="Requires agronomist action"
          isPositive={false}
          icon={<Clock className="w-5 h-5 text-amber-500" />}
        />
        <StatCard
          title={t('dashboard.activeAgronomists', 'Active Agronomists')}
          value="4"
          subtext={`+1 ${t('dashboard.vsLastMonth', 'vs last month')}`}
          icon={<Users className="w-5 h-5" />}
        />
      </div>

      {/* Alert Banners */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => {
            let bgClass = 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-200';
            let icon = <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />;

            if (alert.type === 'yellow') {
              bgClass = 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200';
              icon = <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />;
            } else if (alert.type === 'blue') {
              bgClass = 'bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/40 dark:border-sky-900 dark:text-sky-200';
              icon = <Info className="w-4 h-4 text-sky-600 flex-shrink-0" />;
            } else if (alert.type === 'green') {
              bgClass = 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-200';
              icon = <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />;
            }

            return (
              <div
                key={alert.id}
                className={`p-3 rounded-xl border flex items-center justify-between text-xs transition ${bgClass}`}
              >
                <div className="flex items-center gap-2.5">
                  {icon}
                  <Link to={alert.link} className="hover:underline font-medium">
                    {alert.message}
                  </Link>
                  <span className="text-[11px] opacity-70">· {alert.time}</span>
                </div>
                <button
                  type="button"
                  onClick={() => dismissAlert(alert.id)}
                  className="opacity-50 hover:opacity-100 p-1 transition"
                  title="Dismiss notification"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Charts (2 Column Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Case Volume This Week */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
              {t('dashboard.caseVolume', 'Case Volume — This Week')}
            </h3>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-700" />
                {t('dashboard.cases', 'Cases')}
              </span>
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-400" />
                {t('dashboard.resolved', 'Resolved')}
              </span>
            </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeData} barGap={4}>
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: '#fff',
                  }}
                />
                <Bar dataKey="cases" fill="#15803d" radius={[4, 4, 0, 0]} name="Cases" />
                <Bar dataKey="resolved" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Resolved" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Avg. Model Confidence 6 Months */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
              {t('dashboard.avgModelConfidence', 'Avg. Model Confidence — 6 Months')}
            </h3>
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
              Current: 85%
            </span>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={confidenceData}>
                <defs>
                  <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
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
                  formatter={(val: any) => [`${val}%`, 'Confidence']}
                />
                <Area
                  type="monotone"
                  dataKey="confidence"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#confidenceGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Cases Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
              {t('dashboard.recentCases', 'Recent Cases')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live automated and reviewed field issues
            </p>
          </div>
          <Link
            to="/cases"
            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
          >
            <span>{t('dashboard.viewAll', 'View all')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="py-3 px-4">Case ID</th>
                <th className="py-3 px-4">Crop</th>
                <th className="py-3 px-4">Issue</th>
                <th className="py-3 px-4">Farm</th>
                <th className="py-3 px-4">Confidence</th>
                <th className="py-3 px-4">Uncertainty</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {mockCases.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition"
                >
                  <td className="py-3.5 px-4 font-mono font-semibold text-emerald-800 dark:text-emerald-400">
                    {c.caseNumber}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">
                    {c.crop}
                  </td>
                  <td className="py-3.5 px-4 max-w-xs truncate">{c.issue}</td>
                  <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400">{c.farmName}</td>
                  <td className="py-3.5 px-4 font-semibold">
                    <span className="text-slate-900 dark:text-white">{c.confidence}%</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <UncertaintyBadge confidence={c.confidence} size="sm" />
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        c.status === 'Resolved'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : c.status === 'Review'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : c.status === 'Flagged'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">{c.time}</td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/cases/${c.id}`);
                      }}
                      className="p-1 rounded text-slate-400 hover:text-emerald-600 transition"
                      title="Inspect case"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
