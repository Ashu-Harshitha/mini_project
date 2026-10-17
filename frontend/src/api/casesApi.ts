import { apiClient, USE_MOCKS } from './client';
import { mockCases, type CaseItem } from '@/mocks/data';

function mapStatus(rawStatus: string): CaseItem['status'] {
  const s = rawStatus.toUpperCase();
  if (['APPROVED', 'APPROVED_WITH_EDITS', 'DELIVERED', 'OUTCOME_REPORTED', 'RESOLVED'].includes(s)) {
    return 'Resolved';
  }
  if (['PENDING_REVIEW', 'REVIEW'].includes(s)) {
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
        confidence: Math.round(o.confidence),
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
        citation: s.n_citation || 'ISU Ext. PM 1714',
      },
      ph: {
        value: s.ph_value || 'pH 6.2',
        status: (s.ph_status as any) || 'Optimal',
        citation: s.ph_citation || 'ISU Ext. PM 1688',
      },
      pk: {
        value: s.pk_value || 'P & K Sufficient',
        status: (s.pk_status as any) || 'Adequate',
        citation: 'ISU Ext.',
      },
    };
  }

  let weather = base.weather;
  if (raw.weather_snapshots && raw.weather_snapshots.length > 0) {
    const w = raw.weather_snapshots[0];
    weather = {
      tempMaxC: w.temp_max_c,
      tempMinC: w.temp_min_c,
      rainfall7dMm: w.rainfall_7d_mm,
      humidity: w.humidity,
      windKmh: w.wind_kmh,
      uvIndex: w.uv_index,
      rainfallStatus: (w.rainfall_status as any) || 'Below Average',
      tempStatus: (w.temp_status as any) || 'Optimal',
      soilMoistureProxy: { uncertainty: 'High', note: 'Estimated from rainfall' },
    };
  }

  const recommendations = raw.recommendations && raw.recommendations.length > 0
    ? raw.recommendations.map((r: any) => ({
        id: String(r.id),
        category: (r.category as any) || 'Fertilizer',
        title: r.title,
        confidence: Math.round(r.confidence),
        uncertainty: (r.uncertainty as any) || 'Medium',
        evidence: r.evidence || '',
        assumptions: r.assumptions || '',
        whyLine: r.why_line || r.whyLine || undefined,
      }))
    : base.recommendations;

  let agronomistReview = base.agronomistReview;
  if (raw.reviews && raw.reviews.length > 0) {
    const rv = raw.reviews[raw.reviews.length - 1];
    let revStatus: any = 'Awaiting Review';
    if (rv.status.includes('APPROV') && rv.status.includes('EDIT')) revStatus = 'Approved with Edits';
    else if (rv.status.includes('APPROV')) revStatus = 'Approved';
    else if (rv.status.includes('REJECT')) revStatus = 'Rejected';

    agronomistReview = {
      reviewerName: 'Dr. Sarah Chen',
      title: 'Senior Agronomist',
      organization: 'Iowa State Extension',
      status: revStatus,
      notes: rv.notes || '',
      timestamp: rv.created_at,
    };
  }

  let farmerReport = base.farmerReport;
  let audioUrl = raw.audio_url || base.audioUrl;
  if (raw.reports && raw.reports.length > 0) {
    const rp = raw.reports[raw.reports.length - 1];
    farmerReport = {
      headline: rp.headline,
      description: rp.description,
      steps: rp.steps || base.farmerReport?.steps || [],
      warnings: rp.warnings || base.farmerReport?.warnings || [],
      confidenceExplanation: rp.confidence_explanation || '',
      audioUrl: rp.audio_url,
    };
    if (rp.audio_url) {
      audioUrl = rp.audio_url;
    }
  }

  const risks = { ...base.risks };
  if (raw.guardrail_results && raw.guardrail_results.length > 0) {
    risks.unsafeFlags = raw.guardrail_results.map((gr: any) => ({
      title: gr.rule_name,
      type: gr.status === 'PASSED' ? 'safe' : 'warning',
      message: gr.details || gr.status,
    }));
  }

  return {
    id: String(raw.id),
    caseNumber: raw.case_number || `C-${raw.id}`,
    farmId: raw.farm ? String(raw.farm.id) : String(raw.farm_id || '1'),
    farmName: raw.farm?.name || 'Westfield Farm',
    fieldName: raw.field?.name || 'North 40 — Block C',
    crop: raw.crop || 'Dent Corn',
    issue: raw.summary || 'Lower leaf interveinal chlorosis at V8 stage.',
    growthStage: raw.growth_stage || 'V8 (8-leaf)',
    confidence: Math.round(raw.confidence || 72),
    uncertainty: (raw.uncertainty as any) || 'Medium',
    status: mapStatus(raw.status || 'DRAFT'),
    time: raw.created_at ? new Date(raw.created_at).toLocaleDateString() : 'Just now',
    createdAt: raw.created_at || new Date().toISOString(),
    operator: raw.farm?.operator_name || 'James Donovan',
    summary: raw.summary || 'Field sample inquiry',
    audioUrl,
    observations,
    soil,
    weather,
    recommendations,
    risks,
    agronomistReview,
    farmerReport,
  };
}

export const casesApi = {
  async getCases(params?: { farmId?: string; status?: string }): Promise<CaseItem[]> {
    if (USE_MOCKS) {
      await new Promise(r => setTimeout(r, 200));
      let results = [...mockCases];
      if (params?.farmId) {
        results = results.filter(c => c.farmId === params.farmId);
      }
      if (params?.status && params.status !== 'All') {
        results = results.filter(c => c.status === params.status);
      }
      return results;
    }
    const query = new URLSearchParams();
    if (params?.farmId) query.set('farm_id', params.farmId);
    if (params?.status && params.status !== 'All') query.set('status', params.status);
    const qs = query.toString();
    const rawList = await apiClient<any[]>(`/cases${qs ? `?${qs}` : ''}`);
    return rawList.map(mapBackendCaseToCaseItem);
  },

  async getCaseById(id: string): Promise<CaseItem> {
    if (USE_MOCKS) {
      await new Promise(r => setTimeout(r, 150));
      const found = mockCases.find(c => c.id === id || c.caseNumber.toLowerCase() === id.toLowerCase());
      if (found) return found;
      return mockCases[0];
    }
    const raw = await apiClient<any>(`/cases/${id}`);
    return mapBackendCaseToCaseItem(raw);
  },

  async createCase(caseData: {
    farmId?: string;
    fieldId?: string;
    crop?: string;
    growthStage?: string;
    notes?: string;
  }): Promise<CaseItem> {
    if (USE_MOCKS) {
      await new Promise(r => setTimeout(r, 300));
      const newCase: CaseItem = {
        ...mockCases[0],
        id: `c-${Date.now().toString().slice(-4)}`,
        caseNumber: `C-${Math.floor(2800 + Math.random() * 200)}`,
        time: 'Just now',
        createdAt: new Date().toISOString(),
      };
      mockCases.unshift(newCase);
      return newCase;
    }
    const payload = {
      farm_id: Number(caseData.farmId || 1),
      field_id: Number(caseData.fieldId || 1),
      crop: caseData.crop || 'Dent Corn',
      growth_stage: caseData.growthStage || 'V8 (8-leaf)',
      notes: caseData.notes || 'Field visual inquiry',
    };
    const created = await apiClient<any>('/cases', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return mapBackendCaseToCaseItem(created);
  },

  async uploadCaseFile(caseId: string, file: File, fileType = 'crop_image'): Promise<any> {
    if (USE_MOCKS) return { id: 1, file_name: file.name };
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', fileType);
    return apiClient<any>(`/cases/${caseId}/files`, {
      method: 'POST',
      body: formData,
    });
  },

  async fetchWeather(caseId: string): Promise<any> {
    if (USE_MOCKS) return mockCases[0].weather;
    return apiClient<any>(`/cases/${caseId}/weather`, { method: 'POST' });
  },

  async analyzeCase(caseId: string): Promise<any> {
    if (USE_MOCKS) return mockCases[0].observations;
    return apiClient<any>(`/cases/${caseId}/analyze`, { method: 'POST' });
  },

  async generateRecommendations(caseId: string): Promise<any> {
    if (USE_MOCKS) return mockCases[0].recommendations;
    return apiClient<any>(`/cases/${caseId}/recommend`, { method: 'POST' });
  },

  async runRiskCheck(caseId: string): Promise<any> {
    if (USE_MOCKS) return { is_blocked: false };
    return apiClient<any>(`/cases/${caseId}/risk-check`, { method: 'POST' });
  },

  async getReviewQueue(): Promise<CaseItem[]> {
    if (USE_MOCKS) {
      return mockCases.filter(c => c.status === 'Review' || c.status === 'Flagged');
    }
    const rawList = await apiClient<any[]>('/review/queue');
    return rawList.map(mapBackendCaseToCaseItem);
  },

  async submitReview(
    caseId: string,
    review: {
      status: 'Approved' | 'Approved with Edits' | 'Rejected';
      notes: string;
      reviewerName?: string;
    }
  ): Promise<CaseItem> {
    if (USE_MOCKS) {
      await new Promise(r => setTimeout(r, 250));
      const found = mockCases.find(c => c.id === caseId);
      if (found) {
        found.agronomistReview = {
          reviewerName: review.reviewerName || 'Dr. Sarah Chen',
          title: 'Senior Agronomist',
          organization: 'Iowa State Extension',
          status: review.status,
          notes: review.notes,
          timestamp: new Date().toISOString(),
        };
        found.status = review.status === 'Rejected' ? 'Flagged' : 'Resolved';
        return found;
      }
      return mockCases[0];
    }

    const statusMap: Record<string, string> = {
      'Approved': 'approve',
      'Approved with Edits': 'approve_with_edits',
      'Rejected': 'reject',
    };
    const targetStatus = statusMap[review.status] || 'approve';

    await apiClient<any>(`/cases/${caseId}/review`, {
      method: 'POST',
      body: JSON.stringify({
        status: targetStatus,
        notes: review.notes,
      }),
    });

    return casesApi.getCaseById(caseId);
  },

  async generateReport(caseId: string, lang = 'en'): Promise<any> {
    if (USE_MOCKS) return mockCases[0].farmerReport;
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
    if (USE_MOCKS) return { id: 1 };
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
};
