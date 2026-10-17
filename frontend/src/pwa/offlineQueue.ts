/**
 * AgriAdvisor AI Offline Draft Queue
 * Caches case drafts created when connectivity is lost and automatically syncs when online.
 */

export interface OfflineDraft {
  id: string;
  timestamp: number;
  farmId: string;
  fieldId: string;
  crop: string;
  growthStage: string;
  soilReportSummary?: string;
  imageThumbnail?: string;
  notes?: string;
  status: 'pending_sync' | 'syncing' | 'failed';
}

const STORAGE_KEY = 'agri_offline_case_queue';

export function getOfflineDrafts(): OfflineDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read offline drafts:', err);
    return [];
  }
}

export function saveOfflineDraft(draft: Omit<OfflineDraft, 'id' | 'timestamp' | 'status'>): OfflineDraft {
  const drafts = getOfflineDrafts();
  const newDraft: OfflineDraft = {
    ...draft,
    id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    timestamp: Date.now(),
    status: 'pending_sync',
  };
  drafts.unshift(newDraft);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  window.dispatchEvent(new CustomEvent('agri_offline_queue_changed', { detail: { count: drafts.length } }));
  return newDraft;
}

export function removeOfflineDraft(id: string): void {
  const drafts = getOfflineDrafts().filter(d => d.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  window.dispatchEvent(new CustomEvent('agri_offline_queue_changed', { detail: { count: drafts.length } }));
}

export async function syncOfflineQueue(
  uploadFn: (draft: OfflineDraft) => Promise<void>
): Promise<{ synced: number; failed: number }> {
  const drafts = getOfflineDrafts();
  if (drafts.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: OfflineDraft[] = [];

  for (const draft of drafts) {
    try {
      await uploadFn(draft);
      synced++;
    } catch (err) {
      console.error(`Failed to sync draft ${draft.id}`, err);
      failed++;
      remaining.push({ ...draft, status: 'failed' });
    }
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
  window.dispatchEvent(new CustomEvent('agri_offline_queue_changed', { detail: { count: remaining.length } }));
  return { synced, failed };
}
