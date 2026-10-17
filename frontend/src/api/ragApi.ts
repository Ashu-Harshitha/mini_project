import { apiClient, USE_MOCKS } from './client';
import { mockRagData, type RagItem } from '@/mocks/data';

export const ragApi = {
  async getRagStats() {
    if (USE_MOCKS) {
      return { ...mockRagData.stats };
    }
    return apiClient<typeof mockRagData.stats>('/rag/stats');
  },

  async searchRag(query: string, sourceFilter?: string, topK: number = 4): Promise<RagItem[]> {
    if (USE_MOCKS) {
      await new Promise(r => setTimeout(r, 300));
      let results = [...mockRagData.documents];
      if (sourceFilter && sourceFilter !== 'All') {
        results = results.filter(d => d.type === sourceFilter);
      }
      return results.slice(0, topK);
    }
    const params = new URLSearchParams({ q: query, k: topK.toString() });
    if (sourceFilter) params.append('type', sourceFilter);
    return apiClient<RagItem[]>(`/rag/search?${params.toString()}`);
  },
};
