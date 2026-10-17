import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ClipboardList, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ExternalLink, 
  Check, 
  Sparkles,
  Search,
  MessageSquare
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { casesApi } from '@/api/casesApi';
import { type CaseItem } from '@/mocks/data';
import { UncertaintyBadge } from '@/components/UncertaintyBadge';
import { useAppStore } from '@/store/useAppStore';

export const AgronomistReviewQueue: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [decidedCases, setDecidedCases] = useState<Record<string, string>>({});

  useEffect(() => {
    casesApi.getReviewQueue()
      .then((data) => {
        setCases(data);
        setLoading(false);
      })
      .catch(() => {
        casesApi.getCases().then((data) => {
          const pending = data.filter((c) => c.status === 'Review' || c.status === 'Flagged' || c.status === 'Agronomist');
          setCases(pending);
          setLoading(false);
        });
      });
  }, []);

  const handleAction = async (caseId: string, decision: 'Approved' | 'Approved with Edits' | 'Rejected') => {
    const notes = reviewNotes[caseId] || `Validated by ${user?.displayName || 'Agronomist'}`;
    await casesApi.submitReview(caseId, {
      status: decision,
      notes,
      reviewerName: user?.displayName || 'Agronomist',
    });
    setDecidedCases((prev) => ({ ...prev, [caseId]: decision }));
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <span>{t('nav.reviewQueue', 'Agronomist Review Queue')}</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {cases.length - Object.keys(decidedCases).length} Pending
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Expert human-in-the-loop review panel for cases flagged by safety guardrails or sub-threshold confidence.
          </p>
        </div>

        <div className="text-xs text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2">
          Reviewing as: <strong className="text-emerald-700 dark:text-emerald-400">{user?.displayName || 'Agronomist'}</strong> ({user?.role || 'agronomist'})
        </div>
      </div>

      {/* Cases Review Queue List */}
      <div className="space-y-4">
        {cases.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            All cases in queue have been reviewed!
          </div>
        ) : (
          cases.map((c) => {
            const decision = decidedCases[c.id];

            return (
              <div
                key={c.id}
                className={`bg-white dark:bg-slate-900 border rounded-xl p-5 shadow-sm space-y-4 transition ${
                  decision
                    ? 'border-emerald-300 bg-emerald-50/20 dark:border-emerald-800 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-emerald-800 dark:text-emerald-400">
                        {c.caseNumber}
                      </span>
                      <span className="font-semibold text-sm text-slate-900 dark:text-white">
                        {c.crop} ({c.growthStage})
                      </span>
                      <UncertaintyBadge confidence={c.confidence} size="sm" />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {c.farmName} · {c.fieldName} · Reported by {c.operator} ({c.time})
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/cases/${c.id}`)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
                    >
                      <span>Full Case Detail</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* AI Summary Breakdown */}
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                  <p className="font-semibold text-slate-900 dark:text-white mb-1">
                    Diagnosis & Safety Flags:
                  </p>
                  <p>• <span className="font-medium text-slate-900 dark:text-white">Flagged Issue:</span> {c.issue}</p>
                  <p>• <span className="font-medium text-slate-900 dark:text-white">Observed Evidence:</span> {c.summary || c.observations?.[0]?.description}</p>
                  <p>• <span className="font-medium text-slate-900 dark:text-white">Nitrogen / Soil State:</span> {c.soil.nitrogen.value} ({c.soil.nitrogen.status})</p>
                </div>

                {/* Inline Decision Panel or Confirmed State */}
                {decision ? (
                  <div className="p-3 rounded-lg bg-emerald-100/70 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Reviewed as: {decision} — Dispatched to farm operator
                    </span>
                    <button
                      type="button"
                      onClick={() => setDecidedCases((p) => {
                        const next = { ...p };
                        delete next[c.id];
                        return next;
                      })}
                      className="text-[11px] underline opacity-80 hover:opacity-100"
                    >
                      Edit Decision
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    <input
                      type="text"
                      placeholder="Add review notes, dosages, or rationale..."
                      value={reviewNotes[c.id] || ''}
                      onChange={(e) => setReviewNotes({ ...reviewNotes, [c.id]: e.target.value })}
                      className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAction(c.id, 'Approved')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAction(c.id, 'Approved with Edits')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve with Edits</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAction(c.id, 'Rejected')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 transition"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
