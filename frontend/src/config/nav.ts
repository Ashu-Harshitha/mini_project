import {
  LayoutDashboard,
  PlusCircle,
  History,
  ClipboardList,
  Users,
  MessageSquare,
  Star,
  FlaskConical,
  CheckCircle2,
  Bell,
  Settings as SettingsIcon,
  ShieldAlert,
  Scale,
  Database,
  AlertTriangle,
  BarChart3,
  MapPin,
  type LucideIcon,
} from 'lucide-react';
import { type UserRole } from '@/store/useAppStore';

export interface NavItemConfig {
  to: string;
  labelKey: string;
  defaultLabel: string;
  icon: LucideIcon;
  badge?: number | string;
  roles: UserRole[];
}

export interface RouteGuardRule {
  path: string;
  allowedRoles: UserRole[];
}

// Sidebar items config
export const ALL_NAV_ITEMS: NavItemConfig[] = [
  // Farmer specific
  {
    to: '/dashboard',
    labelKey: 'nav.dashboard',
    defaultLabel: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['farmer', 'agronomist', 'admin'],
  },
  {
    to: '/new-case',
    labelKey: 'nav.newCase',
    defaultLabel: 'New Case',
    icon: PlusCircle,
    roles: ['farmer'],
  },
  {
    to: '/cases',
    labelKey: 'nav.myCases',
    defaultLabel: 'My Cases',
    icon: History,
    roles: ['farmer'],
  },

  // Agronomist specific
  {
    to: '/review-queue',
    labelKey: 'nav.reviewQueue',
    defaultLabel: 'Review Queue',
    icon: ClipboardList,
    roles: ['agronomist'],
  },
  {
    to: '/cases',
    labelKey: 'nav.caseHistory',
    defaultLabel: 'History',
    icon: History,
    roles: ['agronomist'],
  },

  // Admin & Agronomist Biosecurity Map
  {
    to: '/admin/outbreaks',
    labelKey: 'nav.outbreakMap',
    defaultLabel: 'Outbreak Map',
    icon: MapPin,
    roles: ['admin', 'agronomist'],
  },

  // Admin specific
  {
    to: '/admin/analytics',
    labelKey: 'nav.analytics',
    defaultLabel: 'Analytics',
    icon: BarChart3,
    roles: ['admin'],
  },
  {
    to: '/admin/agronomists',
    labelKey: 'admin.agronomists',
    defaultLabel: 'Agronomists',
    icon: Users,
    roles: ['admin'],
  },
  {
    to: '/admin/cases',
    labelKey: 'admin.allCases',
    defaultLabel: 'All Cases',
    icon: ClipboardList,
    roles: ['admin'],
  },
  {
    to: '/admin/communications',
    labelKey: 'admin.communicationLogs',
    defaultLabel: 'Communication Logs',
    icon: MessageSquare,
    roles: ['admin'],
  },
  {
    to: '/admin/notification-logs',
    labelKey: 'admin.notificationLogs',
    defaultLabel: 'Notification Logs',
    icon: Bell,
    roles: ['admin'],
  },
  {
    to: '/admin/feedback',
    labelKey: 'admin.farmerFeedback',
    defaultLabel: 'Farmer Feedback',
    icon: Star,
    roles: ['admin'],
  },
  {
    to: '/prompt-lab',
    labelKey: 'nav.promptLab',
    defaultLabel: 'Prompt Lab',
    icon: FlaskConical,
    roles: ['admin'],
  },
  {
    to: '/evaluation',
    labelKey: 'nav.evaluation',
    defaultLabel: 'Evaluation',
    icon: CheckCircle2,
    roles: ['admin'],
  },
  {
    to: '/models',
    labelKey: 'nav.modelComparison',
    defaultLabel: 'Model Comparison',
    icon: Scale,
    roles: ['admin'],
  },
  {
    to: '/responsible-ai',
    labelKey: 'nav.responsibleAi',
    defaultLabel: 'Responsible AI',
    icon: ShieldAlert,
    roles: ['admin'],
  },

  // Common items at bottom
  {
    to: '/alerts',
    labelKey: 'nav.alerts',
    defaultLabel: 'Alerts',
    icon: AlertTriangle,
    roles: ['farmer', 'agronomist', 'admin'],
  },
  {
    to: '/notifications',
    labelKey: 'nav.notifications',
    defaultLabel: 'Notifications',
    icon: Bell,
    roles: ['farmer', 'agronomist', 'admin'],
  },
  {
    to: '/settings',
    labelKey: 'nav.settings',
    defaultLabel: 'Settings',
    icon: SettingsIcon,
    roles: ['farmer', 'agronomist', 'admin'],
  },
];

// Helper to get navigation items tailored for the active role
export function getNavItemsForRole(role: UserRole): NavItemConfig[] {
  return ALL_NAV_ITEMS.filter((item) => item.roles.includes(role));
}

// Route access rules: defining allowed roles for guarded routes
export const ROUTE_ACCESS_RULES: RouteGuardRule[] = [
  { path: '/dashboard', allowedRoles: ['farmer', 'agronomist', 'admin'] },
  { path: '/alerts', allowedRoles: ['farmer', 'agronomist', 'admin'] },
  { path: '/new-case', allowedRoles: ['farmer'] },
  { path: '/cases', allowedRoles: ['farmer', 'agronomist', 'admin'] },
  { path: '/cases/:id', allowedRoles: ['farmer', 'agronomist', 'admin'] },
  { path: '/notifications', allowedRoles: ['farmer', 'agronomist', 'admin'] },
  { path: '/settings', allowedRoles: ['farmer', 'agronomist', 'admin'] },
  { path: '/feedback', allowedRoles: ['farmer'] },
  { path: '/review-queue', allowedRoles: ['agronomist', 'admin'] },
  { path: '/admin/analytics', allowedRoles: ['admin'] },
  { path: '/admin/agronomists', allowedRoles: ['admin'] },
  { path: '/admin/users', allowedRoles: ['admin'] },
  { path: '/admin/cases', allowedRoles: ['admin'] },
  { path: '/admin/communications', allowedRoles: ['admin'] },
  { path: '/admin/notification-logs', allowedRoles: ['admin'] },
  { path: '/admin/feedback', allowedRoles: ['admin'] },
  { path: '/guardrails', allowedRoles: ['admin'] },
  { path: '/prompt-lab', allowedRoles: ['admin'] },
  { path: '/evaluation', allowedRoles: ['admin'] },
  { path: '/models', allowedRoles: ['admin'] },
  { path: '/responsible-ai', allowedRoles: ['admin'] },
  { path: '/rag-explorer', allowedRoles: ['admin'] },
  { path: '/admin/outbreaks', allowedRoles: ['admin', 'agronomist'] },
  { path: '/outbreaks', allowedRoles: ['admin', 'agronomist'] },
];

export function isPathAllowedForRole(pathname: string, role: UserRole): boolean {
  for (const rule of ROUTE_ACCESS_RULES) {
    if (rule.path === pathname) {
      return rule.allowedRoles.includes(role);
    }
    // Simple wildcard match for /cases/:id or /admin/*
    if (rule.path.includes(':') || rule.path.endsWith('*')) {
      const regexPattern = '^' + rule.path.replace(/:[^\s/]+/g, '[^/]+').replace(/\*/g, '.*') + '$';
      if (new RegExp(regexPattern).test(pathname)) {
        return rule.allowedRoles.includes(role);
      }
    }
  }
  return true;
}
