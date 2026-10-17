import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppStore, type UserRole } from '@/store/useAppStore';
import { ShieldAlert } from 'lucide-react';

interface RoleGuardProps {
  allowedRoles?: UserRole[];
  children: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ allowedRoles, children }) => {
  const { user, isAuthResolved } = useAppStore();
  const location = useLocation();

  if (!isAuthResolved) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-400">Loading session...</span>
        </div>
      </div>
    );
  }

  // Not logged in: redirect to landing page "/" remembering where they came from
  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  // If specific roles are required and user lacks them
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="p-8 max-w-md mx-auto text-center mt-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Access Restricted</h3>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          This section requires one of the following roles: {allowedRoles.join(', ')}.
          Your current active role is <strong className="text-slate-700 dark:text-slate-300 capitalize">{user.role}</strong>.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
