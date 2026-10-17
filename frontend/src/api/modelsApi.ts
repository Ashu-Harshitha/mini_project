import { apiClient, USE_MOCKS } from './client';
import { mockModels, type ModelComparisonItem } from '@/mocks/data';

export const modelsApi = {
  async getModels(): Promise<ModelComparisonItem[]> {
    if (USE_MOCKS) {
      await new Promise(r => setTimeout(r, 150));
      return [...mockModels];
    }
    return apiClient<ModelComparisonItem[]>('/models');
  },

  async getModelById(id: string): Promise<ModelComparisonItem | undefined> {
    if (USE_MOCKS) {
      return mockModels.find(m => m.id === id);
    }
    return apiClient<ModelComparisonItem>(`/models/${id}`);
  },
};
