import { apiClient } from './client';

export interface FarmerSummary {
  role: 'farmer';
  open_cases: number;
  awaiting_review: number;
  latest_decision: string | { case_id?: number; case_number?: string; status?: string; date?: string } | null;
  unread_notifications: number;
}

export interface AgronomistSummary {
  role: 'agronomist';
  pending_in_queue: number;
  high_risk: number;
  reviewed_this_week: number;
  avg_response_time: string;
}

export interface AdminSummary {
  role: 'admin';
  total_cases: number;
  unassigned: number;
  pending: number;
  agronomists_available: number;
  avg_rating: number;
}

export type DashboardSummary = FarmerSummary | AgronomistSummary | AdminSummary;

export const dashboardApi = {
  getSummary: async (): Promise<DashboardSummary> => {
    return apiClient<DashboardSummary>('/dashboard/summary');
  },
};
