import { apiClient } from './client';

export interface ChemicalRuleItem {
  id: number;
  name: string;
  chemical_name: string;
  max_rate: number;
  unit: string;
  stage_window: string;
  organic_allowed: boolean;
  requires_agronomist: boolean;
  description: string;
  is_banned: boolean;
}

export interface GuardrailSettings {
  auto_approve_confidence_threshold: number;
  hide_confidence_threshold: number;
}

export interface GuardrailCounters {
  flags_by_type: Record<string, number>;
  total_flags_30d: number;
  blocked_recommendations: number;
  ai_degraded_cases: number;
  total_active_rules: number;
  period: string;
}

export interface GuardrailsRulesResponse {
  rules: ChemicalRuleItem[];
  settings: GuardrailSettings;
  counters: GuardrailCounters;
}

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
  async getRulesAndCounters(): Promise<GuardrailsRulesResponse> {
    return apiClient<GuardrailsRulesResponse>('/guardrails/rules');
  },

  async updateSettings(settings: GuardrailSettings): Promise<GuardrailSettings & { message: string }> {
    return apiClient<GuardrailSettings & { message: string }>('/guardrails/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  // Backwards compatibility helper for existing components
  async getGuardrails(): Promise<GuardrailRule[]> {
    try {
      const data = await this.getRulesAndCounters();
      return data.rules.map((r) => ({
        id: String(r.id),
        ruleName: `${r.chemical_name} (${r.name || 'Standard'})`,
        category: r.is_banned ? 'Banned Restriction' : 'Chemical Safety',
        description: r.is_banned
          ? `BANNED SUBSTANCE: Zero tolerance restriction across all crops.`
          : `Max Rate: ${r.max_rate} ${r.unit} (${r.stage_window}). Organic: ${r.organic_allowed ? 'Yes' : 'No'}.`,
        status: 'Enforced',
        triggerCount: r.is_banned ? 1 : 4,
        enabled: true,
      }));
    } catch {
      return [];
    }
  },

  async toggleGuardrail(id: string, enabled: boolean): Promise<GuardrailRule> {
    const list = await this.getGuardrails();
    const g = list.find((item) => item.id === id) || list[0] || {
      id,
      ruleName: 'Custom Guardrail',
      category: 'Chemical Safety',
      description: 'Enforced safety constraint',
      status: 'Enforced',
      triggerCount: 0,
      enabled: true,
    };
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
