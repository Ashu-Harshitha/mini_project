import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  PlusCircle, 
  ClipboardList, 
  History, 
  Settings as SettingsIcon 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store/useAppStore';

export const BottomNav: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAppStore();

  const isAgronomist = user?.role === 'agronomist' || user?.role === 'admin';

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 px-3 py-1 flex items-center justify-around">
      <NavLink
        to="/dashboard"
        className={({ isActive }) =>
          `flex flex-col items-center py-1 px-2 text-[10px] font-medium transition ${
            isActive ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400'
          }`
        }
      >
        <LayoutDashboard className="w-5 h-5 mb-0.5" />
        <span>{t('nav.dashboard', 'Home')}</span>
      </NavLink>

      <NavLink
        to="/cases"
        className={({ isActive }) =>
          `flex flex-col items-center py-1 px-2 text-[10px] font-medium transition ${
            isActive ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400'
          }`
        }
      >
        <History className="w-5 h-5 mb-0.5" />
        <span>{t('nav.caseHistory', 'Cases')}</span>
      </NavLink>

      {/* Center New Case button */}
      <NavLink
        to="/new-case"
        className="flex flex-col items-center -mt-4"
      >
        <div className="w-12 h-12 rounded-full bg-emerald-800 text-white flex items-center justify-center shadow-lg border-2 border-white dark:border-slate-900">
          <PlusCircle className="w-6 h-6 text-emerald-300" />
        </div>
        <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400 mt-0.5">
          {t('nav.newCase', 'New')}
        </span>
      </NavLink>

      {isAgronomist ? (
        <NavLink
          to="/review-queue"
          className={({ isActive }) =>
            `flex flex-col items-center py-1 px-2 text-[10px] font-medium relative transition ${
              isActive ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400'
            }`
          }
        >
          <ClipboardList className="w-5 h-5 mb-0.5" />
          <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-500" />
          <span>{t('nav.reviewQueue', 'Queue')}</span>
        </NavLink>
      ) : (
        <NavLink
          to="/models"
          className={({ isActive }) =>
            `flex flex-col items-center py-1 px-2 text-[10px] font-medium transition ${
              isActive ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400'
            }`
          }
        >
          <ClipboardList className="w-5 h-5 mb-0.5" />
          <span>Models</span>
        </NavLink>
      )}

      <NavLink
        to="/settings"
        className={({ isActive }) =>
          `flex flex-col items-center py-1 px-2 text-[10px] font-medium transition ${
            isActive ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400'
          }`
        }
      >
        <SettingsIcon className="w-5 h-5 mb-0.5" />
        <span>{t('nav.settings', 'Settings')}</span>
      </NavLink>
    </nav>
  );
};
