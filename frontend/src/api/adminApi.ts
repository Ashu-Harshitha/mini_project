import { apiClient } from './client';

export interface AdminUser {
  id: number;
  username: string;
  full_name: string | null;
  role: 'farmer' | 'agronomist' | 'admin';
  language: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  available?: boolean;
  max_open_cases?: number;
  created_at: string;
  created_by: number | null;
}

export interface AdminAgronomist {
  id: number;
  name: string;
  username: string;
  available: boolean;
  open_count: number;
  max_open_cases: number;
  total_reviewed: number;
  avg_feedback_rating?: number;
  avg_rating?: number;
  accepted_count?: number;
  accepted_with_edits_count?: number;
  rejected_count?: number;
  positive_reviews_count?: number;
  negative_reviews_count?: number;
}

export interface CreateAgronomistPayload {
  full_name: string;
  username: string;
  password: string;
  email?: string;
  phone?: string;
}

export interface AdminCaseItem {
  id: number;
  case_number: string;
  farmer_id: number;
  farmer_name?: string;
  status: string;
  crop: string;
  description?: string;
  assigned_agronomist_id?: number | null;
  assigned_agronomist_name?: string | null;
  assigned_at?: string | null;
  decision_note?: string | null;
  final_suggestion?: string | null;
  farmer_feedback_rating?: number | null;
  farmer_feedback_comment?: string | null;
  created_at: string;
  reassign_count: number;
  history?: Array<{
    id: number;
    from_user_id?: number | null;
    from_name?: string | null;
    to_user_id?: number | null;
    to_name?: string | null;
    reason: string;
    created_at: string;
  }>;
}

export interface AdminCommunication {
  id: number;
  case_id: number;
  case_number?: string;
  sender_id: number;
  sender_name?: string;
  sender_role: string;
  farmer_name?: string;
  agronomist_name?: string;
  kind: string;
  original_lang: string;
  original_text: string;
  text: string;
  audio_url?: string | null;
  transcript_status: string;
  created_at: string;
}

export interface AdminFeedbackItem {
  id: number;
  rating: number;
  comment?: string | null;
  comment_lang?: string | null;
  comment_translated?: string | null;
  audio_url?: string | null;
  case_id: number;
  case_number?: string;
  farmer_id?: number;
  farmer_name?: string;
  agronomist_id?: number | null;
  agronomist_name?: string | null;
  created_at: string;
}

export const adminApi = {
  getUsers: async (role?: string): Promise<AdminUser[]> => {
    const query = role ? `?role=${role}` : '';
    return apiClient<AdminUser[]>(`/admin/users${query}`);
  },

  createAgronomist: async (payload: CreateAgronomistPayload): Promise<AdminUser> => {
    return apiClient<AdminUser>('/admin/agronomists', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  resetPassword: async (userId: number, newPassword: string): Promise<{ status: string; message: string }> => {
    return apiClient<{ status: string; message: string }>(`/admin/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    });
  },

  deleteUser: async (userId: number): Promise<{ status: string; message: string }> => {
    return apiClient<{ status: string; message: string }>(`/admin/users/${userId}`, {
      method: 'DELETE',
    });
  },

  getAgronomists: async (): Promise<AdminAgronomist[]> => {
    return apiClient<AdminAgronomist[]>('/admin/agronomists');
  },

  updateAgronomist: async (
    id: number,
    data: { max_open_cases?: number; available?: boolean }
  ): Promise<AdminAgronomist> => {
    return apiClient<AdminAgronomist>(`/admin/agronomists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getCases: async (params?: {
    status?: string;
    agronomist_id?: number;
    unassigned?: boolean;
    farmer_id?: number;
  }): Promise<AdminCaseItem[]> => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.agronomist_id) query.set('agronomist_id', String(params.agronomist_id));
    if (params?.unassigned) query.set('unassigned', 'true');
    if (params?.farmer_id) query.set('farmer_id', String(params.farmer_id));
    const qs = query.toString();
    return apiClient<AdminCaseItem[]>(`/admin/cases${qs ? `?${qs}` : ''}`);
  },

  assignCase: async (caseId: number | string, agronomistId: number): Promise<any> => {
    return apiClient<any>(`/admin/cases/${caseId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ agronomist_id: agronomistId }),
    });
  },

  getCommunications: async (params?: {
    farmer_id?: number;
    agronomist_id?: number;
    case_id?: number;
    kind?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ total: number; page: number; page_size: number; items: AdminCommunication[] }> => {
    const query = new URLSearchParams();
    if (params?.farmer_id) query.set('farmer_id', String(params.farmer_id));
    if (params?.agronomist_id) query.set('agronomist_id', String(params.agronomist_id));
    if (params?.case_id) query.set('case_id', String(params.case_id));
    if (params?.kind) query.set('kind', params.kind);
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    if (params?.page) query.set('page', String(params.page));
    if (params?.page_size) query.set('page_size', String(params.page_size));
    const qs = query.toString();
    return apiClient<{ total: number; page: number; page_size: number; items: AdminCommunication[] }>(
      `/admin/communications${qs ? `?${qs}` : ''}`
    );
  },

  getCommunicationsCsv: async (params?: {
    farmer_id?: number;
    agronomist_id?: number;
    case_id?: number;
    kind?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<string> => {
    const query = new URLSearchParams();
    if (params?.farmer_id) query.set('farmer_id', String(params.farmer_id));
    if (params?.agronomist_id) query.set('agronomist_id', String(params.agronomist_id));
    if (params?.case_id) query.set('case_id', String(params.case_id));
    if (params?.kind) query.set('kind', params.kind);
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    const qs = query.toString();
    return apiClient<string>(`/admin/communications.csv${qs ? `?${qs}` : ''}`);
  },

  getFeedback: async (params?: {
    agronomist_id?: number;
    farmer_id?: number;
    min_rating?: number;
  }): Promise<{ items: AdminFeedbackItem[]; avg_rating_per_agronomist: Record<string, number> }> => {
    const query = new URLSearchParams();
    if (params?.agronomist_id) query.set('agronomist_id', String(params.agronomist_id));
    if (params?.farmer_id) query.set('farmer_id', String(params.farmer_id));
    if (params?.min_rating) query.set('min_rating', String(params.min_rating));
    const qs = query.toString();
    return apiClient<{ items: AdminFeedbackItem[]; avg_rating_per_agronomist: Record<string, number> }>(
      `/admin/feedback${qs ? `?${qs}` : ''}`
    );
  },

  getDemoStatus: async (): Promise<DemoStatusResponse> => {
    return apiClient<DemoStatusResponse>('/admin/demo/status');
  },

  loadDemoData: async (params?: { cases?: number; no_firebase?: boolean }): Promise<DemoLoadResponse> => {
    return apiClient<DemoLoadResponse>('/admin/demo/load', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });
  },

  resetDemoData: async (): Promise<DemoResetResponse> => {
    return apiClient<DemoResetResponse>('/admin/demo', {
      method: 'DELETE',
    });
  },
};

export interface DemoStatusResponse {
  enabled: boolean;
  has_demo_data: boolean;
  counts: {
    users: number;
    farms: number;
    cases: number;
    weather_alerts: number;
    notifications: number;
    outbreaks: number;
    eval_runs: number;
  };
}

export interface DemoLoadResponse {
  success: boolean;
  message: string;
  counts: Record<string, number>;
}

export interface DemoResetResponse {
  success: boolean;
  message: string;
  deleted: Record<string, number>;
}

