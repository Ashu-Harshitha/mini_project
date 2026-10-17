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
  created_at: string;
  created_by: number | null;
}

export interface CreateAgronomistPayload {
  full_name: string;
  username: string;
  password: string;
  email?: string;
  phone?: string;
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
};
