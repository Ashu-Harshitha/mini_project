import React from 'react';
import { getConfidenceDetails } from '@/lib/confidence';

interface ConfidenceBarProps {
  score: number;
  showPercentage?: boolean;
  showBand?: boolean;
  heightClass?: string;
  className?: string;
}

export const ConfidenceBar: React.FC<ConfidenceBarProps> = ({
  score,
  showPercentage = true,
  showBand = false,
  heightClass = 'h-2',
  className = '',
}) => {
  const details = getConfidenceDetails(score);

  return (
    <div className={`w-full ${className}`}>
      {(showPercentage || showBand) && (
        <div className="flex items-center justify-between text-xs mb-1 font-medium">
          {showBand && (
            <span className={details.textColorClass}>
              {details.badgeLabel}
            </span>
          )}
          {showPercentage && (
            <span className={`ml-auto font-semibold ${details.textColorClass}`}>
              {details.score}% confidence
            </span>
          )}
        </div>
      )}
      <div className={`w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden ${heightClass}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${details.barColorClass}`}
          style={{ width: `${details.score}%` }}
        />
      </div>
    </div>
  );
};
