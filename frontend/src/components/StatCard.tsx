import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  isPositive?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtext,
  isPositive = true,
  icon,
  className = '',
}) => {
  return (
    <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm transition hover:shadow-md ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {title}
        </span>
        {icon && (
          <div className="text-slate-400 dark:text-slate-500">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {value}
        </span>
      </div>

      {subtext && (
        <div className="mt-2 text-xs flex items-center gap-1">
          <span className={isPositive ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-rose-600 dark:text-rose-400 font-medium'}>
            {subtext}
          </span>
        </div>
      )}
    </div>
  );
};
