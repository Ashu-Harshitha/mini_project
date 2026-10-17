import { getIdToken, fbSignOut, auth } from '@/lib/firebase';
import { useAppStore } from '@/store/useAppStore';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const BASE_URL = import.meta.env.VITE_API_URL || 'https://api.agriadvisor.ai/v1';

export { USE_MOCKS };

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getIdToken();
  const headers = new Headers(options.headers || {});
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      if (auth) {
        await fbSignOut(auth).catch(() => {});
      }
      useAppStore.getState().setUser(null);
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    const errorText = await response.text();
    let detail = errorText || response.statusText;
    try {
      const json = JSON.parse(errorText);
      if (json.detail) detail = json.detail;
    } catch {
      // ignore
    }
    const err = new Error(detail);
    (err as any).status = response.status;
    throw err;
  }

  return response.json();
}
