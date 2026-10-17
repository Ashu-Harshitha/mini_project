import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ReviewPanelProps {
  reviewerName?: string;
  reviewerTitle?: string;
  organization?: string;
  initialStatus?: 'Awaiting Review' | 'Approved' | 'Approved with Edits' | 'Rejected';
  initialNotes?: string;
  onDecision?: (decision: 'Approved' | 'Approved with Edits' | 'Rejected', notes: string) => void;
  isReadOnly?: boolean;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  reviewerName = 'Dr. Sarah Chen',
  reviewerTitle = 'Senior Agronomist',
  organization = 'Iowa State Extension',
  initialStatus = 'Awaiting Review',
  initialNotes = '',
  onDecision,
  isReadOnly = false,
}) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes);

  const handleAction = (decision: 'Approved' | 'Approved with Edits' | 'Rejected') => {
    setStatus(decision);
    onDecision?.(decision, notes);
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'Approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Approved
          </span>
        );
      case 'Approved with Edits':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600" />
            Approved with Edits
          </span>
        );
      case 'Rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-700">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Awaiting Review
          </span>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
      {/* Reviewer Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold text-sm tracking-wider">
            SC
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                {reviewerName}
              </h4>
              <UserCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {reviewerTitle} · {organization}
            </p>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {/* AI Summary For Review */}
      <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
        <p className="font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] mb-2">
          AI Summary For Review
        </p>
        <p>
          • <span className="font-medium text-slate-900 dark:text-white">Primary concern:</span> Nitrogen deficiency — 14 ppm soil N, interveinal chlorosis at V8
        </p>
        <p>
          • <span className="font-medium text-slate-900 dark:text-white">Recommended action:</span> Tissue test first; if confirmed, apply UAN 28% at 15 gal/ac
        </p>
        <p>
          • <span className="font-medium text-slate-900 dark:text-white">Irrigation:</span> 1.0 inch recommended within 48h, defer 24h if rain holds
        </p>
        <p>
          • <span className="font-medium text-slate-900 dark:text-white">Confidence:</span> Moderate (68–81%), N vs S ambiguity unresolved without tissue data
        </p>
      </div>

      {/* Status banner when decided */}
      {status !== 'Awaiting Review' && (
        <div className={`mt-4 p-3.5 rounded-lg border text-xs flex items-center gap-2.5 ${
          status === 'Rejected'
            ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300'
        }`}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">
            {status === 'Rejected'
              ? 'Recommendations rejected. Case routed to agronomist deep investigation.'
              : 'Recommendations approved for farmer delivery.'}
          </span>
        </div>
      )}

      {/* Reviewer Notes Textarea */}
      <div className="mt-4">
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
          Agronomist Notes
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isReadOnly}
          placeholder="Add review notes, modifications, or rationale..."
          className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white p-3 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition disabled:opacity-75"
        />
      </div>

      {/* Action Buttons */}
      {!isReadOnly && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => handleAction('Approved')}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t('wizard.approve', 'Approve')}
          </button>

          <button
            type="button"
            onClick={() => handleAction('Approved with Edits')}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t('wizard.approveWithEdits', 'Approve with Edits')}
          </button>

          <button
            type="button"
            onClick={() => handleAction('Rejected')}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 transition"
          >
            <XCircle className="w-3.5 h-3.5" />
            {t('wizard.reject', 'Reject')}
          </button>
        </div>
      )}
    </div>
  );
};
