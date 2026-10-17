import { apiClient, USE_MOCKS } from './client';
import { mockNotifications } from '@/mocks/data';

export interface NotificationItem {
  id: string;
  type: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  time: string;
  read: boolean;
  caseId?: string;
}

function mapNotificationFromBackend(raw: any): NotificationItem {
  let type: NotificationItem['type'] = 'info';
  if (raw.event === 'high_risk_flag') type = 'critical';
  else if (raw.event === 'review_required') type = 'warning';
  else if (raw.event === 'case_approved') type = 'success';

  return {
    id: String(raw.id),
    type,
    title: raw.title || 'Notification',
    message: raw.message || '',
    time: raw.created_at
      ? new Date(raw.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Just now',
    read: Boolean(raw.is_read),
    caseId: raw.case_id ? String(raw.case_id) : undefined,
  };
}

let inMemoryNotifications = [...mockNotifications];

export const notificationsApi = {
  async getNotifications(): Promise<NotificationItem[]> {
    if (USE_MOCKS) {
      await new Promise(r => setTimeout(r, 100));
      return [...inMemoryNotifications];
    }
    try {
      const rawList = await apiClient<any[]>('/notifications');
      if (!rawList || rawList.length === 0) {
        return [...mockNotifications];
      }
      return rawList.map(mapNotificationFromBackend);
    } catch {
      return [...mockNotifications];
    }
  },

  async markAsRead(id: string): Promise<void> {
    if (USE_MOCKS) {
      inMemoryNotifications = inMemoryNotifications.map(n => 
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
      inMemoryNotifications = inMemoryNotifications.map(n => ({ ...n, read: true }));
      return;
    }
    const current = await this.getNotifications();
    for (const n of current) {
      if (!n.read) {
        await this.markAsRead(n.id);
      }
    }
  },

  async deleteNotification(id: string): Promise<void> {
    if (USE_MOCKS) {
      inMemoryNotifications = inMemoryNotifications.filter(n => n.id !== id);
      return;
    }
  },
};
