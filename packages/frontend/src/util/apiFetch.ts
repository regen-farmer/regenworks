import { apiFetchOptions } from "~/util/apiFetchOptions";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;

  constructor(message: string, response: Response) {
    super(message);
    this.name = "ApiError";
    this.status = response.status;
    this.statusText = response.statusText;
  }
}

async function getErrorMessage(response: Response) {
  const fallback = response.statusText || `Request failed with status ${response.status}`;

  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await response.json();
      const message = body?.error || body?.message || fallback;
      // errorId matches a line in the server logs.
      return body?.errorId ? `${message} (error ${body.errorId})` : message;
    }

    const text = await response.text();
    // Don't show raw HTML error pages to people.
    if (/^\s*</.test(text)) return `Server error (${response.status})`;
    return text || fallback;
  } catch {
    return fallback;
  }
}

function buildUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `${BACKEND_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const defaults = apiFetchOptions();
  const headers = new Headers(defaults.headers);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  const response = await fetch(buildUrl(path), {
    ...defaults,
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new ApiError(await getErrorMessage(response), response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/** A file from the API (e.g. a CSV export), with the same login headers as apiFetch. */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const defaults = apiFetchOptions();
  const response = await fetch(buildUrl(path), { ...defaults, headers: new Headers(defaults.headers) });
  if (!response.ok) throw new ApiError(await getErrorMessage(response), response);
  return response.blob();
}
