import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  History,
  User,
  Clock,
  ChevronRight,
  Calendar,
  Star,
  Sprout,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store/useAppStore';
import { casesApi } from '@/api/casesApi';
import { type CaseItem } from '@/mocks/data';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';

export const CaseHistory: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAppStore();

  const [cases, setCases] = useState<CaseItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  const role = user?.role || 'farmer';

  useEffect(() => {
    let active = true;

    async function loadCases() {
      setLoading(true);
      try {
        const data = await casesApi.getCases();
        if (active) setCases(data);
      } catch (err) {
        console.warn('Failed to load cases:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadCases();

    return () => {
      active = false;
    };
  }, []);

  const filteredCases = cases.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      c.caseNumber.toLowerCase().includes(q) ||
      c.crop.toLowerCase().includes(q) ||
      (c.issue || '').toLowerCase().includes(q) ||
      (c.operator || '').toLowerCase().includes(q) ||
      (c.farmName || '').toLowerCase().includes(q);

    let matchesStatus = true;
    if (statusFilter === 'Resolved') {
      matchesStatus = c.status === 'Resolved';
    } else if (statusFilter === 'Review') {
      matchesStatus = c.status === 'Review' || c.status === 'Draft';
    } else if (statusFilter === 'Flagged') {
      matchesStatus = c.status === 'Flagged';
    }

    return matchesSearch && matchesStatus;
  });

  // Group cases by farmer for Agronomist view
  const groupedByFarmer = filteredCases.reduce((acc, curr) => {
    const farmerKey = curr.operator || 'Farmer';
    if (!acc[farmerKey]) {
      acc[farmerKey] = [];
    }
    acc[farmerKey].push(curr);
    return acc;
  }, {} as Record<string, CaseItem[]>);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-emerald-700" />
            <span>{role === 'farmer' ? t('nav.myCases', 'My Cases') : t('nav.caseHistory', 'Case History')}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {role === 'farmer'
              ? 'Past field inquiries and expert decisions'
              : 'Past cases grouped by farmer with full review conversations'}
          </p>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search crop, farmer, ID..."
              className="text-xs pl-9 pr-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none"
          >
            <option value="All">All Statuses</option>
            <option value="Review">With Expert / In Progress</option>
            <option value="Resolved">Decided / Approved</option>
            <option value="Flagged">High Risk / Blocked</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-500">Loading cases...</span>
        </div>
      ) : filteredCases.length === 0 ? (
        <EmptyState
          icon={History}
          title="No cases found"
          description="No inquiry records matched your filters."
        />
      ) : role === 'agronomist' ? (
        /* AGRONOMIST GROUPED BY FARMER VIEW */
        <div className="space-y-6">
          {Object.entries(groupedByFarmer).map(([farmerName, farmerCases]) => (
            <div
              key={farmerName}
              className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold text-xs">
                    {farmerName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {farmerName}
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      {farmerCases.length} case{farmerCases.length > 1 ? 's' : ''} on record
                    </span>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {farmerCases.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/cases/${c.id}`)}
                    className="py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 rounded-xl transition cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                          {c.caseNumber}
                        </span>
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                          {c.crop}
                        </span>
                        <StatusBadge status={c.rawStatus || c.status} size="sm" />
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1 max-w-lg">
                        {c.description || c.summary || c.issue}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-400">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* FARMER SIMPLE LIST VIEW (No technical terms or confidence %) */
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
          {filteredCases.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/cases/${c.id}`)}
              className="py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 rounded-xl transition cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-800 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                  {c.crop ? c.crop.slice(0, 2).toUpperCase() : 'CP'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      {c.crop}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      {c.caseNumber}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1 max-w-md">
                    {c.description || c.summary || c.issue}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <StatusBadge status={c.rawStatus || c.status} size="sm" />
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
