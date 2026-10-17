import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  Sprout, 
  Star, 
  Send, 
  CheckCircle2, 
  History, 
  TrendingUp, 
  FileText 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { feedbackApi, type OutcomeFeedback } from '@/api/feedbackApi';
import { useAppStore } from '@/store/useAppStore';

const feedbackSchema = z.object({
  caseId: z.string().min(1, 'Please select a case'),
  fieldId: z.string().min(1, 'Please specify the field'),
  crop: z.string().min(1, 'Please specify the crop'),
  actualDiagnosis: z.string().min(3, 'Please describe the actual diagnosis'),
  treatmentsApplied: z.string().min(3, 'Please specify treatments applied'),
  yieldImpactRating: z.number().min(1).max(5),
  harvestYieldBuPerAc: z.number().optional(),
  agronomicNotes: z.string().min(5, 'Please provide feedback notes'),
});

type FeedbackFormData = z.infer<typeof feedbackSchema>;

export const OutcomeFeedbackPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAppStore();
  const [feedbacks, setFeedbacks] = useState<OutcomeFeedback[]>([]);
  const [rating, setRating] = useState(5);
  const [submittedToast, setSubmittedToast] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FeedbackFormData>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      caseId: 'C-2848',
      fieldId: 'North 40 — Block C',
      crop: 'Dent Corn',
      actualDiagnosis: 'Nitrogen deficiency confirmed by ISU Diagnostic Lab tissue report',
      treatmentsApplied: 'Foliar urea 20 lb/ac applied at V8',
      yieldImpactRating: 5,
      harvestYieldBuPerAc: 215,
      agronomicNotes: 'Full leaf color recovered within 5 days. Ear elongation reached standard metrics.',
    },
  });

  useEffect(() => {
    feedbackApi.getFeedbacks().then(setFeedbacks);
  }, []);

  const onSubmit = async (data: FeedbackFormData) => {
    setLoading(true);
    try {
      const newEntry = await feedbackApi.submitFeedback({
        caseId: data.caseId,
        fieldId: data.fieldId,
        crop: data.crop,
        actualDiagnosis: data.actualDiagnosis,
        treatmentsApplied: [data.treatmentsApplied],
        yieldImpactRating: rating,
        harvestYieldBuPerAc: data.harvestYieldBuPerAc,
        agronomicNotes: data.agronomicNotes,
        submittedBy: user?.displayName || 'Farmer',
      });
      setFeedbacks([newEntry, ...feedbacks]);
      setSubmittedToast(true);
      setTimeout(() => setSubmittedToast(false), 3000);
      reset();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <span>{t('nav.feedback', 'Outcome Feedback')}</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Close the AI loop: record ground-truth lab results, treatment outcomes, and actual harvest yields.
        </p>
      </div>

      {submittedToast && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Outcome feedback submitted successfully! Injected into calibration pipeline.</span>
        </div>
      )}

      {/* 2-Column: Form (Left) & Feedback Log (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Feedback Form */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            Submit Field Outcome Report
          </h3>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Case ID
                </label>
                <input
                  type="text"
                  {...register('caseId')}
                  placeholder="e.g. C-2848"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5"
                />
                {errors.caseId && <p className="text-rose-500 text-[10px] mt-0.5">{errors.caseId.message}</p>}
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Field ID
                </label>
                <input
                  type="text"
                  {...register('fieldId')}
                  placeholder="e.g. North 40"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5"
                />
                {errors.fieldId && <p className="text-rose-500 text-[10px] mt-0.5">{errors.fieldId.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                Crop & Hybrid
              </label>
              <input
                type="text"
                {...register('crop')}
                placeholder="Dent Corn (Pioneer P1197AM)"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5"
              />
              {errors.crop && <p className="text-rose-500 text-[10px] mt-0.5">{errors.crop.message}</p>}
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                Actual Confirmed Diagnosis (Lab or Agronomist)
              </label>
              <input
                type="text"
                {...register('actualDiagnosis')}
                placeholder="e.g. Nitrogen deficiency confirmed via tissue lab"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5"
              />
              {errors.actualDiagnosis && <p className="text-rose-500 text-[10px] mt-0.5">{errors.actualDiagnosis.message}</p>}
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                Treatments Applied
              </label>
              <input
                type="text"
                {...register('treatmentsApplied')}
                placeholder="e.g. Foliar urea 20 lb/ac"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5"
              />
              {errors.treatmentsApplied && <p className="text-rose-500 text-[10px] mt-0.5">{errors.treatmentsApplied.message}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1.5">
                  Treatment Effectiveness
                </label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setRating(s);
                        setValue('yieldImpactRating', s);
                      }}
                      className="p-1 text-slate-300 hover:text-amber-400 transition"
                    >
                      <Star
                        className={`w-5 h-5 ${
                          s <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300 dark:text-slate-600'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 ml-2">
                    {rating} / 5
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Actual Harvest Yield (bu/ac)
                </label>
                <input
                  type="number"
                  {...register('harvestYieldBuPerAc', { valueAsNumber: true })}
                  placeholder="215"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                Agronomic Notes & Observations
              </label>
              <textarea
                rows={3}
                {...register('agronomicNotes')}
                placeholder="Describe crop response, weather impacts, or timeline..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5"
              />
              {errors.agronomicNotes && <p className="text-rose-500 text-[10px] mt-0.5">{errors.agronomicNotes.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl font-semibold text-xs text-white bg-emerald-800 hover:bg-emerald-900 shadow-md transition disabled:opacity-75 flex items-center justify-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Outcome Feedback</span>
            </button>
          </form>
        </div>

        {/* Right: Submitted Feedback Records */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            Validated Ground-Truth Records
          </h3>

          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {feedbacks.map((fb) => (
              <div
                key={fb.id}
                className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-emerald-800 dark:text-emerald-400">
                    {fb.caseId} · {fb.fieldId}
                  </span>
                  <div className="flex items-center gap-0.5 text-amber-500">
                    {Array.from({ length: fb.yieldImpactRating }).map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-current" />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">{fb.actualDiagnosis}</div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                    Treatment: {fb.treatmentsApplied.join(', ')}
                  </p>
                </div>

                {fb.harvestYieldBuPerAc && (
                  <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    Harvest Yield: {fb.harvestYieldBuPerAc} bu/ac
                  </div>
                )}

                <p className="text-[11px] text-slate-600 dark:text-slate-300 italic">
                  "{fb.agronomicNotes}"
                </p>

                <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between">
                  <span>Verified by {fb.submittedBy}</span>
                  <span>{new Date(fb.submittedAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
