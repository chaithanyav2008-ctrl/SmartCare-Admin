let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMessage =
      typeof data?.error === "string" ? data.error : `Request failed (${res.status})`;
    const error = new Error(errorMessage) as Error & {
      status?: number;
      needsActivation?: boolean;
      needsFirstRunSetup?: boolean;
    };
    error.status = res.status;
    error.needsActivation = Boolean(data?.needsActivation);
    error.needsFirstRunSetup = Boolean(data?.needsFirstRunSetup);
    throw error;
  }
  return data as T;
}
