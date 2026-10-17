import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { RoleGuard } from '@/components/RoleGuard';
import { useAppStore, type UserRole } from '@/store/useAppStore';
import { auth, onAuthStateChanged } from '@/lib/firebase';
import { authApi } from '@/api/authApi';
import { Sprout } from 'lucide-react';

// Pages
import { LandingPage } from '@/pages/LandingPage';
import { Dashboard } from '@/pages/Dashboard';
import { NewCaseWizard } from '@/pages/NewCaseWizard';
import { ModelComparison } from '@/pages/ModelComparison';
import { PromptLab } from '@/pages/PromptLab';
import { Evaluation } from '@/pages/Evaluation';
import { ResponsibleAi } from '@/pages/ResponsibleAi';
import { RagExplorer } from '@/pages/RagExplorer';
import { Settings } from '@/pages/Settings';
import { CaseHistory } from '@/pages/CaseHistory';
import { CaseDetail } from '@/pages/CaseDetail';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { AgronomistReviewQueue } from '@/pages/AgronomistReviewQueue';
import { OutcomeFeedbackPage } from '@/pages/OutcomeFeedbackPage';
import { GuardrailRulesAdmin } from '@/pages/GuardrailRulesAdmin';
import { ManageUsers } from '@/pages/ManageUsers';
import { AdminCases } from '@/pages/AdminCases';
import { AdminCommunications } from '@/pages/AdminCommunications';
import { AdminFeedback } from '@/pages/AdminFeedback';

export const App: React.FC = () => {
  const { 
    theme, 
    setIsOnline, 
    refreshOfflineCount, 
    setUser, 
    setLanguage, 
    isAuthResolved, 
    setIsAuthResolved 
  } = useAppStore();

  useEffect(() => {
    // Sync dark class on mount
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Online / Offline window listeners
    const handleOnline = () => {
      setIsOnline(true);
      refreshOfflineCount();
    };
    const handleOffline = () => {
      setIsOnline(false);
      refreshOfflineCount();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('agri_offline_queue_changed', refreshOfflineCount);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('agri_offline_queue_changed', refreshOfflineCount);
    };
  }, [theme, setIsOnline, refreshOfflineCount]);

  // Auth state rehydration
  useEffect(() => {
    if (!auth) {
      setIsAuthResolved(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const me = await authApi.getMe();
          const initials = (me.full_name || me.username || 'User')
            .split(' ')
            .map((s) => s[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);

          setUser({
            id: me.id,
            uid: fbUser.uid,
            username: me.username,
            email: me.email || fbUser.email || '',
            displayName: me.full_name || me.username,
            role: me.role as UserRole,
            language: me.language as 'en' | 'hi' | 'kn',
            phone: me.phone || '',
            avatarInitials: initials || 'U',
          });

          if (me.language) {
            setLanguage(me.language as any);
          }
        } catch (err) {
          console.warn('Failed to load user session profile:', err);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setIsAuthResolved(true);
    });

    return () => unsubscribe();
  }, [setUser, setLanguage, setIsAuthResolved]);

  // Small loading splash until auth resolves
  if (!isAuthResolved) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-sans">
        <div className="w-14 h-14 rounded-2xl bg-emerald-800 text-white flex items-center justify-center shadow-xl animate-pulse mb-4">
          <Sprout className="w-8 h-8 text-emerald-300" />
        </div>
        <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <span>Loading AgriAdvisor AI...</span>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Landing & Login page at "/" */}
        <Route path="/" element={<LandingPage />} />

        {/* Protected App Routes inside Layout */}
        <Route
          element={
            <RoleGuard>
              <Layout />
            </RoleGuard>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="cases" element={<CaseHistory />} />
          <Route path="cases/:id" element={<CaseDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="notifications" element={<NotificationsPage />} />

          {/* Farmer exclusive routes */}
          <Route
            path="new-case"
            element={
              <RoleGuard allowedRoles={['farmer']}>
                <NewCaseWizard />
              </RoleGuard>
            }
          />
          <Route
            path="feedback"
            element={
              <RoleGuard allowedRoles={['farmer']}>
                <OutcomeFeedbackPage />
              </RoleGuard>
            }
          />

          {/* Agronomist & Admin routes */}
          <Route
            path="review-queue"
            element={
              <RoleGuard allowedRoles={['agronomist', 'admin']}>
                <AgronomistReviewQueue />
              </RoleGuard>
            }
          />

          {/* Admin exclusive routes */}
          <Route
            path="admin/agronomists"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <ManageUsers />
              </RoleGuard>
            }
          />
          <Route
            path="admin/users"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <ManageUsers />
              </RoleGuard>
            }
          />
          <Route
            path="admin/cases"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <AdminCases />
              </RoleGuard>
            }
          />
          <Route
            path="admin/communications"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <AdminCommunications />
              </RoleGuard>
            }
          />
          <Route
            path="admin/feedback"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <AdminFeedback />
              </RoleGuard>
            }
          />
          <Route
            path="guardrails"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <GuardrailRulesAdmin />
              </RoleGuard>
            }
          />
          <Route
            path="prompt-lab"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <PromptLab />
              </RoleGuard>
            }
          />
          <Route
            path="evaluation"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <Evaluation />
              </RoleGuard>
            }
          />
          <Route
            path="models"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <ModelComparison />
              </RoleGuard>
            }
          />
          <Route
            path="responsible-ai"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <ResponsibleAi />
              </RoleGuard>
            }
          />
          <Route
            path="rag-explorer"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <RagExplorer />
              </RoleGuard>
            }
          />
        </Route>

        {/* Redirect any unmapped routes to "/" */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
