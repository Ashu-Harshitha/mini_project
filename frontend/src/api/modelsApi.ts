import { apiClient } from './client';

export interface ModelComparisonModel {
  id: string;
  name: string;
  model_key: string;
  provider: string;
  is_live: boolean;
  benchmark_only: boolean;
  is_reference: boolean;
  cost_input_per_m: number;
  cost_output_per_m: number;
  free_tier: boolean;
  context_window: string;
  latency_ms: number;
  metrics: {
    image_accuracy: number;
    groundedness: number;
    uncertainty_calibration: number;
    safety_score: number;
    farmer_clarity: number;
    environmental_awareness: number;
  };
  agriAdvisorScore: number;
  source_note?: string;
  is_active?: boolean;
  is_top_pick?: boolean;
}

export interface ModelComparisonResponse {
  weights: Record<string, number>;
  models: ModelComparisonModel[];
  active_model: string;
  highest_score: number;
}

export interface LiveModelsResponse {
  live_models: ModelComparisonModel[];
  active_model: string;
}

export const modelsApi = {
  async getComparison(): Promise<ModelComparisonResponse> {
    return apiClient<ModelComparisonResponse>('/models/comparison');
  },

  async getLiveModels(): Promise<LiveModelsResponse> {
    return apiClient<LiveModelsResponse>('/models/live');
  },

  async getActiveModel(): Promise<{ active_model: string }> {
    return apiClient<{ active_model: string }>('/models/active');
  },

  async setActiveModel(model: string): Promise<{ active_model: string; message: string }> {
    return apiClient<{ active_model: string; message: string }>('/models/active', {
      method: 'PUT',
      body: JSON.stringify({ model }),
    });
  },

  async getModels(): Promise<ModelComparisonModel[]> {
    return apiClient<ModelComparisonModel[]>('/models');
  },

  async getModelById(id: string): Promise<ModelComparisonModel> {
    return apiClient<ModelComparisonModel>(`/models/${id}`);
  },
};
