import { getIdToken, fbSignOut, auth } from '@/lib/firebase';
import { useAppStore } from '@/store/useAppStore';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const BASE_URL = import.meta.env.VITE_API_URL || 'https://api.agriadvisor.ai/v1';

export { USE_MOCKS };

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  let token = await getIdToken();
  const currentUser = useAppStore.getState().user;
  
  // If Firebase token is not yet initialized or in demo role mode, provide fallback token
  if (!token && currentUser) {
    token = `demo-${currentUser.username || currentUser.role}`;
  }

  const headers = new Headers(options.headers || {});
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (currentUser?.role) {
    headers.set('X-Demo-Role', currentUser.role);
    headers.set('X-User-Role', currentUser.role);
  }

  let response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // If 401 Unauthorized, try refreshing the token once before failing
  if (response.status === 401 && auth && auth.currentUser) {
    try {
      const freshToken = await getIdToken(true);
      if (freshToken) {
        headers.set('Authorization', `Bearer ${freshToken}`);
        response = await fetch(`${BASE_URL}${endpoint}`, {
          ...options,
          headers,
        });
      }
    } catch {
      // Refresh failed, proceed to error handling
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    let detail = errorText || response.statusText;
    try {
      const json = JSON.parse(errorText);
      if (json.detail) {
        if (Array.isArray(json.detail)) {
          detail = json.detail
            .map((d: any) => (d && typeof d === 'object' ? d.msg || d.message || JSON.stringify(d) : String(d)))
            .join('; ');
        } else if (typeof json.detail === 'object') {
          detail = json.detail.message || json.detail.msg || json.detail.detail || JSON.stringify(json.detail);
        } else {
          detail = String(json.detail);
        }
      } else if (json.message) {
        detail = String(json.message);
      }
    } catch {
      // ignore
    }
    const err = new Error(String(detail));
    (err as any).status = response.status;
    throw err;
  }

  return response.json();
}
