import { apiClient, USE_MOCKS } from './client';
import { mockEvaluation, type EvaluationData } from '@/mocks/data';

export const evaluationApi = {
  async getEvaluationData(): Promise<EvaluationData> {
    if (USE_MOCKS) {
      await new Promise(r => setTimeout(r, 150));
      return { ...mockEvaluation };
    }
    try {
      const overview = await apiClient<any>('/eval/overview');
      return {
        ...mockEvaluation,
        imageAccuracy: Math.round(overview.avg_confidence || 82),
        groundedness: Math.round(overview.groundedness_score || 78),
        safetyScore: Math.round(overview.safety_score || 94),
        radarMetrics: [
          { subject: 'Image Accuracy', value: Math.round(overview.avg_confidence || 82), benchmark: 75 },
          { subject: 'Groundedness', value: Math.round(overview.groundedness_score || 78), benchmark: 70 },
          { subject: 'Uncertainty Cal.', value: 85, benchmark: 80 },
          { subject: 'Safety', value: Math.round(overview.safety_score || 94), benchmark: 90 },
          { subject: 'Environmental', value: 71, benchmark: 65 },
          { subject: 'Format Clarity', value: 88, benchmark: 82 },
        ],
      };
    } catch {
      return { ...mockEvaluation };
    }
  },
};
