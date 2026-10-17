import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, AlertTriangle, XCircle, FileText, Sparkles } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className = '',
  size = 'md',
}) => {
  const { t } = useTranslation();

  const normalized = (status || '').toUpperCase();

  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  let Icon = Clock;
  let labelKey = 'status.pending';
  let defaultLabel = 'Pending Review';

  if (['APPROVED', 'DELIVERED', 'RESOLVED', 'OUTCOME_REPORTED'].includes(normalized)) {
    colorClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800';
    Icon = CheckCircle2;
    labelKey = 'status.resolved';
    defaultLabel = 'Decision Approved';
  } else if (['REJECTED'].includes(normalized)) {
    colorClasses = 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800';
    Icon = XCircle;
    labelKey = 'status.rejected';
    defaultLabel = 'Rejected';
  } else if (['BLOCKED', 'FLAGGED'].includes(normalized)) {
    colorClasses = 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800';
    Icon = AlertTriangle;
    labelKey = 'status.flagged';
    defaultLabel = 'High Risk / Blocked';
  } else if (['DRAFT', 'ANALYZING', 'ANALYZED'].includes(normalized)) {
    colorClasses = 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800';
    Icon = FileText;
    labelKey = 'status.draft';
    defaultLabel = 'Draft';
  } else if (['SUBMITTED', 'PENDING_REVIEW', 'IN_REVIEW', 'REVIEW'].includes(normalized)) {
    colorClasses = 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800';
    Icon = Clock;
    labelKey = 'status.withExpert';
    defaultLabel = 'With Expert';
  }

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-semibold',
  }[size];

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${colorClasses} ${sizeClasses} ${className}`}
    >
      <Icon className={size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      <span>{t(labelKey, defaultLabel)}</span>
    </span>
  );
};
