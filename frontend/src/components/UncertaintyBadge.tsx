import React from 'react';
import { getConfidenceDetails, type UncertaintyBand } from '@/lib/confidence';

interface UncertaintyBadgeProps {
  confidence?: number;
  band?: UncertaintyBand;
  size?: 'sm' | 'md';
  className?: string;
}

export const UncertaintyBadge: React.FC<UncertaintyBadgeProps> = ({
  confidence,
  band,
  size = 'md',
  className = '',
}) => {
  let label = 'Low Uncertainty';
  let colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';

  if (confidence !== undefined) {
    const details = getConfidenceDetails(confidence);
    label = details.badgeLabel;
    colorClass = details.badgeColorClass;
  } else if (band) {
    if (band === 'Medium') {
      label = 'Medium Uncertainty';
      colorClass = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
    } else if (band === 'High') {
      label = 'High Uncertainty';
      colorClass = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
    } else {
      label = 'Low Uncertainty';
      colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
    }
  }

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${sizeClasses} ${colorClass} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
};
