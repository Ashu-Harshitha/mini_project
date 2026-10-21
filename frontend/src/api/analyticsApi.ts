import { apiClient } from './client';
import { getIdToken } from '@/lib/firebase';
import { useAppStore } from '@/store/useAppStore';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://api.agriadvisor.ai/v1';

export interface KpiItem {
  value: number | null;
  previous_value: number | null;
}

export interface CasePerDayItem {
  date: string;
  created: number;
  decided: number;
}

export interface ByCropItem {
  crop: string;
  count: number;
}

export interface ByIssueCategoryItem {
  category: string;
  count: number;
}

export interface FunnelStageItem {
  stage: string;
  label_key: string;
  count: number;
  drop_off_pct: number;
}

export interface DecisionMix {
  approve: number;
  approve_with_edits: number;
  reject: number;
}

export interface AgentStatItem {
  agronomist_id: number;
  agronomist: string;
  open: number;
  reviewed: number;
  avg_hours_to_decision: number | null;
  avg_rating: number | null;
  timeout_count: number;
  available: boolean;
}

export interface RatingDistributionItem {
  rating: number;
  count: number;
}

export interface TopFarmItem {
  farm_id: number;
  farm_name: string;
  count: number;
}

export interface SensorFindingItem {
  key: string;
  label_key: string;
  count: number;
}

export interface AlertByRuleItem {
  rule: string;
  count: number;
}

export interface AdminAnalyticsData {
  from: string;
  to: string;
  previous_from: string;
  previous_to: string;
  kpis: {
    total_cases: KpiItem;
    cases_in_range: KpiItem;
    avg_hours_to_decision: KpiItem;
    unassigned_now: KpiItem;
    pending_now: KpiItem;
    avg_rating: KpiItem;
    reassign_rate: KpiItem;
    ai_degraded_rate: KpiItem;
    sensor_report_rate: KpiItem;
    outcome_success_rate: KpiItem;
  };
  cases_per_day: CasePerDayItem[];
  by_crop: ByCropItem[];
  by_issue_category: ByIssueCategoryItem[];
  status_funnel: FunnelStageItem[];
  decision_mix: DecisionMix;
  ai_agreement_rate: number | null;
  agent_stats: AgentStatItem[];
  language_mix: {
    farmers: Array<{ language: string; count: number }>;
    messages: Array<{ language: string; count: number }>;
  };
  rating_distribution: RatingDistributionItem[];
  top_farms_by_cases: TopFarmItem[];
  response_time_buckets: {
    lt_1h: number;
    '1_4h': number;
    '4_24h': number;
    gt_24h: number;
  };
  sensor_findings: SensorFindingItem[];
  alerts_by_rule: AlertByRuleItem[];
}

export const analyticsApi = {
  async getAnalytics(params?: { from?: string; to?: string }): Promise<AdminAnalyticsData> {
    const q = new URLSearchParams();
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient<AdminAnalyticsData>(`/admin/analytics${qs}`);
  },

  async downloadExportCsv(section: string, from?: string, to?: string): Promise<void> {
    const q = new URLSearchParams();
    q.set('section', section);
    if (from) q.set('from', from);
    if (to) q.set('to', to);

    let token = await getIdToken();
    const currentUser = useAppStore.getState().user;
    if (!token && currentUser) {
      token = `demo-${currentUser.username || currentUser.role}`;
    }

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (currentUser?.role) {
      headers['X-Demo-Role'] = currentUser.role;
      headers['X-User-Role'] = currentUser.role;
    }

    const res = await fetch(`${BASE_URL}/admin/analytics/export.csv?${q.toString()}`, {
      headers,
    });
    if (!res.ok) {
      throw new Error(`Export failed: ${res.statusText}`);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_${section}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },
};
