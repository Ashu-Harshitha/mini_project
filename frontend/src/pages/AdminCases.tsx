import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Search,
  Filter,
  UserCheck,
  Clock,
  ArrowRight,
  ChevronRight,
  ShieldAlert,
  History,
  X,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { adminApi, type AdminCaseItem, type AdminAgronomist } from '@/api/adminApi';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';

export const AdminCases: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [cases, setCases] = useState<AdminCaseItem[]>([]);
  const [agronomists, setAgronomists] = useState<AdminAgronomist[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [agronomistFilter, setAgronomistFilter] = useState<number | undefined>(undefined);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // History modal
  const [selectedCaseForHistory, setSelectedCaseForHistory] = useState<AdminCaseItem | null>(null);
  const [reassigningId, setReassigningId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [casesData, agrosData] = await Promise.all([
        adminApi.getCases({
          status: statusFilter || undefined,
          agronomist_id: agronomistFilter,
          unassigned: unassignedOnly,
        }),
        adminApi.getAgronomists(),
      ]);
      setCases(casesData);
      setAgronomists(agrosData);
    } catch (err) {
      console.warn('Failed to load admin cases:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, agronomistFilter, unassignedOnly]);

  const handleReassign = async (caseId: number, newAgronomistId: number) => {
    setReassigningId(caseId);
    try {
      await adminApi.assignCase(caseId, newAgronomistId);
      setToastMessage('Case successfully reassigned by administrator.');
      setTimeout(() => setToastMessage(null), 3000);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to reassign case');
    } finally {
      setReassigningId(null);
    }
  };

  const filteredCases = cases.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.case_number.toLowerCase().includes(q) ||
      c.crop.toLowerCase().includes(q) ||
      (c.farmer_name || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-emerald-800 text-white text-xs font-bold shadow-xl animate-fade-in">
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-600" />
            <span>All System Cases & Triage</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Global case oversight, workload distribution, and manual administrative reassignments
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by case #, crop, farmer..."
            className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="PENDING_REVIEW">Pending Review</option>
          <option value="DELIVERED">Delivered / Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="BLOCKED">Blocked</option>
          <option value="DRAFT">Draft</option>
        </select>

        {/* Agronomist Filter */}
        <select
          value={agronomistFilter === undefined ? '' : String(agronomistFilter)}
          onChange={(e) => setAgronomistFilter(e.target.value ? Number(e.target.value) : undefined)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none"
        >
          <option value="">All Agronomists</option>
          {agronomists.map((ag) => (
            <option key={ag.id} value={ag.id}>
              {ag.name} ({ag.open_count}/{ag.max_open_cases})
            </option>
          ))}
        </select>

        {/* Unassigned Only Checkbox */}
        <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(e) => setUnassignedOnly(e.target.checked)}
            className="w-4 h-4 accent-amber-600 rounded"
          />
          <span>Unassigned Pool Only</span>
        </label>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Case #</th>
                <th className="px-4 py-3.5">Farmer & Crop</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Assigned Agronomist</th>
                <th className="px-4 py-3.5">Reassign Expert</th>
                <th className="px-4 py-3.5 text-right">History</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      <span>Loading cases...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No cases match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredCases.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3.5 font-mono font-bold text-slate-900 dark:text-white">
                      {c.case_number}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {c.crop}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {c.farmer_name || `Farmer #${c.farmer_id}`}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={c.status} size="sm" />
                    </td>
                    <td className="px-4 py-3.5">
                      {c.assigned_agronomist_name ? (
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {c.assigned_agronomist_name}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <select
                        disabled={reassigningId === c.id}
                        value={c.assigned_agronomist_id || ''}
                        onChange={(e) => {
                          const newId = Number(e.target.value);
                          if (newId) handleReassign(c.id, newId);
                        }}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-600"
                      >
                        <option value="" disabled>
                          Select expert...
                        </option>
                        {agronomists.map((ag) => (
                          <option key={ag.id} value={ag.id}>
                            {ag.name} ({ag.open_count}/{ag.max_open_cases})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedCaseForHistory(c)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <History className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Logs ({c.reassign_count ?? 0})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/cases/${c.id}`)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="View Case Details"
                        >
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assignment History Drawer / Modal */}
      {selectedCaseForHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="max-w-lg w-full p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Assignment Audit Trail: {selectedCaseForHistory.case_number}
                </h3>
                <span className="text-xs text-slate-400">
                  Total reassignments: {selectedCaseForHistory.reassign_count ?? 0}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCaseForHistory(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1 text-xs">
              {!selectedCaseForHistory.history || selectedCaseForHistory.history.length === 0 ? (
                <p className="text-slate-400 py-4 text-center">No assignment transitions on record.</p>
              ) : (
                selectedCaseForHistory.history.map((h, i) => (
                  <div
                    key={h.id || i}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 space-y-1"
                  >
                    <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                      <span>Reason: {h.reason.toUpperCase()}</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {new Date(h.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      From: {h.from_name || 'System / Unassigned'} → To: {h.to_name || 'Unassigned'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
