import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  AlertTriangle,
  Clock,
  User,
  ArrowRight,
  ShieldAlert,
  Search,
  Filter,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { casesApi } from '@/api/casesApi';
import { type CaseItem } from '@/mocks/data';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';

export const AgronomistReviewQueue: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let active = true;

    async function loadQueue() {
      setLoading(true);
      try {
        const data = await casesApi.getReviewQueue();
        if (active) {
          // Sort high-risk flagged first then oldest first
          const sorted = [...data].sort((a, b) => {
            const aIsHigh = a.uncertainty === 'High' || a.rawStatus === 'BLOCKED' || a.status === 'Flagged';
            const bIsHigh = b.uncertainty === 'High' || b.rawStatus === 'BLOCKED' || b.status === 'Flagged';
            if (aIsHigh && !bIsHigh) return -1;
            if (!aIsHigh && bIsHigh) return 1;
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          });
          setCases(sorted);
        }
      } catch (err) {
        console.warn('Review queue loading error:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadQueue();

    return () => {
      active = false;
    };
  }, []);

  const calculateAge = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const filteredCases = cases.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.caseNumber.toLowerCase().includes(q) ||
      c.crop.toLowerCase().includes(q) ||
      (c.operator || '').toLowerCase().includes(q) ||
      (c.farmName || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <ClipboardList className="w-6 h-6 text-emerald-700" />
            <span>{t('nav.reviewQueue', 'Agronomist Review Queue')}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Assigned cases awaiting validation. High-risk flagged cases appear at the top.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by farmer, crop, ID..."
              className="text-xs pl-9 pr-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-500">Loading queue...</span>
        </div>
      ) : filteredCases.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No Cases Awaiting Review"
          description="Your queue is clear! All assigned cases have been reviewed."
        />
      ) : (
        <div className="space-y-3">
          {filteredCases.map((c) => {
            const isHighRisk = c.uncertainty === 'High' || c.rawStatus === 'BLOCKED' || c.status === 'Flagged';
            const age = calculateAge(c.assigned_at || c.createdAt);

            return (
              <div
                key={c.id}
                onClick={() => navigate(`/cases/${c.id}`)}
                className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border transition cursor-pointer hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isHighRisk
                    ? 'border-amber-300 dark:border-amber-900/60 bg-amber-50/20'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start sm:items-center gap-4">
                  {/* Avatar / Crop Icon */}
                  <div className="w-12 h-12 rounded-2xl bg-emerald-800 text-white flex items-center justify-center font-bold text-sm shadow flex-shrink-0">
                    {c.crop ? c.crop.slice(0, 2).toUpperCase() : 'AG'}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                        {c.caseNumber}
                      </span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {c.crop}
                      </span>
                      <StatusBadge status={c.rawStatus || c.status} size="sm" />
                      {isHighRisk && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          High-Risk Flagged
                        </span>
                      )}
                      {(!c.assigned_agronomist_id && !c.assignedAgronomist) && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
                          Open Queue Pool
                        </span>
                      )}
                      {(c as any).ai_degraded && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          AI unavailable
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <strong>{c.operator || 'Farmer'}</strong> ({c.farmName})
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{c.assigned_at ? `Assigned ${age}` : `Submitted ${age}`}</span>
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 line-clamp-1 max-w-xl">
                      {c.description || c.summary || c.issue}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/cases/${c.id}`);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow flex items-center gap-1.5 transition"
                  >
                    <span>{(!c.assigned_agronomist_id && !c.assignedAgronomist) ? 'Claim & Review' : 'Review Case'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
