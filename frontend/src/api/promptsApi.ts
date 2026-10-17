import { apiClient, USE_MOCKS } from './client';
import { mockPrompts, type PromptTemplate } from '@/mocks/data';

const stepToCategory: Record<string, PromptTemplate['category']> = {
  image_analysis: 'Image Analysis',
  recommendation: 'Recommendation',
  risk_guardrails: 'Safety Check',
  farmer_report: 'Environmental',
};

const idToStep: Record<string, string> = {
  'p-1': 'image_analysis',
  'p-2': 'recommendation',
  'p-3': 'risk_guardrails',
  'p-4': 'farmer_report',
  '1': 'image_analysis',
  '2': 'recommendation',
  '3': 'risk_guardrails',
  '4': 'farmer_report',
};

export const promptsApi = {
  async getPrompts(): Promise<PromptTemplate[]> {
    if (USE_MOCKS) {
      await new Promise(r => setTimeout(r, 150));
      return [...mockPrompts];
    }
    try {
      const rawList = await apiClient<any[]>('/prompts');
      if (!rawList || rawList.length === 0) {
        return [...mockPrompts];
      }
      return rawList.map((p: any, idx: number) => {
        const fallback = mockPrompts[idx % mockPrompts.length];
        const category = stepToCategory[p.step] || fallback.category;
        return {
          id: p.id ? String(p.id) : `p-${idx + 1}`,
          category,
          title: p.title || fallback.title,
          subtitle: p.subtitle || fallback.subtitle,
          template: p.template || fallback.template,
          variables: p.variables || fallback.variables,
          mockOutput: fallback.mockOutput,
        };
      });
    } catch {
      return [...mockPrompts];
    }
  },

  async runPromptPreview(promptId: string, model: string, temperature: number, maxTokens: number): Promise<any> {
    await new Promise(r => setTimeout(r, 400));
    const p = mockPrompts.find(item => item.id === promptId) || mockPrompts[0];
    return {
      model,
      temperature,
      maxTokens,
      generatedAt: new Date().toISOString(),
      output: p.mockOutput,
    };
  },

  async updatePrompt(promptId: string, templateText: string): Promise<PromptTemplate> {
    if (USE_MOCKS) {
      const p = mockPrompts.find(item => item.id === promptId);
      if (p) {
        p.template = templateText;
        return p;
      }
      return mockPrompts[0];
    }

    const step = idToStep[promptId] || 'image_analysis';

    try {
      const updated = await apiClient<any>(`/prompts/${step}`, {
        method: 'PUT',
        body: JSON.stringify({ template: templateText }),
      });
      const currentList = await this.getPrompts();
      const existing = currentList.find(p => p.id === promptId) || currentList[0];
      return {
        ...existing,
        template: updated.template,
      };
    } catch {
      const currentList = await this.getPrompts();
      const existing = currentList.find(p => p.id === promptId) || currentList[0];
      return {
        ...existing,
        template: templateText,
      };
    }
  },
};
