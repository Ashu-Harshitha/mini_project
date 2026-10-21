import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCheck,
  RefreshCw,
  Filter,
  Play,
  CloudRain,
  Activity,
  Calendar,
  Sparkles,
  Info,
  Building,
  CheckCircle2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store/useAppStore';
import { alertsApi, type WeatherAlertItem, type AlertJobSummary } from '@/api/alertsApi';

export const AlertsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAppStore();

  const [alerts, setAlerts] = useState<WeatherAlertItem[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterUnread, setFilterUnread] = useState<'all' | 'unread'>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Admin job runner state
  const [runningJob, setRunningJob] = useState(false);
  const [jobSummary, setJobSummary] = useState<AlertJobSummary | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const res = await alertsApi.getAlerts({
        unread: filterUnread === 'unread' ? true : undefined,
        severity: filterSeverity !== 'all' ? filterSeverity : undefined,
        source: filterSource !== 'all' ? filterSource : undefined,
        page,
        limit: 25,
      });
      setAlerts(res.items);
      setTotal(res.total);
      setUnreadCount(res.unread_count);
    } catch (err) {
      console.error('Failed to load alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [filterUnread, filterSeverity, filterSource, page]);

  const handleMarkRead = async (id: number) => {
    try {
      await alertsApi.markAlertRead(id);
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, read_at: new Date().toISOString() } : a))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      setActionSuccess(t('alerts.markedReadSuccess', 'Alert marked as read.'));
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to mark alert as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await alertsApi.markAllAlertsRead();
      setAlerts((prev) =>
        prev.map((a) => ({ ...a, read_at: a.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
      setActionSuccess(t('alerts.markedAllReadSuccess', 'All alerts marked as read ({{count}}).', { count: res.count }));
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleRunAdminCheck = async () => {
    setRunningJob(true);
    setJobSummary(null);
    try {
      const summary = await alertsApi.adminRunAlertsJob();
      setJobSummary(summary);
      await loadAlerts();
    } catch (err) {
      console.error('Failed to trigger admin alerts run:', err);
    } finally {
      setRunningJob(false);
    }
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'high':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-200 border-rose-300 dark:border-rose-800';
      case 'warning':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-200 border-amber-300 dark:border-amber-800';
      default:
        return 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-200 border-sky-300 dark:border-sky-800';
    }
  };

  const getCardBorderClass = (severity: string, isUnread: boolean) => {
    if (!isUnread) return 'border-slate-200 dark:border-slate-800 opacity-80';
    switch (severity.toLowerCase()) {
      case 'high':
        return 'border-rose-500 bg-rose-50/40 dark:bg-rose-950/20';
      case 'warning':
        return 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20';
      default:
        return 'border-sky-500 bg-sky-50/40 dark:bg-sky-950/20';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {t('alerts.pageTitle', 'Weather & Sensor Alerts')}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('alerts.subtitle', 'Proactive agronomic warnings and automated condition telemetry.')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-xs"
            >
              <CheckCheck className="w-4 h-4 text-emerald-600" />
              <span>{t('alerts.markAllRead', 'Mark All Read')}</span>
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={handleRunAdminCheck}
              disabled={runningJob}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 transition shadow-sm disabled:opacity-60"
            >
              <Play className={`w-3.5 h-3.5 ${runningJob ? 'animate-spin' : ''}`} />
              <span>{runningJob ? t('alerts.runningCheck', 'Running Check...') : t('alerts.runCheckNow', 'Run Weather Check Now')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={loadAlerts}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Admin Run Summary Banner */}
      {jobSummary && (
        <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100 shadow-sm space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>{t('alerts.checkCompleted', 'Weather alert verification completed')}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
            <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-emerald-200 dark:border-slate-700">
              <span className="text-slate-500 block text-[10px] font-semibold uppercase">{t('alerts.farmsChecked', 'Farms Checked')}</span>
              <span className="text-base font-black text-slate-900 dark:text-white">{jobSummary.farms_checked}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-emerald-200 dark:border-slate-700">
              <span className="text-slate-500 block text-[10px] font-semibold uppercase">{t('alerts.alertsCreated', 'Alerts Created')}</span>
              <span className="text-base font-black text-emerald-600 dark:text-emerald-400">{jobSummary.alerts_created}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-emerald-200 dark:border-slate-700">
              <span className="text-slate-500 block text-[10px] font-semibold uppercase">{t('alerts.farmsSkipped', 'Farms Skipped')}</span>
              <span className="text-base font-black text-slate-700 dark:text-slate-300">{jobSummary.farms_skipped}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-emerald-200 dark:border-slate-700">
              <span className="text-slate-500 block text-[10px] font-semibold uppercase">{t('alerts.failures', 'Failures')}</span>
              <span className="text-base font-black text-rose-600">{jobSummary.failures}</span>
            </div>
          </div>
        </div>
      )}

      {/* Action Success Toast */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Filters Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Read / Unread Tabs */}
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200/60 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => { setFilterUnread('all'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                filterUnread === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {t('alerts.filterAll', 'All Alerts')} ({total})
            </button>
            <button
              type="button"
              onClick={() => { setFilterUnread('unread'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                filterUnread === 'unread'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>{t('alerts.filterUnread', 'Unread')}</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-600 text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Severity Dropdown */}
          <select
            value={filterSeverity}
            onChange={(e) => { setFilterSeverity(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-700"
          >
            <option value="all">{t('alerts.allSeverities', 'All Severities')}</option>
            <option value="high">{t('alerts.severityHigh', 'High Severity')}</option>
            <option value="warning">{t('alerts.severityWarning', 'Warning')}</option>
            <option value="info">{t('alerts.severityInfo', 'Info')}</option>
          </select>

          {/* Source Dropdown */}
          <select
            value={filterSource}
            onChange={(e) => { setFilterSource(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-700"
          >
            <option value="all">{t('alerts.allSources', 'All Sources')}</option>
            <option value="weather">{t('alerts.sourceWeather', 'Weather (Open-Meteo)')}</option>
            <option value="sensor">{t('alerts.sourceSensor', 'Sensor (Field IoT)')}</option>
          </select>
        </div>

        <span className="text-[11px] text-slate-400">
          {t('alerts.showingResults', 'Showing {{count}} of {{total}} alerts', { count: alerts.length, total })}
        </span>
      </div>

      {/* Alerts List */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-700 border-t-transparent animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">{t('alerts.loading', 'Loading alerts...')}</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {t('alerts.emptyTitle', 'No active alerts')}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {t('alerts.emptySubtitle', 'All farm conditions and sensor telemetry are currently within safe thresholds.')}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {alerts.map((alert) => {
            const isUnread = !alert.read_at;
            const isHigh = alert.severity === 'high';

            return (
              <div
                key={alert.id}
                className={`p-5 rounded-2xl border transition-all duration-200 shadow-sm ${getCardBorderClass(
                  alert.severity,
                  isUnread
                )}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    {/* Badges row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${getSeverityBadgeClass(
                          alert.severity
                        )}`}
                      >
                        {alert.severity}
                      </span>

                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {alert.source === 'sensor' ? (
                          <>
                            <Activity className="w-3 h-3 text-purple-500" />
                            <span>Sensor</span>
                          </>
                        ) : (
                          <>
                            <CloudRain className="w-3 h-3 text-teal-500" />
                            <span>Weather</span>
                          </>
                        )}
                      </span>

                      {alert.farm_name && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          <Building className="w-3 h-3" />
                          <span>{alert.farm_name}</span>
                          {alert.field_name && <span>· {alert.field_name}</span>}
                        </span>
                      )}

                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 ml-auto sm:ml-0">
                        <Calendar className="w-3 h-3" />
                        <span>{alert.start_date}</span>
                      </span>
                    </div>

                    {/* Alert Title & Message */}
                    <div>
                      <h3
                        className={`text-base font-extrabold tracking-tight ${
                          isHigh ? 'text-rose-950 dark:text-rose-200' : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {alert.title}
                      </h3>
                      <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                        {alert.message}
                      </p>
                    </div>

                    {/* Action Line */}
                    <div
                      className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2 ${
                        isHigh
                          ? 'bg-rose-100/80 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100'
                          : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                      }`}
                    >
                      <span className="text-sm font-black">⚡</span>
                      <div>
                        <span className="uppercase text-[10px] tracking-wider block font-extrabold opacity-80">
                          {t('alerts.recommendedAction', 'Recommended Action')}:
                        </span>
                        <span className="text-xs font-bold leading-snug">{alert.action}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions / Status */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 pt-1">
                    {isUnread ? (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(alert.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{t('alerts.dismiss', 'Dismiss')}</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-slate-400" />
                        <span>{t('alerts.read', 'Read')}</span>
                      </span>
                    )}

                    <span className="text-[10px] text-slate-400">
                      {new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default AlertsPage;
