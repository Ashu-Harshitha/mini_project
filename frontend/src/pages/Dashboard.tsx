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
import { type CaseItem } from '@/mocks/data';

export const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAppStore();

  const [summary, setSummary] = useState<any>(null);
  const [recentCases, setRecentCases] = useState<CaseItem[]>([]);
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
        if (active) setRecentCases(cases.slice(0, 5));
      } catch (err) {
        console.warn('Failed to load recent cases:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [role]);

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

      {/* 5 Admin Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Total Cases
          </span>
          <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{totalCases}</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">
            Unassigned Pool
          </span>
          <div className="mt-2 text-2xl font-black text-amber-600">{unassigned}</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider">
            Pending Review
          </span>
          <div className="mt-2 text-2xl font-black text-indigo-600">{pendingCases}</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
            Available Experts
          </span>
          <div className="mt-2 text-2xl font-black text-emerald-600">{agronomistsAvail}</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-semibold text-amber-500 uppercase tracking-wider">
            Avg Farmer Rating
          </span>
          <div className="mt-2 text-2xl font-black text-amber-500 flex items-center gap-1">
            <span>{avgRating}</span>
            <Star className="w-4 h-4 fill-amber-500" />
          </div>
        </div>
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
