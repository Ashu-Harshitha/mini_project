import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Search,
  Filter,
  Download,
  Calendar,
  Volume2,
  Globe,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { adminApi, type AdminCommunication } from '@/api/adminApi';
import { AudioPlayer } from '@/components/AudioPlayer';
import { EmptyState } from '@/components/EmptyState';

export const AdminCommunications: React.FC = () => {
  const { t } = useTranslation();

  const [communications, setCommunications] = useState<AdminCommunication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [loading, setLoading] = useState(true);

  // Filters
  const [kindFilter, setKindFilter] = useState('');
  const [caseIdFilter, setCaseIdFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getCommunications({
        kind: kindFilter || undefined,
        case_id: caseIdFilter ? Number(caseIdFilter) : undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
        page_size: pageSize,
      });
      setCommunications(data.items);
      setTotal(data.total);
    } catch (err) {
      console.warn('Failed to load communication logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, kindFilter, caseIdFilter, startDate, endDate]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const csvData = await adminApi.getCommunicationsCsv({
        kind: kindFilter || undefined,
        case_id: caseIdFilter ? Number(caseIdFilter) : undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });

      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `communications_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert(err.message || 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-purple-600" />
            <span>Communication & Voice Logs</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Global communication audit log: farmer inquiries, translated dialogues, and voice transcripts
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow transition disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span>{exporting ? 'Generating CSV...' : 'Export CSV'}</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center gap-3 text-xs">
        {/* Kind */}
        <select
          value={kindFilter}
          onChange={(e) => {
            setKindFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none"
        >
          <option value="">All Types (Voice, Text, Decision)</option>
          <option value="text">Text Message</option>
          <option value="voice">Voice Note</option>
          <option value="decision">Agronomist Decision</option>
          <option value="feedback">Farmer Feedback</option>
        </select>

        {/* Case ID */}
        <input
          type="number"
          placeholder="Filter by Case ID..."
          value={caseIdFilter}
          onChange={(e) => {
            setCaseIdFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white w-40 focus:outline-none"
        />

        {/* Date pickers */}
        <div className="flex items-center gap-1.5 text-slate-500">
          <Calendar className="w-3.5 h-3.5" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
          />
          <span>to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Time</th>
                <th className="px-4 py-3.5">Case #</th>
                <th className="px-4 py-3.5">Parties</th>
                <th className="px-4 py-3.5">Kind</th>
                <th className="px-4 py-3.5">Original Message</th>
                <th className="px-4 py-3.5">Admin Translation</th>
                <th className="px-4 py-3.5 text-right">Voice Audio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                      <span>Loading communication audit logs...</span>
                    </div>
                  </td>
                </tr>
              ) : communications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No communications logged for the selected criteria.
                  </td>
                </tr>
              ) : (
                communications.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px] text-slate-400">
                      {new Date(c.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3.5 font-mono font-bold text-slate-900 dark:text-white">
                      {c.case_number || `Case #${c.case_id}`}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {c.sender_name || `User #${c.sender_id}`} ({c.sender_role})
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {c.farmer_name ? `Farmer: ${c.farmer_name}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        {c.kind}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 max-w-xs">
                      <span className="font-mono text-[10px] text-slate-400 block uppercase">
                        [{c.original_lang}]
                      </span>
                      <p className="line-clamp-2 text-xs">{c.original_text || '—'}</p>
                    </td>
                    <td className="px-4 py-3.5 max-w-xs font-medium text-slate-800 dark:text-slate-200">
                      <p className="line-clamp-2 text-xs">{c.text || '—'}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      {c.audio_url ? (
                        <div className="max-w-[200px] ml-auto">
                          <AudioPlayer src={c.audio_url} />
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700 text-[11px]">None</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paging Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {communications.length} of {total} records
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
