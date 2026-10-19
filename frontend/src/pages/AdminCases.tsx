import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Search,
  Filter,
  UserCheck,
  Clock,
  ArrowRight,
  ShieldAlert,
  History,
  X,
  Star,
  CheckCircle2,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  User,
  Sparkles,
  MessageSquare,
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
      (c.assigned_agronomist_name || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      (c.final_suggestion || '').toLowerCase().includes(q) ||
      (c.decision_note || '').toLowerCase().includes(q)
    );
  });

  // Calculate totals
  const totalReviewed = agronomists.reduce((acc, a) => acc + (a.total_reviewed || 0), 0);
  const totalAccepted = agronomists.reduce((acc, a) => acc + (a.accepted_count || 0), 0);
  const totalEdits = agronomists.reduce((acc, a) => acc + (a.accepted_with_edits_count || 0), 0);
  const totalRejected = agronomists.reduce((acc, a) => acc + (a.rejected_count || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-emerald-800 text-white text-xs font-bold shadow-xl animate-fade-in flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <ClipboardList className="w-7 h-7 text-emerald-700" />
            <span>Admin Case Oversight & Agronomist Triage</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Track handled cases, agronomist suggestions, decisions (approved, edited, rejected), and farmer feedback ratings.
          </p>
        </div>
      </div>

      {/* Agronomist Overview Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span>Agronomists Performance & Feedback Overview</span>
          </h3>
          {agronomistFilter !== undefined && (
            <button
              onClick={() => setAgronomistFilter(undefined)}
              className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold hover:underline"
            >
              Clear Agronomist Filter &times;
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agronomists.map((ag) => {
            const isSelected = agronomistFilter === ag.id;
            const avgRating = ag.avg_feedback_rating ?? ag.avg_rating ?? 5.0;

            return (
              <div
                key={ag.id}
                onClick={() => setAgronomistFilter(isSelected ? undefined : ag.id)}
                className={`p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between gap-3 shadow-sm ${
                  isSelected
                    ? 'border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20 ring-2 ring-emerald-600/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-800 text-white font-bold flex items-center justify-center text-sm shadow">
                        {ag.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                          {ag.name}
                        </h4>
                        <span className="text-[11px] text-slate-400">@{ag.username}</span>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ag.available
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {ag.available ? 'Available' : 'Paused'}
                    </span>
                  </div>

                  {/* Decision stats pills */}
                  <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                    <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60">
                      <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 block">Accepted</span>
                      <span className="text-base font-black text-emerald-700 dark:text-emerald-400">
                        {ag.accepted_count || 0}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/60">
                      <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-300 block">With Edits</span>
                      <span className="text-base font-black text-amber-600 dark:text-amber-400">
                        {ag.accepted_with_edits_count || 0}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-800/60">
                      <span className="text-[10px] font-semibold text-rose-800 dark:text-rose-300 block">Rejected</span>
                      <span className="text-base font-black text-rose-600 dark:text-rose-400">
                        {ag.rejected_count || 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Farmer feedback reviews breakdown */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{ag.positive_reviews_count || 0} Pos.</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                      <ThumbsDown className="w-3.5 h-3.5" />
                      <span>{ag.negative_reviews_count || 0} Neg.</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400 text-xs">
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    <span>{avgRating.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by case #, crop, farmer, agronomist, suggestion..."
            className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
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
          <option value="APPROVED_WITH_EDITS">Approved with Edits</option>
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

        {/* Unassigned Checkbox */}
        <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(e) => setUnassignedOnly(e.target.checked)}
            className="w-4 h-4 accent-amber-600 rounded"
          />
          <span>Unassigned Cases Only</span>
        </label>
      </div>

      {/* Main Cases Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Case #</th>
                <th className="px-4 py-3.5">Farmer & Crop</th>
                <th className="px-4 py-3.5">Handled By Agronomist</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 min-w-[200px]">Agronomist's Suggestion</th>
                <th className="px-4 py-3.5">Farmer Feedback</th>
                <th className="px-4 py-3.5">Reassign</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                      <span>Loading cases...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No cases match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredCases.map((c) => {
                  const suggestion = c.final_suggestion || c.decision_note || '';

                  return (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      {/* Case Number */}
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900 dark:text-white">
                        {c.case_number}
                      </td>

                      {/* Farmer & Crop */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {c.crop}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span>{c.farmer_name || `Farmer #${c.farmer_id}`}</span>
                        </div>
                      </td>

                      {/* Handled by Agronomist */}
                      <td className="px-4 py-3.5">
                        {c.assigned_agronomist_name ? (
                          <div className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
                            <span className="w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px] flex items-center justify-center">
                              {c.assigned_agronomist_name.charAt(0)}
                            </span>
                            <span>{c.assigned_agronomist_name}</span>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <StatusBadge status={c.status} size="sm" />
                      </td>

                      {/* Agronomist's Suggestion */}
                      <td className="px-4 py-3.5 max-w-xs">
                        {suggestion ? (
                          <p className="text-xs text-slate-800 dark:text-slate-200 line-clamp-2 italic bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                            "{suggestion}"
                          </p>
                        ) : (
                          <span className="text-[11px] text-slate-400">Awaiting agronomist review</span>
                        )}
                      </td>

                      {/* Farmer Feedback */}
                      <td className="px-4 py-3.5">
                        {c.farmer_feedback_rating ? (
                          <div>
                            <div className="flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                              <span>{c.farmer_feedback_rating}</span>
                              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            </div>
                            {c.farmer_feedback_comment && (
                              <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5 max-w-[140px]">
                                {c.farmer_feedback_comment}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">No review yet</span>
                        )}
                      </td>

                      {/* Reassign dropdown */}
                      <td className="px-4 py-3.5">
                        <select
                          disabled={reassigningId === c.id}
                          value={c.assigned_agronomist_id || ''}
                          onChange={(e) => {
                            const newId = Number(e.target.value);
                            if (newId) handleReassign(c.id, newId);
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-emerald-700"
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

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedCaseForHistory(c)}
                            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold inline-flex items-center gap-1"
                            title="Audit Log"
                          >
                            <History className="w-3 h-3 text-slate-500" />
                            <span>Logs ({c.reassign_count ?? 0})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/cases/${c.id}`)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                            title="View Full Case"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
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
