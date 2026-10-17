import { apiClient, USE_MOCKS } from './client';
import { mockFarms, type Farm } from '@/mocks/data';

function mapFarmFromBackend(raw: any): Farm {
  return {
    id: String(raw.id),
    name: raw.name,
    operator: raw.operator_name || raw.operator || 'James Donovan',
    location: raw.location,
    totalAcreage: raw.total_acreage ?? raw.totalAcreage ?? 0,
    primaryCrops: raw.primary_crops || raw.primaryCrops || ['Corn'],
    irrigationSystem: raw.irrigation_system || raw.irrigationSystem || 'Center pivot',
    fields: (raw.fields || []).map((f: any) => ({
      id: String(f.id),
      name: f.name,
      acreage: f.acreage,
      soilType: f.soil_type || f.soilType || 'Silty clay loam',
      currentCrop: f.current_crop || f.currentCrop || 'Dent Corn',
      cropVariety: f.crop_variety || f.cropVariety,
      lastFertilizer: f.last_fertilizer || f.lastFertilizer,
    })),
  };
}

export const farmsApi = {
  async getFarms(): Promise<Farm[]> {
    if (USE_MOCKS) {
      return [...mockFarms];
    }
    const rawList = await apiClient<any[]>('/farms');
    return rawList.map(mapFarmFromBackend);
  },

  async getFarmById(id: string): Promise<Farm | undefined> {
    if (USE_MOCKS) {
      return mockFarms.find(f => f.id === id) || mockFarms[0];
    }
    const raw = await apiClient<any>(`/farms/${id}`);
    return mapFarmFromBackend(raw);
  },

  async createFarm(data: {
    name: string;
    operator_name: string;
    location: string;
    total_acreage?: number;
    latitude?: number;
    longitude?: number;
    primary_crops?: string[];
    is_organic?: boolean;
  }): Promise<Farm> {
    const raw = await apiClient<any>('/farms', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return mapFarmFromBackend(raw);
  },

  async createField(
    farmId: string | number,
    data: {
      name: string;
      acreage: number;
      soil_type?: string;
      current_crop?: string;
    }
  ): Promise<any> {
    return apiClient<any>(`/farms/${farmId}/fields`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateFarm(id: string, updates: Partial<Farm>): Promise<Farm> {
    if (USE_MOCKS) {
      const idx = mockFarms.findIndex(f => f.id === id);
      if (idx !== -1) {
        mockFarms[idx] = { ...mockFarms[idx], ...updates };
        return mockFarms[idx];
      }
      return mockFarms[0];
    }
    const body: any = {};
    if (updates.name !== undefined) body.name = updates.name;
    if (updates.operator !== undefined) body.operator_name = updates.operator;
    if (updates.location !== undefined) body.location = updates.location;
    if (updates.totalAcreage !== undefined) body.total_acreage = updates.totalAcreage;
    if (updates.primaryCrops !== undefined) body.primary_crops = updates.primaryCrops;
    if (updates.irrigationSystem !== undefined) body.irrigation_system = updates.irrigationSystem;

    const raw = await apiClient<any>(`/farms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return mapFarmFromBackend(raw);
  },

  async addField(farmId: string, field: Farm['fields'][0]): Promise<Farm> {
    if (USE_MOCKS) {
      const farm = mockFarms.find(f => f.id === farmId) || mockFarms[0];
      farm.fields.push(field);
      return { ...farm };
    }
    const payload = {
      name: field.name,
      acreage: field.acreage,
      soil_type: field.soilType,
      current_crop: field.currentCrop,
      crop_variety: field.cropVariety,
      last_fertilizer: field.lastFertilizer,
    };
    await apiClient<any>(`/farms/${farmId}/fields`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const updatedFarm = await farmsApi.getFarmById(farmId);
    return updatedFarm || mockFarms[0];
  },
};
