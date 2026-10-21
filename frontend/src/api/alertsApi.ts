import { apiClient } from './client';

export interface WeatherAlertItem {
  id: number;
  farm_id: number;
  farm_name?: string | null;
  field_id?: number | null;
  field_name?: string | null;
  source: 'weather' | 'sensor';
  rule: string;
  severity: 'info' | 'warning' | 'high';
  start_date: string;
  title: string;
  message: string;
  action: string;
  params?: Record<string, any>;
  created_at: string;
  notified_at?: string | null;
  read_at?: string | null;
  is_demo: boolean;
}

export interface AlertsListResponse {
  items: WeatherAlertItem[];
  total: number;
  unread_count: number;
  page: number;
  limit: number;
}

export interface ForecastDayItem {
  date: string;
  temp_max_c: number;
  temp_min_c: number;
  precipitation_mm: number;
  precipitation_probability_pct: number;
  wind_speed_kmh: number;
  uv_index_max: number;
}

export interface FarmForecastResponse {
  farm_id: number;
  farm_name: string;
  field_id?: number | null;
  field_name?: string | null;
  latitude: number;
  longitude: number;
  is_coarsened: boolean;
  timezone: string;
  fetched_at: string;
  daily: ForecastDayItem[];
  active_alerts_count: number;
}

export interface AlertJobSummary {
  farms_checked: number;
  alerts_created: number;
  failures: number;
  farms_skipped: number;
  details: Array<{
    farm_id: number;
    status: 'success' | 'skipped' | 'error';
    alerts_created?: number;
    reason?: string;
    error?: string;
  }>;
}

export const alertsApi = {
  getAlerts: async (params: {
    unread?: boolean;
    severity?: string;
    farm?: number;
    farm_id?: number;
    source?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<AlertsListResponse> => {
    const query = new URLSearchParams();
    if (params.unread !== undefined) query.append('unread', String(params.unread));
    if (params.severity) query.append('severity', params.severity);
    if (params.farm !== undefined) query.append('farm', String(params.farm));
    if (params.farm_id !== undefined) query.append('farm_id', String(params.farm_id));
    if (params.source) query.append('source', params.source);
    if (params.page !== undefined) query.append('page', String(params.page));
    if (params.limit !== undefined) query.append('limit', String(params.limit));

    const qs = query.toString();
    return apiClient<AlertsListResponse>(`/alerts${qs ? `?${qs}` : ''}`);
  },

  markAlertRead: async (id: number): Promise<WeatherAlertItem> => {
    return apiClient<WeatherAlertItem>(`/alerts/${id}/read`, {
      method: 'PATCH',
    });
  },

  markAllAlertsRead: async (): Promise<{ count: number; message: string }> => {
    return apiClient<{ count: number; message: string }>('/alerts/read-all', {
      method: 'POST',
    });
  },

  getFarmForecast: async (farmId: number): Promise<FarmForecastResponse> => {
    return apiClient<FarmForecastResponse>(`/farms/${farmId}/forecast`);
  },

  adminRunAlertsJob: async (): Promise<AlertJobSummary> => {
    return apiClient<AlertJobSummary>('/admin/alerts/run', {
      method: 'POST',
    });
  },
};
