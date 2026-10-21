import { apiClient } from './client';

export interface OutbreakItem {
  id: number;
  issue_category: string;
  crop: string;
  center_lat: number;
  center_lng: number;
  radius_km: number;
  farm_count: number;
  case_count: number;
  severity: 'watch' | 'alert';
  status: 'open' | 'resolved';
  first_seen: string;
  last_seen: string;
  resolved_at?: string | null;
}

export interface OutbreakCaseItem {
  id: number;
  case_number: string;
  crop: string;
  issue_category?: string | null;
  status: string;
  created_at: string;
  farm_id?: number | null;
  farm_name?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface OutbreakFarmItem {
  farm_id: number;
  farm_name: string;
  operator_name?: string | null;
  lat?: number | null;
  lng?: number | null;
  case_count: number;
}

export interface OutbreakDetailItem extends OutbreakItem {
  cases: OutbreakCaseItem[];
  farms: OutbreakFarmItem[];
}

export interface MapCaseItem {
  id: number;
  case_number: string;
  crop: string;
  issue_category: string;
  status: string;
  date: string;
  farm_id?: number | null;
  farm_name?: string | null;
  lat: number;
  lng: number;
  outbreak_id?: number | null;
}

export interface NearbyOutbreakAlert {
  outbreak_id: number;
  issue_category: string;
  crop: string;
  severity: 'watch' | 'alert' | string;
  radius_km: number;
  distance_km?: number | null;
  first_seen: string;
  last_seen: string;
  title: string;
  message: string;
  action: string;
}

export const outbreaksApi = {
  getOutbreaks: async (params?: { status?: string; crop?: string; severity?: string }): Promise<OutbreakItem[]> => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.crop) searchParams.append('crop', params.crop);
    if (params?.severity) searchParams.append('severity', params.severity);

    const qs = searchParams.toString();
    return apiClient<OutbreakItem[]>(`/admin/outbreaks${qs ? `?${qs}` : ''}`);
  },

  getOutbreakById: async (id: number): Promise<OutbreakDetailItem> => {
    return apiClient<OutbreakDetailItem>(`/admin/outbreaks/${id}`);
  },

  resolveOutbreak: async (id: number): Promise<OutbreakItem> => {
    return apiClient<OutbreakItem>(`/admin/outbreaks/${id}/resolve`, {
      method: 'PATCH',
    });
  },

  getMapCases: async (params?: { crop?: string; issue?: string; days?: number }): Promise<MapCaseItem[]> => {
    const searchParams = new URLSearchParams();
    if (params?.crop) searchParams.append('crop', params.crop);
    if (params?.issue) searchParams.append('issue', params.issue);
    if (params?.days) searchParams.append('days', String(params.days));

    const qs = searchParams.toString();
    return apiClient<MapCaseItem[]>(`/admin/map/cases${qs ? `?${qs}` : ''}`);
  },

  getNearbyAlerts: async (): Promise<NearbyOutbreakAlert[]> => {
    return apiClient<NearbyOutbreakAlert[]>('/alerts/nearby');
  },
};
