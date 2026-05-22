import type {
  NearbyContractor,
  PublicContractorProfile,
  JobDetail,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

let _token: string | null = null;

export function setClientToken(token: string) {
  _token = token;
  if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(new CustomEvent("knect-token-changed", { detail: token }));
  }
}

async function doFetch(
  path: string,
  token: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
}

async function ensureToken(): Promise<string> {
  if (_token) return _token;
  const res = await fetch("/api/session");
  const data = await res.json();
  _token = data.access_token;
  return _token!;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await ensureToken();
  let res = await doFetch(path, token, init);

  if (res.status === 401) {
    const refreshRes = await fetch("/api/refresh", { method: "POST" });
    if (!refreshRes.ok) {
      window.location.href = "/login";
      throw new Error("Session expired");
    }
    const { access_token } = await refreshRes.json();
    setClientToken(access_token);
    res = await doFetch(path, access_token, init);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  // 204 No Content
  const contentLength = res.headers.get("content-length");
  if (res.status === 204 || contentLength === "0") {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const api = {
  nearbyContractors: (lat: number, lng: number, radius = 5000) =>
    apiFetch<NearbyContractor[]>(
      `/contractors/nearby?lat=${lat}&lng=${lng}&radius=${radius}`
    ),
  contractorProfile: (id: string) =>
    apiFetch<PublicContractorProfile>(`/contractors/${id}`),
  createJob: (body: {
    contractor_id: string;
    description: string;
    location_lat: number;
    location_lng: number;
    location_address?: string;
  }) =>
    apiFetch<{ id: string }>("/jobs", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getJob: (id: string) => apiFetch<JobDetail>(`/jobs/${id}`),
  cancelJob: (id: string) =>
    apiFetch<void>(`/jobs/${id}`, { method: "DELETE" }),
  submitRating: (jobId: string, score: number, review_text?: string) =>
    apiFetch<void>(`/jobs/${jobId}/rating`, {
      method: "POST",
      body: JSON.stringify({ score, review_text }),
    }),
};
