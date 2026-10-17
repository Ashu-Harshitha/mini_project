import { apiClient } from './client';

export interface RegisterPayload {
  full_name: string;
  username: string;
  password: string;
  email?: string;
  phone?: string;
  language?: string;
}

export interface RegisterResponse {
  username: string;
  login_email: string;
}

export interface UserMeResponse {
  id: number;
  username: string;
  full_name: string | null;
  role: 'farmer' | 'agronomist' | 'admin';
  language: 'en' | 'hi' | 'kn';
  email: string | null;
  phone: string | null;
}

export const authApi = {
  register: async (payload: RegisterPayload): Promise<RegisterResponse> => {
    return apiClient<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getMe: async (): Promise<UserMeResponse> => {
    return apiClient<UserMeResponse>('/me');
  },
};
