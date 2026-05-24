import * as SecureStore from 'expo-secure-store';
import { SECURE_STORE_KEYS } from '@/lib/constants';
import type { AuthTokens, ContractorProfile, JobQueueItem, JobDetail } from '@/lib/types';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

let _accessToken: string | null = null;
let _refreshToken: string | null = null;
let _onUnauthorized: (() => void) | null = null;

export function setAuthState(
  accessToken: string | null,
  refreshToken: string | null,
  onUnauthorized: () => void,
): void {
  _accessToken = accessToken;
  _refreshToken = refreshToken;
  _onUnauthorized = onUnauthorized;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && retry && _refreshToken) {
    const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: _refreshToken }),
    });
    if (refreshRes.ok) {
      const tokens: AuthTokens = await refreshRes.json();
      _accessToken = tokens.access_token;
      _refreshToken = tokens.refresh_token;
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, tokens.access_token);
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, tokens.refresh_token);
      return apiFetch<T>(path, options, false);
    } else {
      _onUnauthorized?.();
      throw new ApiError('unauthorized', 401, 'Session expired');
    }
  }

  if (!res.ok) {
    let code = 'unknown_error';
    let message = 'An error occurred';
    try {
      const body = await res.json();
      code = body.error ?? code;
      message = body.message ?? message;
    } catch {}
    throw new ApiError(code, res.status, message);
  }

  const contentLength = res.headers.get('content-length');
  if (res.status === 204 || contentLength === '0') return undefined as T;
  return res.json();
}

// Auth
export function login(email: string, password: string): Promise<AuthTokens> {
  return apiFetch<AuthTokens>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// Contractor profile
export function getProfile(): Promise<ContractorProfile> {
  return apiFetch<ContractorProfile>('/contractor/profile');
}

export function updateProfile(data: {
  display_name?: string;
  bio?: string;
  base_rate?: number;
  base_rate_unit?: string;
  category_ids?: string[];
}): Promise<void> {
  return apiFetch<void>('/contractor/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Availability + location
export function setAvailability(available: boolean): Promise<void> {
  return apiFetch<void>('/contractor/availability', {
    method: 'POST',
    body: JSON.stringify({ available }),
  });
}

export function updateLocation(lat: number, lng: number): Promise<void> {
  return apiFetch<void>('/location', {
    method: 'POST',
    body: JSON.stringify({ lat, lng }),
  });
}

// Jobs
export function listJobs(): Promise<JobQueueItem[]> {
  return apiFetch<JobQueueItem[]>('/contractor/jobs');
}

export function getJob(id: string): Promise<JobDetail> {
  return apiFetch<JobDetail>(`/jobs/${id}`);
}

export function respondToJob(id: string, action: 'accept' | 'deny'): Promise<void> {
  return apiFetch<void>(`/jobs/${id}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

export function submitQuote(
  id: string,
  data: { custom_amount?: number; custom_note?: string },
): Promise<void> {
  return apiFetch<void>(`/jobs/${id}/quote`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function completeJob(id: string): Promise<void> {
  return apiFetch<void>(`/jobs/${id}/complete`, { method: 'POST' });
}
