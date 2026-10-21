import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PlusCircle,
  Clock,
  CheckCircle2,
  Bell,
  AlertTriangle,
  Users,
  MessageSquare,
  Star,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store/useAppStore';
import { dashboardApi, type DashboardSummary } from '@/api/dashboardApi';
import { casesApi } from '@/api/casesApi';
import { StatusBadge } from '@/components/StatusBadge';
import { WeatherCard } from '@/components/WeatherCard';
import { alertsApi, type WeatherAlertItem } from '@/api/alertsApi';
import { outbreaksApi, type NearbyOutbreakAlert } from '@/api/outbreaksApi';
import { analyticsApi, type AdminAnalyticsData } from '@/api/analyticsApi';
import { type CaseItem } from '@/mocks/data';

export const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAppStore();

  const [summary, setSummary] = useState<any>(null);
  const [recentCases, setRecentCases] = useState<CaseItem[]>([]);
  const [farmerAlerts, setFarmerAlerts] = useState<WeatherAlertItem[]>([]);
  const [nearbyAlerts, setNearbyAlerts] = useState<NearbyOutbreakAlert[]>([]);
  const [farmerFarmId, setFarmerFarmId] = useState<number | null>(null);
  const [adminAnalytics, setAdminAnalytics] = useState<AdminAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const role = user?.role || 'farmer';

  useEffect(() => {
    let active = true;

    async function loadData() {
      setLoading(true);
      try {
        const sum = await dashboardApi.getSummary();
        if (active) setSummary(sum);
      } catch (err) {
        console.warn('Dashboard summary fetch fallback:', err);
      }

      try {
        const cases = await casesApi.getCases();
        if (active) {
          setRecentCases(cases.slice(0, 5));
          if (cases.length > 0 && cases[0].farmId) {
            setFarmerFarmId(Number(cases[0].farmId));
          }
        }
      } catch (err) {
        console.warn('Failed to load recent cases:', err);
      }

      if (role === 'farmer') {
        try {
          const alertRes = await alertsApi.getAlerts({ unread: true, limit: 5 });
          if (active) {
            setFarmerAlerts(alertRes.items);
            if (alertRes.items.length > 0 && alertRes.items[0].farm_id) {
              setFarmerFarmId(alertRes.items[0].farm_id);
            }
          }
        } catch (e) {
          console.warn('Failed to load farmer alerts:', e);
        }

        try {
          const nearbyRes = await outbreaksApi.getNearbyAlerts();
          if (active) {
            setNearbyAlerts(nearbyRes);
          }
        } catch (e) {
          console.warn('Failed to load nearby outbreak alerts:', e);
        }
      }

      if (role === 'admin') {
        try {
          const aData = await analyticsApi.getAnalytics();
          if (active) setAdminAnalytics(aData);
        } catch (e) {
          console.warn('Failed to load admin analytics:', e);
        }
      }

      if (active) setLoading(false);
    }

    loadData();

    return () => {
      active = false;
    };
  }, [role]);

  const handleDismissAlert = async (id: number) => {
    try {
      await alertsApi.markAlertRead(id);
      setFarmerAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    }
  };

  // ==========================================
  // FARMER VIEW
  // ==========================================
  if (role === 'farmer') {
    const openCases = summary?.open_cases ?? recentCases.filter((c) => c.status !== 'Resolved').length;
    const awaitingReview = summary?.awaiting_review ?? recentCases.filter((c) => c.status === 'Review').length;

    let latestAdviceText = 'No advice yet';
    let latestCaseId: string | number | null = null;

    if (summary?.latest_decision) {
      if (typeof summary.latest_decision === 'string') {
        latestAdviceText = summary.latest_decision;
      } else if (typeof summary.latest_decision === 'object') {
        const caseNum = summary.latest_decision.case_number || 'Case';
        const st = summary.latest_decision.status ? String(summary.latest_decision.status).replace(/_/g, ' ') : 'Approved';
        latestAdviceText = `${caseNum} (${st})`;
        latestCaseId = summary.latest_decision.case_id || null;
      }
    } else {
      const resolved = recentCases.find((c) => c.status === 'Resolved');
      if (resolved) {
        latestAdviceText = resolved.summary || `Case ${resolved.caseNumber} resolved`;
        latestCaseId = resolved.id;
      }
    }

    const unreadCount = summary?.unread_notifications ?? 0;

    return (
      <div className="space-y-6 pb-12">
        {/* Nearby Regional Outbreak Text Alert Banner */}
        {nearbyAlerts.length > 0 && (
          <div className="space-y-2">
            {nearbyAlerts.map((oAlert) => (
              <div
                key={`nearby-${oAlert.outbreak_id}`}
                className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50/90 dark:bg-rose-950/60 text-rose-950 dark:text-rose-100 text-xs md:text-sm font-medium flex items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-bold uppercase tracking-wider text-[11px] px-2 py-0.5 rounded bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-100 shrink-0">
                    {t('outbreaks.regionalAlert', 'Regional Alert')}
                  </span>
                  <span>
                    <strong>{oAlert.title}:</strong> {oAlert.message}{' '}
                    <span className="font-semibold underline ml-1">{oAlert.action}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stack of Alert Banners */}
        {farmerAlerts.length > 0 && (
          <div className="space-y-3">
            {farmerAlerts.map((alert) => {
              const isHigh = alert.severity === 'high';
              return (
                <div
                  key={alert.id}
                  className={`p-4 md:p-5 rounded-2xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isHigh
                      ? 'bg-rose-50 dark:bg-rose-950/70 border-rose-300 text-rose-950 dark:text-rose-100 ring-1 ring-rose-400'
                      : 'bg-amber-50 dark:bg-amber-950/70 border-amber-300 text-amber-950 dark:text-amber-100 ring-1 ring-amber-400'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isHigh ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
                      }`}
                    >
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            isHigh
                              ? 'bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-100'
                              : 'bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100'
                          }`}
                        >
                          {alert.severity}
                        </span>
                        <h4 className="text-sm md:text-base font-extrabold tracking-tight">{alert.title}</h4>
                      </div>
                      <p className="text-xs md:text-sm font-medium opacity-90">{alert.message}</p>
                      <div
                        className={`mt-1 text-xs md:text-sm font-bold flex items-center gap-1.5 ${
                          isHigh ? 'text-rose-900 dark:text-rose-200' : 'text-amber-900 dark:text-amber-200'
                        }`}
                      >
                        <span className="font-black">⚡ Action:</span>
                        <span>{alert.action}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDismissAlert(alert.id)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 shadow-xs transition"
                    >
                      {t('alerts.dismiss', 'Dismiss')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Welcome Banner */}
        <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-br from-emerald-800 to-emerald-950 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-700/60 text-emerald-200 mb-3 backdrop-blur-sm">
              <Sparkles className="w-3.5 h-3.5" />
              {t('farmer.dashboardBadge', 'Field Advisory & Health Assistant')}
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              {t('farmer.welcome', 'Welcome back')}, {user?.displayName || 'Farmer'}!
            </h1>
            <p className="mt-2 text-sm text-emerald-100/90 leading-relaxed">
              {t('farmer.heroText', 'Have a crop issue? Describe your crop symptom or record a voice note to get expert guidance.')}
            </p>

            {/* Big Action Button */}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/new-case"
                className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl bg-white hover:bg-emerald-50 text-emerald-900 font-bold text-base shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <PlusCircle className="w-6 h-6 text-emerald-700" />
                <span>{t('farmer.askQuestion', 'New Crop Inquiry')}</span>
              </Link>
              <Link
                to="/cases"
                className="inline-flex items-center gap-2 px-5 py-4 rounded-2xl bg-emerald-700/60 hover:bg-emerald-700 text-white font-semibold text-sm backdrop-blur-sm transition"
              >
                <span>{t('farmer.viewMyCases', 'My Cases')}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* 4 Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {t('farmer.openCases', 'Open Cases')}
              </span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-black text-slate-900 dark:text-white">
              {openCases}
            </div>
            <span className="text-[11px] text-slate-400 mt-1">Currently in progress</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {t('farmer.waitingForExpert', 'With Expert')}
              </span>
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-black text-slate-900 dark:text-white">
              {awaitingReview}
            </div>
            <span className="text-[11px] text-slate-400 mt-1">Awaiting agronomist review</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {t('farmer.latestAdvice', 'Latest Advice')}
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            {latestCaseId ? (
              <Link
                to={`/cases/${latestCaseId}`}
                className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300 line-clamp-2 hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline block"
              >
                {latestAdviceText}
              </Link>
            ) : (
              <div className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300 line-clamp-2">
                {latestAdviceText}
              </div>
            )}
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
              Agronomist verified
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {t('farmer.notifications', 'Notifications')}
              </span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                <Bell className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-black text-slate-900 dark:text-white">
              {unreadCount}
            </div>
            <Link
              to="/notifications"
              className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold mt-1 hover:underline inline-flex items-center gap-1"
            >
              <span>View alerts</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* 7-Day Weather & Agronomic Conditions Card */}
        <WeatherCard farmId={farmerFarmId || 1} showForecast7d={true} />

        {/* Recent Cases List */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('farmer.recentInquiries', 'Recent Crop Cases')}
            </h3>
            <Link
              to="/cases"
              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
            >
              <span>{t('common.viewAll', 'View All')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentCases.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              No cases submitted yet. Tap "New Crop Inquiry" above to start!
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentCases.map((c) => (
                <div
                  key={c.id}
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className="py-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 rounded-xl transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold text-xs">
                      {c.crop ? c.crop.slice(0, 2).toUpperCase() : 'CP'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {c.crop}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {c.caseNumber}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 max-w-md">
                        {c.summary || c.issue}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={c.rawStatus || c.status} size="sm" />
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // AGRONOMIST VIEW
  // ==========================================
  if (role === 'agronomist') {
    const pendingInQueue = summary?.pending_in_queue ?? 0;
    const highRisk = summary?.high_risk ?? 0;
    const reviewedThisWeek = summary?.reviewed_this_week ?? 0;
    const avgResponseTime = summary?.avg_response_time ?? '2.4 hrs';

    return (
      <div className="space-y-6 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Agronomist Review Command
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Field diagnostic validation queue and expert triage
            </p>
          </div>
          <Link
            to="/review-queue"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs shadow transition"
          >
            <span>Open Review Queue</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Pending in Queue
            </span>
            <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
              {pendingInQueue}
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">Assigned to you</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              High Risk Flagged
            </span>
            <div className="mt-2 text-3xl font-extrabold text-amber-600 dark:text-amber-400">
              {highRisk}
            </div>
            <span className="text-[11px] text-slate-400">Priority triage needed</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Reviewed This Week
            </span>
            <div className="mt-2 text-3xl font-extrabold text-emerald-700 dark:text-emerald-400">
              {reviewedThisWeek}
            </div>
            <span className="text-[11px] text-slate-400">Decisions finalized</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Avg Response Time
            </span>
            <div className="mt-2 text-3xl font-extrabold text-blue-600 dark:text-blue-400">
              {avgResponseTime}
            </div>
            <span className="text-[11px] text-slate-400">Target &lt; 24h</span>
          </div>
        </div>

        {/* Queue Preview */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Assigned Cases Awaiting Your Review
            </h3>
            <Link
              to="/review-queue"
              className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1"
            >
              <span>Go to Queue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentCases
              .filter((c) => c.status === 'Review' || c.status === 'Flagged')
              .map((c) => (
                <div
                  key={c.id}
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className="py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 rounded-xl transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                      {c.caseNumber}
                    </span>
                    <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                      {c.crop} · {c.fieldName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={c.rawStatus || c.status} size="sm" />
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // ADMIN VIEW
  // ==========================================
  const totalCases = summary?.total_cases ?? 0;
  const unassigned = summary?.unassigned ?? 0;
  const pendingCases = summary?.pending ?? 0;
  const agronomistsAvail = summary?.agronomists_available ?? 0;
  const avgRating = summary?.avg_rating ? summary.avg_rating.toFixed(1) : '4.8';

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            System Administration
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Operational workload, case distribution, and communication oversight
          </p>
        </div>
      </div>

      {/* 4 Compact Analytics Cards Linking to /admin/analytics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          to="/admin/analytics"
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 shadow-sm transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Cases in Range (30d)
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600 transition" />
          </div>
          <div className="mt-2 text-3xl font-black text-slate-900 dark:text-white">
            {adminAnalytics?.kpis.cases_in_range.value ?? totalCases}
          </div>
          <span className="text-[11px] text-emerald-600 font-medium">View full report →</span>
        </Link>

        <Link
          to="/admin/analytics"
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 shadow-sm transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Avg Turnaround
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-600 transition" />
          </div>
          <div className="mt-2 text-3xl font-black text-indigo-600 dark:text-indigo-400">
            {adminAnalytics?.kpis.avg_hours_to_decision.value !== null && adminAnalytics?.kpis.avg_hours_to_decision.value !== undefined
              ? `${adminAnalytics.kpis.avg_hours_to_decision.value}h`
              : '-'}
          </div>
          <span className="text-[11px] text-slate-400">Assignment to review</span>
        </Link>

        <Link
          to="/admin/analytics"
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 shadow-sm transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              AI Agreement Rate
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600 transition" />
          </div>
          <div className="mt-2 text-3xl font-black text-emerald-600 dark:text-emerald-400">
            {adminAnalytics?.ai_agreement_rate !== null && adminAnalytics?.ai_agreement_rate !== undefined
              ? `${(adminAnalytics.ai_agreement_rate * 100).toFixed(0)}%`
              : '-'}
          </div>
          <span className="text-[11px] text-slate-400">Expert approval match</span>
        </Link>

        <Link
          to="/admin/analytics"
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500 shadow-sm transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Avg Farmer Rating
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-amber-500 transition" />
          </div>
          <div className="mt-2 text-3xl font-black text-amber-500 flex items-center gap-1.5">
            <span>
              {adminAnalytics?.kpis.avg_rating.value !== null && adminAnalytics?.kpis.avg_rating.value !== undefined
                ? adminAnalytics.kpis.avg_rating.value
                : avgRating}
            </span>
            <Star className="w-5 h-5 fill-amber-500" />
          </div>
          <span className="text-[11px] text-slate-400">Feedback score (1-5)</span>
        </Link>
      </div>

      {/* Admin Quick Action Hub */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          to="/admin/agronomists"
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-600 shadow-sm transition group"
        >
          <Users className="w-6 h-6 text-emerald-700 dark:text-emerald-400 mb-3" />
          <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-emerald-700 transition">
            Manage Agronomists
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            View workload, toggle availability, edit capacity limits
          </p>
        </Link>

        <Link
          to="/admin/cases"
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-600 shadow-sm transition group"
        >
          <Clock className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mb-3" />
          <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-emerald-700 transition">
            All Cases & Triage
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            Filter unassigned cases, reassign agronomists, view logs
          </p>
        </Link>

        <Link
          to="/admin/communications"
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-600 shadow-sm transition group"
        >
          <MessageSquare className="w-6 h-6 text-purple-600 dark:text-purple-400 mb-3" />
          <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-emerald-700 transition">
            Communication Logs
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            Read translated message transcripts and export CSV
          </p>
        </Link>

        <Link
          to="/admin/feedback"
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-600 shadow-sm transition group"
        >
          <Star className="w-6 h-6 text-amber-500 dark:text-amber-400 mb-3" />
          <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-emerald-700 transition">
            Farmer Feedback
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            Review 1-5 star ratings, feedback audio, and agronomist averages
          </p>
        </Link>
      </div>
    </div>
  );
};
