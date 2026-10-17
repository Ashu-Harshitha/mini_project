import { useState, useEffect, useCallback } from 'react';
import { notificationsApi, type NotificationItem } from '@/api/notificationsApi';

export function useNotifications(pollIntervalMs = 30000) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifs = useCallback(async () => {
    try {
      const items = await notificationsApi.getNotifications();
      setNotifications(items);
    } catch (err) {
      console.error('Failed to poll notifications', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchNotifs, pollIntervalMs]);

  const markAsRead = async (id: string) => {
    await notificationsApi.markAsRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllAsRead = async () => {
    await notificationsApi.markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const deleteNotification = async (id: string) => {
    await notificationsApi.deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    loading,
    refresh: fetchNotifs,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
}
