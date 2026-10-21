import React, { useState, useEffect } from 'react';
import {
  Bell,
  Filter,
  Send,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { notificationsApi, type AdminNotificationLogItem } from '@/api/notificationsApi';

export const AdminNotificationLogs: React.FC = () => {
  const { t } = useTranslation();

  const [logs, setLogs] = useState<AdminNotificationLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  // Filters
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');

  // Send test modal
  const [isTestOpen, setIsTestOpen] = useState(false);
  const [testChannel, setTestChannel] = useState<'in_app' | 'email' | 'whatsapp' | 'sms'>('in_app');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ status: string; channel: string; error?: string } | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await notificationsApi.getNotificationLog({
        channel: channelFilter || undefined,
        status: statusFilter || undefined,
        event: eventFilter || undefined,
        page,
        page_size: pageSize,
      });
      setLogs(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to load notification logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, channelFilter, statusFilter, eventFilter]);

  const handleSendTest = async () => {
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await notificationsApi.sendTestNotification(testChannel);
      setTestResult(res);
      fetchLogs();
    } catch (err: any) {
      setTestResult({
        status: 'failed',
        channel: testChannel,
        error: err.message || 'Error dispatching test notification',
      });
    } finally {
      setSendingTest(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="w-3 h-3" />
            Sent
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            <XCircle className="w-3 h-3" />
            Failed
          </span>
        );
      case 'skipped':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <AlertCircle className="w-3 h-3" />
            Skipped
          </span>
        );
      case 'read':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
            <Clock className="w-3 h-3" />
            Read
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
            {status}
          </span>
        );
    }
  };

  const getChannelBadge = (channel: string) => {
    switch (channel.toLowerCase()) {
      case 'email':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">Email</span>;
      case 'whatsapp':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">WhatsApp</span>;
      case 'sms':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">SMS</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">In-App</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-emerald-600" />
            <span>{t('admin.notificationLogs', 'Notification Logs & Audit')}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Global delivery logs across In-App, Email, WhatsApp, and SMS channels with retry audits
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsTestOpen(true);
            setTestResult(null);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-sm transition"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{t('admin.sendTest', 'Send Test')}</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          {/* Channel Filter */}
          <select
            value={channelFilter}
            onChange={(e) => {
              setChannelFilter(e.target.value);
              setPage(1);
            }}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
          >
            <option value="">All Channels</option>
            <option value="in_app">In-App</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
          >
            <option value="">All Statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="skipped">Skipped</option>
            <option value="read">Read</option>
          </select>

          {/* Event Filter */}
          <select
            value={eventFilter}
            onChange={(e) => {
              setEventFilter(e.target.value);
              setPage(1);
            }}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
          >
            <option value="">All Events</option>
            <option value="case_assigned">case_assigned</option>
            <option value="case_reassigned">case_reassigned</option>
            <option value="case_decision">case_decision</option>
            <option value="new_message">new_message</option>
            <option value="feedback_received">feedback_received</option>
            <option value="unassigned_alert">unassigned_alert</option>
            <option value="feedback_reminder">feedback_reminder</option>
            <option value="weather_alert">weather_alert</option>
            <option value="outbreak_detected">outbreak_detected</option>
            <option value="admin_test">admin_test</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => fetchLogs()}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="p-3.5">Time</th>
                <th className="p-3.5">User</th>
                <th className="p-3.5">Channel</th>
                <th className="p-3.5">Event</th>
                <th className="p-3.5">Title & Message</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-center">Attempts</th>
                <th className="p-3.5">Case</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    {loading ? 'Loading notification audit records...' : 'No notifications match the active filters.'}
                  </td>
                </tr>
              ) : (
                logs.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                    <td className="p-3.5 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(item.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {item.username || `User #${item.user_id}`}
                    </td>
                    <td className="p-3.5 whitespace-nowrap">{getChannelBadge(item.channel)}</td>
                    <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {item.event}
                    </td>
                    <td className="p-3.5 max-w-xs">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 line-clamp-1">
                        {item.title}
                      </div>
                      <p className="text-slate-500 text-[11px] line-clamp-1 mt-0.5">
                        {item.message}
                      </p>
                      {item.error && (
                        <p className="text-rose-600 text-[10px] font-mono mt-0.5 line-clamp-1">
                          Error: {item.error}
                        </p>
                      )}
                    </td>
                    <td className="p-3.5 whitespace-nowrap">{getStatusBadge(item.status)}</td>
                    <td className="p-3.5 text-center font-mono font-bold text-slate-600 dark:text-slate-400">
                      {item.attempts}
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      {item.case_id ? (
                        <a
                          href={`/cases/${item.case_id}`}
                          className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold hover:underline"
                        >
                          <span>Case {item.case_id}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-slate-400">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {logs.length} of {total} records
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold text-slate-700 dark:text-slate-300">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Send Test Modal */}
      {isTestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-600" />
                <span>{t('admin.testModalTitle', 'Send Channel Test Notification')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsTestOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block font-semibold text-slate-700 dark:text-slate-300">
                Target Channel:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['in_app', 'email', 'whatsapp', 'sms'] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setTestChannel(ch)}
                    className={`p-3 rounded-xl border text-center font-bold capitalize transition ${
                      testChannel === ch
                        ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {ch.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    testResult.status === 'sent'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                      : testResult.status === 'skipped'
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-800 dark:text-amber-300'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 text-rose-800 dark:text-rose-300'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5 capitalize">
                    <span>Result:</span>
                    <span>{testResult.status}</span>
                  </div>
                  {testResult.error && (
                    <p className="font-mono text-[11px] opacity-90">{testResult.error}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsTestOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSendTest}
                disabled={sendingTest}
                className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-xs disabled:opacity-50 transition"
              >
                {sendingTest ? 'Sending...' : 'Send Test Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
