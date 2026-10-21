import { apiClient, USE_MOCKS } from './client';
import { mockNotifications } from '@/mocks/data';

export interface NotificationItem {
  id: string;
  type: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  time: string;
  read: boolean;
  channel?: string;
  status?: string;
  caseId?: string;
}

export interface AdminNotificationLogItem {
  id: number;
  user_id: number;
  username?: string;
  event: string;
  title: string;
  message: string;
  channel: string;
  status: string;
  error?: string;
  attempts: number;
  is_read: boolean;
  case_id?: number;
  created_at: string;
}

export interface AdminNotificationLogResponse {
  items: AdminNotificationLogItem[];
  total: number;
  page: number;
  page_size: number;
}

function mapNotificationFromBackend(raw: any): NotificationItem {
  let type: NotificationItem['type'] = 'info';
  if (raw.event === 'high_risk_flag' || raw.event === 'unassigned_alert') type = 'critical';
  else if (raw.event === 'review_required' || raw.event === 'weather_alert') type = 'warning';
  else if (raw.event === 'case_approved' || raw.event === 'case_decision') type = 'success';

  return {
    id: String(raw.id),
    type,
    title: raw.title || 'Notification',
    message: raw.message || '',
    time: raw.created_at
      ? new Date(raw.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Just now',
    read: Boolean(raw.is_read || raw.status === 'read'),
    channel: raw.channel,
    status: raw.status,
    caseId: raw.case_id ? String(raw.case_id) : undefined,
  };
}

let inMemoryNotifications = [...mockNotifications];

export const notificationsApi = {
  async getNotifications(params?: {
    limit?: number;
    offset?: number;
    unread?: boolean;
    channel?: string;
  }): Promise<NotificationItem[]> {
    if (USE_MOCKS) {
      await new Promise((r) => setTimeout(r, 100));
      return [...inMemoryNotifications];
    }
    try {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      if (params?.unread !== undefined) q.set('unread', String(params.unread));
      if (params?.channel) q.set('channel', params.channel);

      const qs = q.toString() ? `?${q.toString()}` : '';
      const rawList = await apiClient<any[]>(`/notifications${qs}`);
      if (!Array.isArray(rawList)) return [];
      return rawList.map(mapNotificationFromBackend);
    } catch {
      return [];
    }
  },

  async markAsRead(id: string): Promise<void> {
    if (USE_MOCKS) {
      inMemoryNotifications = inMemoryNotifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      return;
    }
    try {
      await apiClient(`/notifications/${id}/read`, { method: 'PATCH' });
    } catch (e) {
      console.warn('Failed to mark notification read in backend:', e);
    }
  },

  async markAllAsRead(): Promise<void> {
    if (USE_MOCKS) {
      inMemoryNotifications = inMemoryNotifications.map((n) => ({ ...n, read: true }));
      return;
    }
    try {
      await apiClient('/notifications/read-all', { method: 'POST' });
    } catch (e) {
      console.warn('Failed to mark all read in backend:', e);
    }
  },

  async deleteNotification(id: string): Promise<void> {
    if (USE_MOCKS) {
      inMemoryNotifications = inMemoryNotifications.filter((n) => n.id !== id);
      return;
    }
    await this.markAsRead(id);
  },

  async updateNotificationPrefs(payload: {
    channel_prefs?: { email?: boolean; whatsapp?: boolean; sms?: boolean };
    email?: string;
    phone?: string;
  }): Promise<any> {
    if (USE_MOCKS) {
      return { status: 'success' };
    }
    return apiClient('/auth/me/notification-prefs', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async getNotificationLog(params?: {
    channel?: string;
    status?: string;
    user_id?: number;
    event?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
  }): Promise<AdminNotificationLogResponse> {
    if (USE_MOCKS) {
      return {
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
      };
    }
    const q = new URLSearchParams();
    if (params?.channel) q.set('channel', params.channel);
    if (params?.status) q.set('status', params.status);
    if (params?.user_id) q.set('user_id', String(params.user_id));
    if (params?.event) q.set('event', params.event);
    if (params?.start_date) q.set('start_date', params.start_date);
    if (params?.end_date) q.set('end_date', params.end_date);
    if (params?.page) q.set('page', String(params.page));
    if (params?.page_size) q.set('page_size', String(params.page_size));

    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient<AdminNotificationLogResponse>(`/admin/notification-log${qs}`);
  },

  async sendTestNotification(channel: string): Promise<{ status: string; channel: string; error?: string }> {
    if (USE_MOCKS) {
      return { status: 'sent', channel };
    }
    return apiClient('/admin/notifications/test', {
      method: 'POST',
      body: JSON.stringify({ channel }),
    });
  },
};
