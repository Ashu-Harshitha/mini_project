import { apiClient, USE_MOCKS } from './client';
import { mockRagData, type RagItem } from '@/mocks/data';

export interface RagChunkDetail {
  chunk_id: string;
  id?: string;
  text: string;
  source: string;
  citation?: string;
  page: number;
  title: string;
  year?: number;
  authors?: string;
  publisher?: string;
  source_type?: string;
}

export interface RagDocumentItem {
  id: number;
  filename: string;
  title: string;
  source_type: string;
  year?: number;
  authors?: string;
  publisher?: string;
  chunk_count: number;
  file_path?: string;
  created_at?: string;
  updated_at?: string;
}

export const ragApi = {
  async getRagStats() {
    if (USE_MOCKS) {
      return { ...mockRagData.stats };
    }
    return apiClient<typeof mockRagData.stats>('/rag/stats');
  },

  async searchRag(query: string, sourceFilter?: string, topK: number = 4): Promise<RagItem[]> {
    if (USE_MOCKS) {
      await new Promise(r => setTimeout(r, 300));
      let results = [...mockRagData.documents];
      if (sourceFilter && sourceFilter !== 'All') {
        results = results.filter(d => d.type === sourceFilter);
      }
      return results.slice(0, topK);
    }
    const params = new URLSearchParams({ q: query, k: topK.toString() });
    if (sourceFilter && sourceFilter !== 'All') {
      params.append('source_type', sourceFilter);
    }
    return apiClient<RagItem[]>(`/rag/search?${params.toString()}`);
  },

  async getChunk(chunkId: string): Promise<RagChunkDetail> {
    if (USE_MOCKS) {
      return {
        chunk_id: chunkId,
        id: chunkId,
        text: "Soil nitrate levels below 20 ppm NO3-N at V8 stage indicate high likelihood of positive yield response to in-season supplemental nitrogen application.",
        source: "ISU Extension PM 1688",
        citation: "ISU Extension PM 1688",
        page: 12,
        title: "Corn Nitrogen Management & Deficiency Diagnosis",
        year: 2021,
        authors: "Sawyer, J.E.",
        publisher: "Iowa State University Extension",
        source_type: "extension_guide",
      };
    }
    return apiClient<RagChunkDetail>(`/rag/chunks/${chunkId}`);
  },

  async getDocuments(): Promise<RagDocumentItem[]> {
    if (USE_MOCKS) {
      return [];
    }
    return apiClient<RagDocumentItem[]>('/rag/documents');
  },

  async uploadDocument(formData: FormData): Promise<{ message: string; filename: string }> {
    return apiClient<{ message: string; filename: string }>('/rag/documents', {
      method: 'POST',
      body: formData,
    });
  },
};
