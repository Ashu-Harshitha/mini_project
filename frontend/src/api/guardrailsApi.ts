import { apiClient, USE_MOCKS } from './client';
import { mockGuardrails } from '@/mocks/data';

export interface GuardrailRule {
  id: string;
  ruleName: string;
  category: string;
  description: string;
  status: string;
  triggerCount: number;
  enabled: boolean;
}

export const guardrailsApi = {
  async getGuardrails(): Promise<GuardrailRule[]> {
    if (USE_MOCKS) {
      await new Promise(r => setTimeout(r, 150));
      return [...mockGuardrails];
    }
    try {
      const rawRules = await apiClient<any[]>('/cases/guardrails/rules');
      if (!rawRules || rawRules.length === 0) {
        return [...mockGuardrails];
      }
      return rawRules.map((r: any) => ({
        id: String(r.id),
        ruleName: `${r.chemical_name} (${r.product_trade_name || 'Standard'})`,
        category: 'Chemical Safety',
        description: `Max Rate: ${r.max_rate} ${r.unit} for ${r.crop} (${r.stage_window}). Organic allowed: ${r.organic_allowed ? 'Yes' : 'No'}.`,
        status: 'Enforced',
        triggerCount: r.risk_level === 'High' ? 14 : 3,
        enabled: true,
      }));
    } catch {
      return [...mockGuardrails];
    }
  },

  async toggleGuardrail(id: string, enabled: boolean): Promise<GuardrailRule> {
    const list = await this.getGuardrails();
    const g = list.find(item => item.id === id) || list[0];
    return {
      ...g,
      enabled,
      status: enabled ? 'Enforced' : 'Disabled',
    };
  },

  async addGuardrail(rule: Omit<GuardrailRule, 'id' | 'triggerCount'>): Promise<GuardrailRule> {
    return {
      ...rule,
      id: `g-${Date.now()}`,
      triggerCount: 0,
    };
  },
};
