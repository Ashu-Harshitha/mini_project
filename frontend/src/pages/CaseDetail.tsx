import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Calendar, 
  UserCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Download, 
  Sparkles,
  Info
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { casesApi } from '@/api/casesApi';
import { type CaseItem } from '@/mocks/data';
import { CornLeafPlaceholder } from '@/components/CornLeafPlaceholder';
import { UncertaintyBadge } from '@/components/UncertaintyBadge';
import { ConfidenceBar } from '@/components/ConfidenceBar';
import { ReviewPanel } from '@/components/ReviewPanel';
import { AudioPlayerButton } from '@/components/AudioPlayerButton';
import { units } from '@/lib/units';
import { useAppStore } from '@/store/useAppStore';

export const CaseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { unitSystem } = useAppStore();
  const [caseItem, setCaseItem] = useState<CaseItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      casesApi.getCaseById(id).then((data) => {
        setCaseItem(data);
        setLoading(false);
      });
    }
  }, [id]);

  if (loading || !caseItem) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading case details...</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Navigation & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Case {caseItem.caseNumber}
              </h1>
              <UncertaintyBadge confidence={caseItem.confidence} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {caseItem.farmName} · {caseItem.fieldName} · {caseItem.crop} ({caseItem.growthStage})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {caseItem.audioUrl && (
            <AudioPlayerButton
              audioUrl={caseItem.audioUrl}
              speechText={caseItem.farmerReport?.description || caseItem.summary}
            />
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Grid: Visual Imagery & Diagnostic Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-5">
          <CornLeafPlaceholder showAnnotations={true} />
        </div>

        <div className="md:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            Diagnostic Summary & Observations
          </h3>

          <div className="space-y-2">
            {caseItem.observations.map((obs, idx) => (
              <div key={idx} className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900 dark:text-white">{obs.description}</span>
                  <span className="font-bold">{obs.confidence}%</span>
                </div>
                <ConfidenceBar score={obs.confidence} showPercentage={false} heightClass="h-1.5" />
              </div>
            ))}
          </div>

          <div className="pt-2 text-xs text-slate-600 dark:text-slate-300">
            <p className="font-semibold text-slate-900 dark:text-white">Soil Interpretation:</p>
            <p className="mt-0.5">• Nitrogen: {caseItem.soil.nitrogen.value} ({caseItem.soil.nitrogen.status})</p>
            <p>• pH: {caseItem.soil.ph.value} ({caseItem.soil.ph.status})</p>
          </div>
        </div>
      </div>

      {/* Recommendations List with "Why" line */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
          Candidate Agronomic Recommendations (Sorted by Confidence)
        </h3>

        <div className="space-y-3">
          {[...caseItem.recommendations].sort((a, b) => b.confidence - a.confidence).map((rec) => (
            <div key={rec.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900 dark:text-white">{rec.title}</span>
                <UncertaintyBadge confidence={rec.confidence} size="sm" />
              </div>
              <ConfidenceBar score={rec.confidence} showPercentage={true} heightClass="h-1.5" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-500 pt-1">
                <div><span className="font-semibold text-slate-700 dark:text-slate-300">Evidence:</span> {rec.evidence}</div>
                <div><span className="font-semibold text-slate-700 dark:text-slate-300">Assumptions:</span> {rec.assumptions}</div>
              </div>
              {rec.whyLine && (
                <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 text-[11px] flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  <span>{rec.whyLine}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Agronomist Review Panel */}
      <ReviewPanel
        reviewerName={caseItem.agronomistReview?.reviewerName || 'Dr. Sarah Chen'}
        reviewerTitle={caseItem.agronomistReview?.title || 'Senior Agronomist'}
        organization={caseItem.agronomistReview?.organization || 'Iowa State Extension'}
        initialStatus={caseItem.agronomistReview?.status || 'Approved'}
        initialNotes={caseItem.agronomistReview?.notes || 'Diagnostic inspection completed.'}
        isReadOnly={true}
      />
    </div>
  );
};
