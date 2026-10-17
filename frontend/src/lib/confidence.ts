/**
 * AgriAdvisor AI Unified Confidence & Uncertainty Definition
 * Single % number everywhere:
 * Bands:
 *   - Low Uncertainty:  >= 80% (High confidence)
 *   - Medium Uncertainty: 60 - 79% (Medium confidence)
 *   - High Uncertainty:   < 60% (Low confidence)
 */

export type UncertaintyBand = 'Low' | 'Medium' | 'High';

export interface ConfidenceDetails {
  score: number;
  uncertaintyBand: UncertaintyBand;
  badgeLabel: string;
  badgeColorClass: string;
  barColorClass: string;
  textColorClass: string;
}

export function clampConfidence(value: number): number {
  if (isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getUncertaintyBand(confidence: number): UncertaintyBand {
  const score = clampConfidence(confidence);
  if (score >= 80) return 'Low';
  if (score >= 60) return 'Medium';
  return 'High';
}

export function getConfidenceDetails(confidence: number): ConfidenceDetails {
  const score = clampConfidence(confidence);
  const band = getUncertaintyBand(score);

  switch (band) {
    case 'Low':
      return {
        score,
        uncertaintyBand: 'Low',
        badgeLabel: 'Low Uncertainty',
        badgeColorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
        barColorClass: 'bg-emerald-600 dark:bg-emerald-500',
        textColorClass: 'text-emerald-700 dark:text-emerald-400',
      };
    case 'Medium':
      return {
        score,
        uncertaintyBand: 'Medium',
        badgeLabel: 'Medium Uncertainty',
        badgeColorClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
        barColorClass: 'bg-amber-500 dark:bg-amber-400',
        textColorClass: 'text-amber-700 dark:text-amber-400',
      };
    case 'High':
    default:
      return {
        score,
        uncertaintyBand: 'High',
        badgeLabel: 'High Uncertainty',
        badgeColorClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
        barColorClass: 'bg-rose-600 dark:bg-rose-500',
        textColorClass: 'text-rose-700 dark:text-rose-400',
      };
  }
}
