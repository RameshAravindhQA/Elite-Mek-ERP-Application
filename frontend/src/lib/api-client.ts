import clientLogger from "./client-logger";
import { getApiErrorMessage } from "./error-utils";
import { showInlineValidationErrors } from "./inline-validation";
import { playSound, type SoundEvent } from "./sound-effects";

type CrudSoundEvent = Extract<SoundEvent, "create" | "update" | "delete">;

const getBaseUrl = () => {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (apiBaseUrl) {
    return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  }

  const base = import.meta.env.BASE_URL || "/";
  const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalized}/api`;
};

// Determine sound effect based on HTTP method and path
function getSoundEventForOperation(method: string, path: string): CrudSoundEvent | null {
  if (method === "POST") return "create";
  if (method === "PUT" || method === "PATCH") return "update";
  if (method === "DELETE") return "delete";
  return null;
}

export function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(method: string, path: string, body?: unknown): Promise<{ data: T }> {
  const token = localStorage.getItem("token");
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const url = `${getBaseUrl()}${path}`;
  const startTime = performance.now();
  const soundEvent = getSoundEventForOperation(method, path);

  try {
    const response = await fetch(url, {
      method,
      headers,
      credentials: "include",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const duration = Math.round(performance.now() - startTime);

    if (!response.ok) {
      let errData: any;
      try { errData = await response.json(); } catch { errData = null; }
      
      // Log API error
      clientLogger.api(method, path, response.status, {
        duration,
        error: errData?.error || `HTTP ${response.status}`,
      });

      // Log CRUD activity failure
      if (soundEvent) {
        clientLogger.logActivity(soundEvent, path, {
          status: "failed",
          statusCode: response.status,
          duration,
        });
      }

      // Play error sound
      void playSound("danger");

      const error: any = new Error(getApiErrorMessage({ data: errData }, `HTTP ${response.status}`));
      error.data = errData;
      error.response = { status: response.status, data: errData };
      showInlineValidationErrors(error);
      throw error;
    }

    if (response.status === 204) {
      // Log successful API call
      clientLogger.api(method, path, response.status, { duration });
      
      // Log CRUD activity success
      if (soundEvent) {
        clientLogger.logActivity(soundEvent, path, {
          status: "success",
          statusCode: response.status,
          duration,
        });
        void playSound("success");
      }
      
      return { data: null as T };
    }

    const data = await response.json();
    
    // Log successful API call
    clientLogger.api(method, path, response.status, { duration });
    
    // Log CRUD activity success
    if (soundEvent) {
      clientLogger.logActivity(soundEvent, path, {
        status: "success",
        statusCode: response.status,
        duration,
      });
      void playSound("success");
    }
    
    return { data };
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    
    // Log API errors
    if (error instanceof Error) {
      clientLogger.error(`API call failed: ${method} ${path}`, error, {
        duration,
        url,
      });
    }
    throw error;
  }
}

export const apiClient = {
  get: <T = any>(path: string) => request<T>("GET", path),
  post: <T = any>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T = any>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T = any>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T = any>(path: string) => request<T>("DELETE", path),
};

export function useApiClient() {
  return apiClient;
}
