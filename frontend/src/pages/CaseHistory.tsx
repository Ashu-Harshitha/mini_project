import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Filter, 
  ExternalLink, 
  Download, 
  History, 
  CheckCircle2, 
  Clock, 
  AlertTriangle 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { casesApi } from '@/api/casesApi';
import { type CaseItem } from '@/mocks/data';
import { UncertaintyBadge } from '@/components/UncertaintyBadge';

export const CaseHistory: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    casesApi.getCases().then((data) => {
      setCases(data);
      setLoading(false);
    });
  }, []);

  const filteredCases = cases.filter((c) => {
    const matchesSearch =
      c.caseNumber.toLowerCase().includes(search.toLowerCase()) ||
      c.crop.toLowerCase().includes(search.toLowerCase()) ||
      c.issue.toLowerCase().includes(search.toLowerCase()) ||
      c.farmName.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('nav.caseHistory', 'Case History')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Historical diagnostic investigations, agronomist reviews, and field treatment records.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            const blob = new Blob([JSON.stringify(filteredCases, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'case_history_export.json';
            a.click();
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-sm transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Cases</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Case ID, crop, issue, or farm name..."
            className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white pl-9 pr-3 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {['All', 'Resolved', 'Review', 'Flagged', 'Agronomist'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                statusFilter === st
                  ? 'bg-emerald-800 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Cases Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Case ID</th>
                <th className="py-3 px-4">Crop</th>
                <th className="py-3 px-4">Issue</th>
                <th className="py-3 px-4">Farm & Field</th>
                <th className="py-3 px-4">Confidence</th>
                <th className="py-3 px-4">Uncertainty</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredCases.map((c) => (
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
                  <td className="py-3.5 px-4">
                    <div className="text-slate-900 dark:text-white font-medium">{c.farmName}</div>
                    <div className="text-[10px] text-slate-400">{c.fieldName}</div>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                    {c.confidence}%
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
