import { apiClient, USE_MOCKS } from './client';

export interface OutcomeFeedback {
  id: string;
  caseId: string;
  fieldId: string;
  crop: string;
  actualDiagnosis: string;
  treatmentsApplied: string[];
  yieldImpactRating: number; // 1 to 5
  agronomicNotes: string;
  harvestYieldBuPerAc?: number;
  submittedAt: string;
  submittedBy: string;
}

const mockFeedbackStore: OutcomeFeedback[] = [
  {
    id: 'fb-1',
    caseId: 'C-2848',
    fieldId: 'North 40 — Block C',
    crop: 'Corn',
    actualDiagnosis: 'Nitrogen deficiency confirmed by ISU tissue lab',
    treatmentsApplied: ['Sidedressed 30 lb/ac UAN 28%'],
    yieldImpactRating: 5,
    agronomicNotes: 'Full canopy color recovery within 6 days after application. Corn reached R1 smoothly.',
    harvestYieldBuPerAc: 218,
    submittedAt: '2026-10-14T10:00:00Z',
    submittedBy: 'James Donovan',
  },
];

function mapOutcomeFromBackend(raw: any): OutcomeFeedback {
  return {
    id: String(raw.id),
    caseId: raw.case_number || (raw.case_id ? `C-${raw.case_id}` : 'C-2848'),
    fieldId: raw.field_name || 'North 40 — Block C',
    crop: raw.crop || 'Dent Corn',
    actualDiagnosis: raw.actual_diagnosis,
    treatmentsApplied: raw.treatments_applied || [],
    yieldImpactRating: raw.yield_impact_rating,
    agronomicNotes: raw.notes || '',
    harvestYieldBuPerAc: raw.harvest_yield ?? undefined,
    submittedAt: raw.created_at || new Date().toISOString(),
    submittedBy: raw.submitted_by || 'James Donovan',
  };
}

export const feedbackApi = {
  async getFeedbacks(): Promise<OutcomeFeedback[]> {
    if (USE_MOCKS) {
      await new Promise(r => setTimeout(r, 150));
      return [...mockFeedbackStore];
    }
    try {
      const items = await apiClient<any[]>('/cases/outcomes');
      if (items && items.length > 0) {
        return items.map(mapOutcomeFromBackend);
      }
    } catch (err) {
      console.warn('Backend outcomes retrieval note:', err);
    }
    return [...mockFeedbackStore];
  },

  async submitFeedback(data: Omit<OutcomeFeedback, 'id' | 'submittedAt'>): Promise<OutcomeFeedback> {
    if (USE_MOCKS) {
      await new Promise(r => setTimeout(r, 200));
      const newEntry: OutcomeFeedback = {
        ...data,
        id: `fb-${Date.now()}`,
        submittedAt: new Date().toISOString(),
      };
      mockFeedbackStore.unshift(newEntry);
      return newEntry;
    }

    try {
      if (data.caseId) {
        const raw = await apiClient<any>(`/cases/${data.caseId}/outcome`, {
          method: 'POST',
          body: JSON.stringify({
            actual_diagnosis: data.actualDiagnosis,
            treatments_applied: data.treatmentsApplied,
            yield_impact_rating: data.yieldImpactRating,
            harvest_yield: data.harvestYieldBuPerAc,
            notes: data.agronomicNotes,
          }),
        });
        const created: OutcomeFeedback = {
          ...data,
          id: String(raw.id),
          submittedAt: raw.created_at || new Date().toISOString(),
        };
        mockFeedbackStore.unshift(created);
        return created;
      }
    } catch (err) {
      console.warn('Backend outcome feedback recording note:', err);
    }

    const fallback: OutcomeFeedback = {
      ...data,
      id: `fb-${Date.now()}`,
      submittedAt: new Date().toISOString(),
    };
    mockFeedbackStore.unshift(fallback);
    return fallback;
  },
};
