import { create } from 'zustand';
import { type Farm, mockFarms } from '@/mocks/data';
import { type UnitSystem } from '@/lib/units';
import i18n from '@/i18n';
import { getOfflineDrafts } from '@/pwa/offlineQueue';

export type UserRole = 'farmer' | 'agronomist' | 'admin';

export interface AppUser {
  id?: number;
  uid: string;
  username: string;
  email: string;
  displayName: string;
  role: UserRole;
  language?: 'en' | 'hi' | 'kn';
  phone?: string;
  avatarInitials: string;
}

interface AppState {
  theme: 'light' | 'dark';
  currentFarm: Farm;
  currentModel: string;
  unitSystem: UnitSystem;
  language: 'en' | 'hi' | 'kn';
  user: AppUser | null;
  isAuthResolved: boolean;
  isOnline: boolean;
  offlineCount: number;
  sidebarCollapsed: boolean;

  // Actions
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setCurrentFarm: (farm: Farm) => void;
  setCurrentModel: (model: string) => void;
  setUnitSystem: (system: UnitSystem) => void;
  setLanguage: (lang: 'en' | 'hi' | 'kn') => void;
  setUser: (user: AppUser | null) => void;
  setIsAuthResolved: (resolved: boolean) => void;
  switchRole: (role: UserRole) => void;
  setIsOnline: (online: boolean) => void;
  refreshOfflineCount: () => void;
  toggleSidebar: () => void;
}

const getInitialUser = (): AppUser | null => {
  try {
    const raw = localStorage.getItem('agri_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const useAppStore = create<AppState>((set, get) => ({
  theme: (localStorage.getItem('agri_theme') as 'light' | 'dark') || 'light',
  currentFarm: mockFarms[0],
  currentModel: 'Gemini 2.5 Flash',
  unitSystem: (localStorage.getItem('agri_units') as UnitSystem) || 'imperial',
  language: (localStorage.getItem('agri_lang') as 'en' | 'hi' | 'kn') || 'en',
  user: getInitialUser(),
  isAuthResolved: Boolean(getInitialUser()),
  isOnline: navigator.onLine,
  offlineCount: getOfflineDrafts().length,
  sidebarCollapsed: false,

  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('agri_theme', next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ theme: next });
  },

  setTheme: (theme) => {
    localStorage.setItem('agri_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ theme });
  },

  setCurrentFarm: (farm) => set({ currentFarm: farm }),
  setCurrentModel: (model) => set({ currentModel: model }),

  setUnitSystem: (unitSystem) => {
    localStorage.setItem('agri_units', unitSystem);
    set({ unitSystem });
  },

  setLanguage: (lang) => {
    localStorage.setItem('agri_lang', lang);
    i18n.changeLanguage(lang);
    set({ language: lang });
  },

  setUser: (user) => {
    if (user) {
      localStorage.setItem('agri_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('agri_user');
    }
    set({ user });
  },
  setIsAuthResolved: (isAuthResolved) => set({ isAuthResolved }),

  switchRole: (role) => {
    const roleIdMap: Record<UserRole, number> = {
      farmer: 1,
      agronomist: 2,
      admin: 3,
    };
    const names: Record<UserRole, { name: string; initials: string; email: string }> = {
      farmer: { name: 'James Donovan', initials: 'JD', email: 'james@westfieldagri.com' },
      agronomist: { name: 'Dr. Sarah Chen', initials: 'SC', email: 'schen@iastate.edu' },
      admin: { name: 'Administrator', initials: 'AD', email: 'admin@agriadvisor.ai' },
    };
    const details = names[role];
    const newUser: AppUser = {
      id: roleIdMap[role],
      uid: `usr-${role}`,
      username: role,
      email: details.email,
      displayName: details.name,
      role,
      avatarInitials: details.initials,
    };
    localStorage.setItem('agri_user', JSON.stringify(newUser));
    set({ user: newUser });
  },

  setIsOnline: (isOnline) => set({ isOnline }),
  refreshOfflineCount: () => set({ offlineCount: getOfflineDrafts().length }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
