import { apiClient } from './client';
import { mockCases, type CaseItem } from '@/mocks/data';

export interface MessageItem {
  id: number;
  case_id: number;
  sender_id: number;
  sender_name?: string;
  sender_role: 'farmer' | 'agronomist' | 'admin';
  kind: 'text' | 'voice' | 'decision' | 'feedback';
  original_lang: string;
  original_text: string;
  text: string;
  translated: boolean;
  audio_url?: string | null;
  transcript_status: 'none' | 'pending' | 'done' | 'failed';
  created_at: string;
}

export interface CaseOutcomeFeedback {
  id: number;
  rating: number;
  comment?: string | null;
  comment_lang?: string | null;
  comment_translated?: string | null;
  audio_url?: string | null;
  created_at: string;
}

function mapStatus(rawStatus: string): CaseItem['status'] {
  const s = (rawStatus || '').toUpperCase();
  if (['APPROVED', 'APPROVED_WITH_EDITS', 'DELIVERED', 'OUTCOME_REPORTED', 'RESOLVED'].includes(s)) {
    return 'Resolved';
  }
  if (['PENDING_REVIEW', 'REVIEW', 'SUBMITTED', 'IN_REVIEW'].includes(s)) {
    return 'Review';
  }
  if (['BLOCKED', 'REJECTED', 'FLAGGED'].includes(s)) {
    return 'Flagged';
  }
  if (['DRAFT', 'ANALYZING', 'ANALYZED'].includes(s)) {
    return 'Draft';
  }
  return 'Review';
}

export function mapBackendCaseToCaseItem(raw: any): CaseItem {
  const base = mockCases[0];

  const observations = raw.observations && raw.observations.length > 0
    ? raw.observations.map((o: any) => ({
        description: o.description,
        confidence: Math.round(o.confidence ?? 85),
        uncertainty: o.uncertainty || 'Medium',
        note: o.note || '',
      }))
    : base.observations;

  let soil = base.soil;
  if (raw.soil_results && raw.soil_results.length > 0) {
    const s = raw.soil_results[0];
    soil = {
      nitrogen: {
        value: s.n_value || '18 ppm NO3-N',
        status: (s.n_status as any) || 'Marginal',
        citation: s.n_citation || 'Extension Protocol',
      },
      ph: {
        value: s.ph_value || 'pH 6.2',
        status: (s.ph_status as any) || 'Optimal',
        citation: s.ph_citation || 'Extension Protocol',
      },
      pk: {
        value: s.pk_value || 'P & K Sufficient',
        status: (s.pk_status as any) || 'Adequate',
        citation: 'Extension Protocol',
      },
    };
  }

  let weather = base.weather;
  if (raw.weather_snapshots && raw.weather_snapshots.length > 0) {
    const w = raw.weather_snapshots[0];
    weather = {
      tempMaxC: w.temp_max_c ?? 28,
      tempMinC: w.temp_min_c ?? 16,
      rainfall7dMm: w.precip_7d_mm ?? 12,
      humidity: w.humidity_pct ?? 65,
      windKmh: w.wind_speed_kmh ?? 15,
      uvIndex: 6,
      rainfallStatus: (w.precip_7d_mm ?? 0) < 10 ? 'Below Average' : 'Optimal',
      tempStatus: 'Optimal',
      soilMoistureProxy: { uncertainty: 'Medium', note: 'Based on recent rainfall and soil type' },
    };
  }

  // Recommendations: if raw.recommendations is array of objects
  const recommendations = raw.recommendations && raw.recommendations.length > 0
    ? raw.recommendations.map((r: any, idx: number) => {
        if (typeof r === 'string') {
          return {
            id: `rec-${idx}`,
            category: 'Crop' as const,
            title: r,
            confidence: 90,
            uncertainty: 'Low' as const,
            evidence: '',
            assumptions: '',
          };
        }
        return {
          id: String(r.id || idx),
          category: (r.category || 'Crop') as any,
          title: r.action || r.title || 'Agronomic Recommendation',
          confidence: Math.round(r.confidence ?? 85),
          uncertainty: (r.uncertainty || 'Low') as any,
          evidence: r.citation || r.evidence || '',
          assumptions: r.rationale || r.assumptions || '',
          whyLine: r.tradeoffs || '',
          citation: r.citation || '',
          chunk_ids: r.chunk_ids || [],
        };
      })
    : base.recommendations;

  const agronomistReview = raw.agronomistReview || (raw.decision_note ? {
    reviewerName: raw.assigned_agronomist_name || 'Assigned Agronomist',
    title: 'Senior Agronomist',
    organization: 'Agricultural Extension',
    status: raw.status === 'REJECTED' ? ('Rejected' as const) : ('Approved' as const),
    notes: raw.decision_note,
    timestamp: raw.assigned_at || raw.created_at,
  } : undefined);

  const farmerReport = raw.farmer_summary ? {
    headline: `Field Action Plan: ${raw.crop || 'Crop'} Recovery`,
    description: raw.farmer_summary,
    steps: Array.isArray(raw.recommendations) && typeof raw.recommendations[0] === 'string'
      ? raw.recommendations.map((step: string, i: number) => ({
          number: i + 1,
          title: `Step ${i + 1}`,
          instruction: step,
        }))
      : base.farmerReport?.steps || [],
    warnings: [],
    confidenceExplanation: 'Reviewed and confirmed by certified agronomist.',
  } : base.farmerReport;

  const mapped: CaseItem & { [key: string]: any } = {
    id: String(raw.id),
    caseNumber: raw.case_number || `C-${raw.id}`,
    farmId: String(raw.farm_id || 1),
    farmName: raw.farm?.name || raw.farm_name || 'My Farm',
    fieldName: raw.field?.name || raw.field_name || 'Field 1',
    crop: raw.crop || 'Crop',
    issue: raw.description || raw.notes || raw.issue || 'Field Inquiry',
    growthStage: raw.growth_stage || 'Active Growth',
    confidence: Math.round(raw.confidence ?? 88),
    uncertainty: raw.uncertainty || 'Medium',
    status: mapStatus(raw.status),
    rawStatus: raw.status,
    time: raw.created_at ? new Date(raw.created_at).toLocaleDateString() : 'Recent',
    createdAt: raw.created_at || new Date().toISOString(),
    operator: raw.farmer_name || raw.operator || 'Farmer',
    assignedAgronomist: raw.assigned_agronomist_name || raw.assigned_agronomist?.full_name || raw.assignedAgronomist,
    summary: raw.farmer_summary || raw.description || raw.notes || '',
    audioUrl: raw.audio_url,
    observations,
    soil,
    weather,
    recommendations,
    risks: base.risks,
    agronomistReview,
    farmerReport,
    // Role-specific fields
    description: raw.description,
    description_lang: raw.description_lang,
    assigned_agronomist_id: raw.assigned_agronomist_id,
    assigned_agronomist_name: raw.assigned_agronomist_name,
    assigned_at: raw.assigned_at,
    farmer_summary: raw.farmer_summary,
    final_suggestion: raw.final_suggestion,
    decision_note: raw.decision_note,
    rawRecommendations: raw.recommendations,
    rawObservations: raw.observations,
    ai_degraded: Boolean(raw.ai_degraded),
  };

  return mapped;
}

export const casesApi = {
  async getCases(params?: { farmId?: string; status?: string }): Promise<CaseItem[]> {
    const query = new URLSearchParams();
    if (params?.farmId) query.set('farm_id', params.farmId);
    if (params?.status && params.status !== 'All') query.set('status', params.status);
    const qs = query.toString();
    try {
      const rawList = await apiClient<any[]>(`/cases${qs ? `?${qs}` : ''}`);
      if (Array.isArray(rawList)) {
        return rawList.map(mapBackendCaseToCaseItem);
      }
      return [];
    } catch (err) {
      console.warn('Failed to fetch cases from backend, falling back to mock:', err);
      return mockCases;
    }
  },

  async getCaseById(id: string): Promise<CaseItem> {
    try {
      const raw = await apiClient<any>(`/cases/${id}`);
      return mapBackendCaseToCaseItem(raw);
    } catch (err) {
      console.warn('Failed to fetch case detail from backend, falling back to mock:', err);
      const found = mockCases.find(c => c.id === id || c.caseNumber.toLowerCase() === id.toLowerCase());
      return found || mockCases[0];
    }
  },

  async createCase(caseData: {
    farmId?: string | number;
    fieldId?: string | number;
    crop?: string;
    growthStage?: string;
    notes?: string;
  }): Promise<CaseItem> {
    let farm_id = 1;
    let field_id = 1;

    if (caseData.farmId !== undefined && caseData.farmId !== null) {
      const digits = String(caseData.farmId).replace(/\D/g, '');
      const parsed = parseInt(digits, 10);
      if (!isNaN(parsed) && parsed > 0) farm_id = parsed;
    }
    if (caseData.fieldId !== undefined && caseData.fieldId !== null) {
      const digits = String(caseData.fieldId).replace(/\D/g, '');
      const parsed = parseInt(digits, 10);
      if (!isNaN(parsed) && parsed > 0) field_id = parsed;
    }

    const payload = {
      farm_id,
      field_id,
      crop: caseData.crop || 'Dent Corn',
      growth_stage: caseData.growthStage || 'Vegetative',
      notes: caseData.notes || 'Crop visual evaluation',
    };
    const created = await apiClient<any>('/cases', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return mapBackendCaseToCaseItem(created);
  },

  async submitFarmerCase(
    caseId: string | number,
    data: {
      description: string;
      language?: string;
      image?: File | null;
      soilPdf?: File | null;
    }
  ): Promise<CaseItem> {
    if (data.image) {
      try {
        await this.uploadCaseFile(String(caseId), data.image, 'crop_image');
      } catch (uploadErr) {
        console.warn('Crop image upload warning:', uploadErr);
      }
    }
    if (data.soilPdf) {
      try {
        await this.uploadCaseFile(String(caseId), data.soilPdf, 'soil_report');
      } catch (uploadErr) {
        console.warn('Soil report upload warning:', uploadErr);
      }
    }

    const payload = {
      description: data.description,
      description_lang: data.language || 'en',
    };
    const result = await apiClient<any>(`/cases/${caseId}/submit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return mapBackendCaseToCaseItem(result);
  },

  async uploadCaseFile(caseId: string, file: File, fileType = 'crop_image'): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', fileType);
    return apiClient<any>(`/cases/${caseId}/files`, {
      method: 'POST',
      body: formData,
    });
  },

  async fetchWeather(caseId: string): Promise<any> {
    return apiClient<any>(`/cases/${caseId}/weather`, { method: 'POST' });
  },

  async analyzeCase(caseId: string): Promise<any> {
    return apiClient<any>(`/cases/${caseId}/analyze`, { method: 'POST' });
  },

  async generateRecommendations(caseId: string): Promise<any> {
    return apiClient<any>(`/cases/${caseId}/recommend`, { method: 'POST' });
  },

  async runRiskCheck(caseId: string): Promise<any> {
    return apiClient<any>(`/cases/${caseId}/risk-check`, { method: 'POST' });
  },

  async getReviewQueue(): Promise<CaseItem[]> {
    try {
      const rawList = await apiClient<any[]>('/review/queue');
      if (Array.isArray(rawList)) {
        return rawList.map(mapBackendCaseToCaseItem);
      }
      return [];
    } catch {
      return mockCases.filter(c => c.status === 'Review' || c.status === 'Flagged');
    }
  },

  async submitReview(
    caseId: string | number,
    review: {
      decision?: 'approve' | 'approve_with_edits' | 'reject';
      status?: 'Approved' | 'Approved with Edits' | 'Rejected';
      notes?: string;
      note?: string;
      edits?: {
        recommendations?: Array<{ id: number; action: string }>;
        final_suggestion?: string;
      };
    }
  ): Promise<any> {
    let decision = review.decision;
    if (!decision && review.status) {
      if (review.status === 'Approved') decision = 'approve';
      else if (review.status === 'Approved with Edits') decision = 'approve_with_edits';
      else if (review.status === 'Rejected') decision = 'reject';
    }

    const payload = {
      decision: decision || 'approve',
      note: review.note || review.notes || '',
      edits: review.edits,
    };

    const res = await apiClient<any>(`/cases/${caseId}/review`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return res;
  },

  async getMessages(caseId: string | number): Promise<MessageItem[]> {
    return apiClient<MessageItem[]>(`/cases/${caseId}/messages`);
  },

  async sendMessage(
    caseId: string | number,
    data: {
      text?: string;
      language?: string;
      audio?: Blob | File;
    }
  ): Promise<MessageItem> {
    const formData = new FormData();
    if (data.text) formData.append('text', data.text);
    if (data.language) formData.append('language', data.language);
    if (data.audio) {
      const file = data.audio instanceof File
        ? data.audio
        : new File([data.audio], 'voice_note.webm', { type: data.audio.type || 'audio/webm' });
      formData.append('audio', file);
    }

    return apiClient<MessageItem>(`/cases/${caseId}/messages`, {
      method: 'POST',
      body: formData,
    });
  },

  getVoiceUrl(messageId: number | string): string {
    const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/v1';
    return `${BASE_URL}/media/voice/${messageId}`;
  },

  async submitFeedback(
    caseId: string | number,
    data: {
      rating: number;
      comment?: string;
      language?: string;
      audio?: Blob | File;
    }
  ): Promise<CaseOutcomeFeedback> {
    const formData = new FormData();
    formData.append('rating', String(data.rating));
    if (data.comment) formData.append('comment', data.comment);
    if (data.language) formData.append('language', data.language);
    if (data.audio) {
      const file = data.audio instanceof File
        ? data.audio
        : new File([data.audio], 'feedback_voice.webm', { type: data.audio.type || 'audio/webm' });
      formData.append('audio', file);
    }

    return apiClient<CaseOutcomeFeedback>(`/cases/${caseId}/feedback`, {
      method: 'POST',
      body: formData,
    });
  },

  async generateReport(caseId: string, lang = 'en'): Promise<any> {
    return apiClient<any>(`/cases/${caseId}/report?lang=${lang}`, {
      method: 'POST',
    });
  },

  async submitOutcome(
    caseId: string,
    feedback: {
      actualDiagnosis: string;
      treatmentsApplied: string[];
      yieldImpactRating: number;
      harvestYield?: number;
      notes?: string;
    }
  ): Promise<any> {
    return apiClient<any>(`/cases/${caseId}/outcome`, {
      method: 'POST',
      body: JSON.stringify({
        actual_diagnosis: feedback.actualDiagnosis,
        treatments_applied: feedback.treatmentsApplied,
        yield_impact_rating: feedback.yieldImpactRating,
        harvest_yield: feedback.harvestYield,
        notes: feedback.notes,
      }),
    });
  },

  // Field Location and Weather API
  async updateFieldLocation(
    fieldId: string | number,
    data: { lat: number; lng: number; accuracy_m?: number; source?: string }
  ): Promise<any> {
    const digits = String(fieldId).replace(/\D/g, '');
    const cleanId = digits ? parseInt(digits, 10) : 1;
    return apiClient<any>(`/fields/${cleanId}/location`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async geocode(query: string): Promise<Array<{
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    admin1?: string;
    display_name?: string;
  }>> {
    return apiClient<any[]>(`/geocode?q=${encodeURIComponent(query)}`);
  },

  async getFieldWeather(fieldId: string | number): Promise<any> {
    const digits = String(fieldId).replace(/\D/g, '');
    const cleanId = digits ? parseInt(digits, 10) : 1;
    return apiClient<any>(`/fields/${cleanId}/weather`);
  },

  // Sensor Report Upload, Summary and Details
  async uploadSensorReport(caseId: string | number, file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient<any>(`/cases/${caseId}/sensor-report`, {
      method: 'POST',
      body: formData,
    });
  },

  async updateSensorSummary(
    caseId: string | number,
    values: {
      soil_moisture_pct?: number | null;
      n_mgkg?: number | null;
      p_mgkg?: number | null;
      k_mgkg?: number | null;
      temp_c?: number | null;
      humidity_pct?: number | null;
      ph?: number | null;
      leaf_wetness_pct?: number | null;
    }
  ): Promise<any> {
    return apiClient<any>(`/cases/${caseId}/sensor-summary`, {
      method: 'PATCH',
      body: JSON.stringify(values),
    });
  },

  async getCaseSensors(caseId: string | number): Promise<any> {
    return apiClient<any>(`/cases/${caseId}/sensor`);
  },

  getSensorSampleUrl(scenario = 'healthy'): string {
    const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/v1';
    return `${BASE_URL}/sensor-report/sample?scenario=${encodeURIComponent(scenario)}`;
  },

  getSensorReportFileUrl(caseId: string | number): string {
    const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/v1';
    return `${BASE_URL}/cases/${caseId}/sensor-report/file`;
  },
};

