import { apiClient } from './client';

export interface PromptTemplateItem {
  id: string | number;
  step: string;
  version: number;
  is_active: boolean;
  title: string;
  subtitle?: string;
  template: string;
  variables: string[];
  created_at?: string;
  // UI helpers
  category?: string;
}

export interface PromptPreviewResponse {
  step: string;
  model: string;
  temperature: number;
  max_tokens: number;
  output: any;
  rendered_prompt: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  generated_at: string;
}

export interface PromptCompareJob {
  job_id: string;
  step: string;
  version_a: number;
  version_b: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: string;
  completed_at?: string;
  comparison?: {
    step: string;
    version_a: {
      version: number;
      run_id: number;
      metrics: Record<string, any>;
    };
    version_b: {
      version: number;
      run_id: number;
      metrics: Record<string, any>;
    };
    winner: 'version_a' | 'version_b';
  };
  error?: string;
}

const stepToCategory: Record<string, string> = {
  image_analysis: 'Image Analysis',
  recommendation: 'Recommendation',
  risk_guardrails: 'Safety Check',
  farmer_report: 'Farmer Summary',
};

export const promptsApi = {
  async getPrompts(): Promise<PromptTemplateItem[]> {
    const list = await apiClient<PromptTemplateItem[]>('/prompts');
    return list.map((p) => ({
      ...p,
      category: stepToCategory[p.step] || p.step.replace('_', ' ').toUpperCase(),
    }));
  },

  async getPromptVersions(step: string): Promise<PromptTemplateItem[]> {
    const list = await apiClient<PromptTemplateItem[]>(`/prompts/${step}/versions`);
    return list.map((p) => ({
      ...p,
      category: stepToCategory[p.step] || p.step.replace('_', ' ').toUpperCase(),
    }));
  },

  async activatePromptVersion(step: string, version: number): Promise<PromptTemplateItem> {
    return apiClient<PromptTemplateItem>(`/prompts/${step}/activate/${version}`, {
      method: 'POST',
    });
  },

  async runPromptPreview(params: {
    step: string;
    variables?: Record<string, any>;
    sample_case_id?: number;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    template?: string;
  }): Promise<PromptPreviewResponse> {
    const { step, ...body } = params;
    return apiClient<PromptPreviewResponse>(`/prompts/${step}/preview`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async updatePrompt(step: string, templateText: string): Promise<PromptTemplateItem> {
    return apiClient<PromptTemplateItem>(`/prompts/${step}`, {
      method: 'PUT',
      body: JSON.stringify({ template: templateText }),
    });
  },

  async comparePrompts(params: {
    step: string;
    version_a: number;
    version_b: number;
    max_cases?: number;
  }): Promise<{ job_id: string; message: string; status: string }> {
    return apiClient<any>('/prompts/compare', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async getCompareJob(jobId: string): Promise<PromptCompareJob> {
    return apiClient<PromptCompareJob>(`/prompts/compare/${jobId}`);
  },
};
