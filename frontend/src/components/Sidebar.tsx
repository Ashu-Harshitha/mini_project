import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Scale, 
  FlaskConical, 
  CheckCircle2, 
  ShieldCheck, 
  Database, 
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  History,
  FileCheck2,
  ShieldAlert,
  Sprout,
  Bell,
  Users
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store/useAppStore';
import { getNavItemsForRole } from '@/config/nav';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
  className = '',
}) => {
  const { t } = useTranslation();
  const { user } = useAppStore();

  const currentRole = user?.role || 'farmer';
  const visibleItems = getNavItemsForRole(currentRole);

  return (
    <aside
      className={`relative flex flex-col justify-between border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-300 select-none z-20 ${
        collapsed ? 'w-20' : 'w-64'
      } ${className}`}
    >
      {/* Top Header */}
      <div>
        <div className="h-14 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-800">
          <Link to="/" className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <Sprout className="w-5 h-5 text-emerald-300" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white leading-tight">
                  AgriAdvisor
                </span>
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
                  AI DECISION
                </span>
              </div>
            )}
          </Link>

          {/* Collapse button */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* "+ New Case" Prominent Action Button for Farmers */}
        {currentRole === 'farmer' && (
          <div className="p-3">
            <Link
              to="/new-case"
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-semibold text-xs text-white bg-emerald-800 hover:bg-emerald-900 shadow-sm transition-all duration-200 ${
                collapsed ? 'justify-center px-0' : ''
              }`}
              title="Create New Case"
            >
              <div className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-emerald-300" />
                {!collapsed && <span>{t('wizard.title', 'New Case')}</span>}
              </div>
              {!collapsed && (
                <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-xs">
                  +
                </span>
              )}
            </Link>
          </div>
        )}

        {/* Navigation list */}
        <nav className="px-2 py-1 space-y-1 overflow-y-auto max-h-[calc(100vh-210px)]">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const labelText = t(item.labelKey, item.defaultLabel);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                title={collapsed ? labelText : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-emerald-800 text-white shadow-sm font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  } ${collapsed ? 'justify-center px-0' : ''}`
                }
              >
                <Icon className={`w-4 h-4 flex-shrink-0`} />
                {!collapsed && (
                  <span className="truncate flex-1 text-left">{labelText}</span>
                )}
                {!collapsed && item.badge !== undefined && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* System Status at Bottom */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800 text-xs">
        {!collapsed ? (
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2.5 border border-slate-200/60 dark:border-slate-700/60">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              System Status
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{t('app.systemOperational', 'All services operational')}</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center" title="All services operational">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        )}
      </div>
    </aside>
  );
};
