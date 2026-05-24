# Contractor App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React Native (Expo) contractor app — availability toggle with live GPS, real-time job requests via WebSocket, job queue, quote submission, and profile management.

**Architecture:** Expo managed workflow, React Navigation v6 (bottom tabs + stacks). `AuthContext` owns the JWT lifecycle and wires the API client. `WsContext` owns the WebSocket connection and exposes a typed `subscribe` function. All screen data is fetched locally on focus; no shared state between tabs.

**Tech Stack:** Expo SDK 52, React Navigation v6, `expo-secure-store`, `expo-location`, plain `fetch` API client (mirrors web `lib/api-client.ts`), Jest + React Native Testing Library.

---

## File Map

```
mobile/
├── app.json
├── App.tsx
├── babel.config.js
├── tsconfig.json
├── package.json
├── jest.config.js
├── jest.setup.ts
├── src/
│   ├── api/
│   │   └── client.ts              ← typed fetch wrapper, module-level auth state
│   ├── context/
│   │   ├── AuthContext.tsx        ← JWT lifecycle, SecureStore persistence, auto-login
│   │   └── WsContext.tsx          ← WebSocket connection, subscribe/unsubscribe, backoff
│   ├── navigation/
│   │   ├── RootNavigator.tsx      ← auth gate (Login vs TabNavigator)
│   │   ├── TabNavigator.tsx       ← three tab stacks
│   │   └── types.ts               ← typed param lists for all navigators
│   ├── screens/
│   │   ├── auth/
│   │   │   └── LoginScreen.tsx
│   │   ├── home/
│   │   │   ├── HomeScreen.tsx     ← availability, GPS loop, incoming requests
│   │   │   └── JobRequestDetailScreen.tsx
│   │   ├── jobs/
│   │   │   ├── JobsScreen.tsx
│   │   │   └── JobDetailScreen.tsx
│   │   └── profile/
│   │       └── ProfileScreen.tsx
│   ├── components/
│   │   ├── JobRequestCard.tsx
│   │   ├── ReconnectingBanner.tsx
│   │   └── StatusBadge.tsx
│   └── lib/
│       ├── types.ts
│       └── constants.ts
└── __tests__/
    ├── api-client.test.ts
    ├── AuthContext.test.tsx
    ├── WsContext.test.tsx
    ├── HomeScreen.test.tsx
    ├── JobsScreen.test.tsx
    ├── JobDetailScreen.test.tsx
    └── ProfileScreen.test.tsx
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `mobile/` (entire directory via `create-expo-app`)
- Modify: `mobile/package.json`
- Modify: `mobile/tsconfig.json`
- Create: `mobile/jest.config.js`
- Create: `mobile/jest.setup.ts`
- Create: `mobile/app.json` (replace generated)

- [ ] **Step 1: Initialise Expo project**

From the repo root:
```bash
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
```

- [ ] **Step 2: Install navigation and runtime deps**

```bash
npx expo install expo-secure-store expo-location
npx expo install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npx expo install react-native-screens react-native-safe-area-context
```

- [ ] **Step 3: Install test deps**

```bash
npm install --save-dev @testing-library/react-native @testing-library/jest-native jest-expo
```

- [ ] **Step 3b: Install babel path alias plugin**

```bash
npm install --save-dev babel-plugin-module-resolver
```

- [ ] **Step 4: Replace `tsconfig.json`**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

- [ ] **Step 4b: Update `babel.config.js`** to enable `@/` path aliases at Metro runtime

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module-resolver', { root: ['./src'], alias: { '@': './src' } }],
    ],
  };
};
```

- [ ] **Step 5: Create `jest.config.js`**

```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterFramework: ['./jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
};
```

- [ ] **Step 6: Create `jest.setup.ts`**

```ts
import '@testing-library/jest-native/extend-expect';
```

- [ ] **Step 7: Replace `app.json`**

```json
{
  "expo": {
    "name": "Knect Contractor",
    "slug": "knect-contractor",
    "version": "1.0.0",
    "orientation": "portrait",
    "ios": { "bundleIdentifier": "app.knect.contractor", "supportsTablet": false },
    "android": { "package": "app.knect.contractor", "adaptiveIcon": { "backgroundColor": "#ffffff" } },
    "plugins": [
      ["expo-location", { "locationWhenInUsePermission": "Knect needs your location to share it with customers." }]
    ]
  }
}
```

- [ ] **Step 8: Verify Jest runs**

```bash
npx jest --passWithNoTests
```
Expected: `Test Suites: 0 passed`

- [ ] **Step 9: Commit**

```bash
git add mobile/
git commit -m "feat(mobile): scaffold Expo contractor app"
```

---

## Task 2: Types and Constants

**Files:**
- Create: `mobile/src/lib/types.ts`
- Create: `mobile/src/lib/constants.ts`

- [ ] **Step 1: Create `src/lib/types.ts`**

```ts
export type JobStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'denied'
  | 'cancelled';

export type RateUnit = 'per_hour' | 'per_job';

export interface TradeCategory {
  id: string;
  name: string;
  icon_slug: string;
}

export interface ContractorProfile {
  user_id: string;
  display_name: string;
  bio: string | null;
  base_rate: number | null;
  base_rate_unit: RateUnit | null;
  is_available: boolean;
  is_busy: boolean;
  current_lat: number | null;
  current_lng: number | null;
  avg_rating: number;
  rating_count: number;
  trade_categories: TradeCategory[];
}

export interface JobQueueItem {
  id: string;
  customer_id: string;
  status: JobStatus;
  description: string;
  location_lat: number;
  location_lng: number;
  location_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteDetail {
  id: string;
  base_rate_snapshot: number | null;
  custom_amount: number | null;
  custom_note: string | null;
  created_at: string;
}

export interface JobDetail {
  id: string;
  customer_id: string;
  contractor_id: string;
  status: JobStatus;
  description: string;
  location_lat: number;
  location_lng: number;
  location_address: string | null;
  created_at: string;
  updated_at: string;
  quote: QuoteDetail | null;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

// Incoming request card populated from WS job_requested event
export interface PendingRequest {
  job_id: string;
  description: string;
  location_lat: number;
  location_lng: number;
  received_at: string;
}

export type WsEvent =
  | { type: 'snapshot'; contractors: unknown[] }
  | { type: 'location_update'; contractor_id: string; lat: number; lng: number }
  | { type: 'job_requested'; job_id: string; description: string; location_lat: number; location_lng: number }
  | { type: 'job_accepted'; job_id: string }
  | { type: 'job_denied'; job_id: string }
  | { type: 'job_completed'; job_id: string }
  | { type: 'job_cancelled'; job_id: string };

export type WsEventType = WsEvent['type'];
```

- [ ] **Step 2: Create `src/lib/constants.ts`**

```ts
export const SECURE_STORE_KEYS = {
  ACCESS_TOKEN: 'knect_access_token',
  REFRESH_TOKEN: 'knect_refresh_token',
} as const;

export const STATIC_TRADE_CATEGORIES = [
  { id: '1', name: 'Plumbing', icon_slug: 'pipe' },
  { id: '2', name: 'Electrical', icon_slug: 'bolt' },
  { id: '3', name: 'Carpentry', icon_slug: 'hammer' },
  { id: '4', name: 'Painting', icon_slug: 'brush' },
  { id: '5', name: 'HVAC', icon_slug: 'wind' },
  { id: '6', name: 'Landscaping', icon_slug: 'leaf' },
  { id: '7', name: 'Cleaning', icon_slug: 'sparkle' },
  { id: '8', name: 'Moving', icon_slug: 'box' },
] as const;
```

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/
git commit -m "feat(mobile): add shared types and constants"
```

---

## Task 3: API Client

**Files:**
- Create: `mobile/src/api/client.ts`
- Create: `mobile/__tests__/api-client.test.ts`

- [ ] **Step 1: Write failing tests**

Create `mobile/__tests__/api-client.test.ts`:

```ts
import * as SecureStore from 'expo-secure-store';
import * as client from '@/api/client';
import { SECURE_STORE_KEYS } from '@/lib/constants';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
  client.setAuthState(null, null, jest.fn());
});

describe('apiFetch', () => {
  it('sends Authorization header when access token is set', async () => {
    client.setAuthState('tok-123', 'ref-123', jest.fn());
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ data: 1 }),
    });

    await client.listJobs();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/contractor/jobs'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
      })
    );
  });

  it('retries with refreshed token on 401', async () => {
    client.setAuthState('expired', 'ref-abc', jest.fn());
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, headers: { get: () => null } })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'new-tok', refresh_token: 'new-ref' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => [],
      });

    const result = await client.listJobs();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEYS.ACCESS_TOKEN, 'new-tok');
    expect(result).toEqual([]);
  });

  it('calls onUnauthorized when refresh fails', async () => {
    const onUnauthorized = jest.fn();
    client.setAuthState('expired', 'bad-ref', onUnauthorized);
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, headers: { get: () => null } })
      .mockResolvedValueOnce({ ok: false, status: 401 });

    await expect(client.listJobs()).rejects.toThrow();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('throws ApiError with code and status on non-2xx', async () => {
    client.setAuthState('tok', 'ref', jest.fn());
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({ error: 'job_not_found', message: 'Not found', status: 404 }),
    });

    await expect(client.getJob('bad-id')).rejects.toMatchObject({
      code: 'job_not_found',
      status: 404,
    });
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd mobile && npx jest __tests__/api-client.test.ts
```
Expected: FAIL — `Cannot find module '@/api/client'`

- [ ] **Step 3: Create `src/api/client.ts`**

```ts
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
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && npx jest __tests__/api-client.test.ts
```
Expected: `Tests: 4 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/api/ mobile/__tests__/api-client.test.ts
git commit -m "feat(mobile): add API client with 401 retry"
```

---

## Task 4: AuthContext

**Files:**
- Create: `mobile/src/context/AuthContext.tsx`
- Create: `mobile/__tests__/AuthContext.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `mobile/__tests__/AuthContext.test.tsx`:

```tsx
import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import * as api from '@/api/client';
import { SECURE_STORE_KEYS } from '@/lib/constants';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('@/api/client', () => ({
  login: jest.fn(),
  setAuthState: jest.fn(),
}));

// A minimal consumer that surfaces auth state as text
function Probe() {
  const { accessToken, isLoading } = useAuth();
  if (isLoading) return <Text testID="loading">loading</Text>;
  return <Text testID="token">{accessToken ?? 'null'}</Text>;
}

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
});

describe('AuthContext', () => {
  it('shows loading then null when no stored token', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    const { getByTestId, queryByTestId } = render(
      <AuthProvider><Probe /></AuthProvider>
    );
    expect(getByTestId('loading')).toBeTruthy();
    await waitFor(() => expect(getByTestId('token').props.children).toBe('null'));
  });

  it('auto-logs in when valid refresh token stored', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('stored-refresh');
    // JWT with sub "user-42" — payload is base64({"sub":"user-42","role":"contractor"})
    const payload = btoa(JSON.stringify({ sub: 'user-42', role: 'contractor' }));
    const fakeJwt = `header.${payload}.sig`;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: fakeJwt, refresh_token: 'new-ref' }),
    });

    const { getByTestId } = render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(getByTestId('token').props.children).toBe(fakeJwt));
    expect(api.setAuthState).toHaveBeenCalledWith(fakeJwt, 'new-ref', expect.any(Function));
  });

  it('stays unauthenticated when refresh call fails', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('bad-refresh');
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const { getByTestId } = render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(getByTestId('token').props.children).toBe('null'));
  });

  it('login() stores tokens and sets accessToken', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    const payload = btoa(JSON.stringify({ sub: 'user-1', role: 'contractor' }));
    const fakeJwt = `h.${payload}.s`;
    (api.login as jest.Mock).mockResolvedValue({
      access_token: fakeJwt,
      refresh_token: 'ref-1',
    });
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

    function Consumer() {
      const { login, accessToken, isLoading } = useAuth();
      if (isLoading) return <Text testID="loading" />;
      return (
        <>
          <Text testID="token">{accessToken ?? 'null'}</Text>
          <Text testID="trigger" onPress={() => login('a@b.com', 'pw')} />
        </>
      );
    }

    const { getByTestId } = render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => getByTestId('token'));
    await act(async () => { getByTestId('trigger').props.onPress(); });

    await waitFor(() => expect(getByTestId('token').props.children).toBe(fakeJwt));
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEYS.ACCESS_TOKEN, fakeJwt);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEYS.REFRESH_TOKEN, 'ref-1');
  });

  it('logout() clears token and calls SecureStore.deleteItemAsync', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

    function Consumer() {
      const { logout, accessToken, isLoading } = useAuth();
      if (isLoading) return <Text testID="loading" />;
      return (
        <>
          <Text testID="token">{accessToken ?? 'null'}</Text>
          <Text testID="trigger" onPress={logout} />
        </>
      );
    }

    const { getByTestId } = render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => getByTestId('token'));
    await act(async () => { getByTestId('trigger').props.onPress(); });

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEYS.ACCESS_TOKEN);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEYS.REFRESH_TOKEN);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd mobile && npx jest __tests__/AuthContext.test.tsx
```
Expected: FAIL — `Cannot find module '@/context/AuthContext'`

- [ ] **Step 3: Create `src/context/AuthContext.tsx`**

```tsx
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { SECURE_STORE_KEYS } from '@/lib/constants';
import * as api from '@/api/client';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

function decodeJwtSub(token: string): string {
  const raw = token.split('.')[1];
  // Pad base64 if needed
  const padded = raw + '=='.slice((raw.length % 4) || 4);
  return JSON.parse(atob(padded)).sub as string;
}

interface AuthState {
  accessToken: string | null;
  userId: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Stable ref so the api client can call logout without stale closure
  const logoutRef = useRef<() => void>(() => {});

  const logout = useCallback(() => {
    SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
    SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
    setAccessToken(null);
    setUserId(null);
  }, []);

  logoutRef.current = logout;

  // Keep api client in sync whenever tokens change
  useEffect(() => {
    // We read refresh token directly from SecureStore inside the api client on retry;
    // pass null here — the client stores it internally after first setAuthState call.
    api.setAuthState(accessToken, null, () => logoutRef.current());
  }, [accessToken]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const refreshToken = await SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
        if (!refreshToken) return;

        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return;

        const { access_token, refresh_token } = await res.json();
        await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, access_token);
        await SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, refresh_token);
        api.setAuthState(access_token, refresh_token, () => logoutRef.current());
        setUserId(decodeJwtSub(access_token));
        setAccessToken(access_token);
      } catch {
        // silently drop to Login
      } finally {
        setIsLoading(false);
      }
    }
    bootstrap();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await api.login(email, password);
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, tokens.access_token);
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, tokens.refresh_token);
    api.setAuthState(tokens.access_token, tokens.refresh_token, () => logoutRef.current());
    setUserId(decodeJwtSub(tokens.access_token));
    setAccessToken(tokens.access_token);
  }, []);

  return (
    <AuthContext.Provider value={{ accessToken, userId, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && npx jest __tests__/AuthContext.test.tsx
```
Expected: `Tests: 5 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/context/AuthContext.tsx mobile/__tests__/AuthContext.test.tsx
git commit -m "feat(mobile): add AuthContext with auto-login and JWT lifecycle"
```

---

## Task 5: WsContext

**Files:**
- Create: `mobile/src/context/WsContext.tsx`
- Create: `mobile/__tests__/WsContext.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `mobile/__tests__/WsContext.test.tsx`:

```tsx
import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { WsProvider, useWs } from '@/context/WsContext';
import type { WsEvent } from '@/lib/types';

// Mock AuthContext
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = jest.fn(() => { this.onclose?.(); });
  static instances: MockWebSocket[] = [];
  constructor(public url: string) { MockWebSocket.instances.push(this); }
}
(global as any).WebSocket = MockWebSocket;

beforeEach(() => { MockWebSocket.instances = []; });

function Probe({ eventType, onEvent }: { eventType: WsEvent['type']; onEvent: (e: WsEvent) => void }) {
  const { connected, subscribe } = useWs();
  React.useEffect(() => subscribe(eventType, onEvent), [eventType, onEvent, subscribe]);
  return <Text testID="connected">{connected ? 'yes' : 'no'}</Text>;
}

describe('WsContext', () => {
  it('opens WebSocket with token in URL', () => {
    render(<WsProvider><Probe eventType="job_requested" onEvent={jest.fn()} /></WsProvider>);
    expect(MockWebSocket.instances[0].url).toContain('token=test-token');
  });

  it('sets connected=true on open', async () => {
    const { getByTestId } = render(
      <WsProvider><Probe eventType="job_requested" onEvent={jest.fn()} /></WsProvider>
    );
    expect(getByTestId('connected').props.children).toBe('no');
    await act(async () => { MockWebSocket.instances[0].onopen?.(); });
    expect(getByTestId('connected').props.children).toBe('yes');
  });

  it('dispatches events to subscribers', async () => {
    const handler = jest.fn();
    render(<WsProvider><Probe eventType="job_requested" onEvent={handler} /></WsProvider>);
    const ws = MockWebSocket.instances[0];
    const event: WsEvent = { type: 'job_requested', job_id: 'j1', description: 'Fix sink', location_lat: 1, location_lng: 2 };
    await act(async () => { ws.onmessage?.({ data: JSON.stringify(event) }); });
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('does not dispatch to unsubscribed handlers', async () => {
    const handler = jest.fn();
    const { unmount } = render(
      <WsProvider><Probe eventType="job_requested" onEvent={handler} /></WsProvider>
    );
    unmount();
    const ws = MockWebSocket.instances[0];
    const event: WsEvent = { type: 'job_requested', job_id: 'j1', description: 'x', location_lat: 0, location_lng: 0 };
    await act(async () => { ws.onmessage?.({ data: JSON.stringify(event) }); });
    expect(handler).not.toHaveBeenCalled();
  });

  it('sets connected=false on close', async () => {
    const { getByTestId } = render(
      <WsProvider><Probe eventType="job_requested" onEvent={jest.fn()} /></WsProvider>
    );
    const ws = MockWebSocket.instances[0];
    await act(async () => { ws.onopen?.(); });
    expect(getByTestId('connected').props.children).toBe('yes');
    // Prevent reconnect timer from firing
    jest.useFakeTimers();
    await act(async () => { ws.onclose?.(); });
    expect(getByTestId('connected').props.children).toBe('no');
    jest.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd mobile && npx jest __tests__/WsContext.test.tsx
```
Expected: FAIL — `Cannot find module '@/context/WsContext'`

- [ ] **Step 3: Create `src/context/WsContext.tsx`**

```tsx
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { WsEvent, WsEventType } from '@/lib/types';

const WS_BASE = process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:8080';
const MAX_BACKOFF_MS = 30_000;

type Subscriber = (event: WsEvent) => void;

interface WsState {
  connected: boolean;
  subscribe: (eventType: WsEventType, callback: Subscriber) => () => void;
}

const WsContext = createContext<WsState | null>(null);

export function WsProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1_000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribersRef = useRef(new Map<string, Set<Subscriber>>());

  function subscribe(eventType: WsEventType, callback: Subscriber): () => void {
    const map = subscribersRef.current;
    if (!map.has(eventType)) map.set(eventType, new Set());
    map.get(eventType)!.add(callback);
    return () => map.get(eventType)?.delete(callback);
  }

  useEffect(() => {
    if (!accessToken) return;

    function connect() {
      if (wsRef.current) return;
      const ws = new WebSocket(`${WS_BASE}/ws?token=${accessToken}`);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 1_000;
        setConnected(true);
      };

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data as string) as WsEvent;
          subscribersRef.current.get(event.type)?.forEach((cb) => cb(event));
        } catch {}
      };

      ws.onerror = () => ws.close();

      ws.onclose = () => {
        wsRef.current = null;
        setConnected(false);
        timerRef.current = setTimeout(connect, backoffRef.current);
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      };
    }

    connect();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [accessToken]);

  return (
    <WsContext.Provider value={{ connected, subscribe }}>
      {children}
    </WsContext.Provider>
  );
}

export function useWs(): WsState {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error('useWs must be used within WsProvider');
  return ctx;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && npx jest __tests__/WsContext.test.tsx
```
Expected: `Tests: 5 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/context/WsContext.tsx mobile/__tests__/WsContext.test.tsx
git commit -m "feat(mobile): add WsContext with subscribe pattern and backoff"
```

---

## Task 6: Shared UI Components

**Files:**
- Create: `mobile/src/components/StatusBadge.tsx`
- Create: `mobile/src/components/ReconnectingBanner.tsx`
- Create: `mobile/src/components/JobRequestCard.tsx`

No unit tests for these pure presentational components — they are exercised in screen tests.

- [ ] **Step 1: Create `src/components/StatusBadge.tsx`**

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { JobStatus } from '@/lib/types';

const CONFIG: Record<JobStatus, { label: string; bg: string; text: string }> = {
  pending:     { label: 'Pending',     bg: '#fef9c3', text: '#854d0e' },
  accepted:    { label: 'Accepted',    bg: '#dcfce7', text: '#166534' },
  in_progress: { label: 'In Progress', bg: '#dbeafe', text: '#1e40af' },
  completed:   { label: 'Completed',   bg: '#f0fdf4', text: '#15803d' },
  denied:      { label: 'Denied',      bg: '#fee2e2', text: '#991b1b' },
  cancelled:   { label: 'Cancelled',   bg: '#f3f4f6', text: '#6b7280' },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const { label, bg, text } = CONFIG[status];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999 },
  label: { fontSize: 11, fontWeight: '600' },
});
```

- [ ] **Step 2: Create `src/components/ReconnectingBanner.tsx`**

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function ReconnectingBanner({ connected }: { connected: boolean }) {
  if (connected) return null;
  return (
    <View style={styles.banner} testID="reconnecting-banner">
      <Text style={styles.text}>Reconnecting…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#fbbf24',
    paddingVertical: 6,
    alignItems: 'center',
  },
  text: { fontSize: 12, fontWeight: '600', color: '#78350f' },
});
```

- [ ] **Step 3: Create `src/components/JobRequestCard.tsx`**

```tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { PendingRequest } from '@/lib/types';

interface Props {
  request: PendingRequest;
  onPress: () => void;
}

export function JobRequestCard({ request, onPress }: Props) {
  const age = Math.round(
    (Date.now() - new Date(request.received_at).getTime()) / 1000
  );

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} testID={`request-card-${request.job_id}`}>
      <Text style={styles.description} numberOfLines={2}>
        {request.description}
      </Text>
      <Text style={styles.meta}>{age < 60 ? `${age}s ago` : `${Math.round(age / 60)}m ago`}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  description: { fontSize: 14, fontWeight: '500', color: '#0f172a', marginBottom: 4 },
  meta: { fontSize: 12, color: '#94a3b8' },
});
```

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/
git commit -m "feat(mobile): add StatusBadge, ReconnectingBanner, JobRequestCard components"
```

---

## Task 7: Navigation Shell

**Files:**
- Create: `mobile/src/navigation/types.ts`
- Create: `mobile/src/navigation/RootNavigator.tsx`
- Create: `mobile/src/navigation/TabNavigator.tsx`
- Create: `mobile/App.tsx` (replace generated)

- [ ] **Step 1: Create `src/navigation/types.ts`**

```ts
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { PendingRequest } from '@/lib/types';

export type HomeStackParamList = {
  Home: undefined;
  JobRequestDetail: { request: PendingRequest };
};

export type JobsStackParamList = {
  Jobs: undefined;
  JobDetail: { jobId: string };
};

export type ProfileStackParamList = {
  Profile: undefined;
};

export type TabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  JobsTab: NavigatorScreenParams<JobsStackParamList>;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
};
```

- [ ] **Step 2: Create `src/navigation/TabNavigator.tsx`**

```tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { TabParamList, HomeStackParamList, JobsStackParamList, ProfileStackParamList } from './types';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { JobRequestDetailScreen } from '@/screens/home/JobRequestDetailScreen';
import { JobsScreen } from '@/screens/jobs/JobsScreen';
import { JobDetailScreen } from '@/screens/jobs/JobDetailScreen';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';

const Tab = createBottomTabNavigator<TabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const JobsStack = createNativeStackNavigator<JobsStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

function HomeStackNav() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <HomeStack.Screen name="JobRequestDetail" component={JobRequestDetailScreen} options={{ title: 'Job Request' }} />
    </HomeStack.Navigator>
  );
}

function JobsStackNav() {
  return (
    <JobsStack.Navigator>
      <JobsStack.Screen name="Jobs" component={JobsScreen} options={{ title: 'Jobs' }} />
      <JobsStack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: 'Job Detail' }} />
    </JobsStack.Navigator>
  );
}

function ProfileStackNav() {
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </ProfileStack.Navigator>
  );
}

export function TabNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="HomeTab" component={HomeStackNav} options={{ title: 'Home' }} />
      <Tab.Screen name="JobsTab" component={JobsStackNav} options={{ title: 'Jobs' }} />
      <Tab.Screen name="ProfileTab" component={ProfileStackNav} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
```

- [ ] **Step 3: Create `src/navigation/RootNavigator.tsx`**

```tsx
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '@/context/AuthContext';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { TabNavigator } from './TabNavigator';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
  const { accessToken, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {accessToken ? (
        <Stack.Screen name="App" component={TabNavigator} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
```

- [ ] **Step 4: Replace `App.tsx`**

```tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { WsProvider } from '@/context/WsContext';
import { RootNavigator } from '@/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <WsProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </WsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add mobile/src/navigation/ mobile/App.tsx
git commit -m "feat(mobile): add navigation shell (root + tabs)"
```

---

## Task 8: LoginScreen

**Files:**
- Create: `mobile/src/screens/auth/LoginScreen.tsx`
- Create: `mobile/__tests__/LoginScreen.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to `mobile/__tests__/AuthContext.test.tsx` — actually, create a separate `LoginScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginScreen } from '@/screens/auth/LoginScreen';

const mockLogin = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

beforeEach(() => mockLogin.mockReset());

describe('LoginScreen', () => {
  it('renders email and password fields and sign-in button', () => {
    const { getByTestId } = render(<LoginScreen />);
    expect(getByTestId('email-input')).toBeTruthy();
    expect(getByTestId('password-input')).toBeTruthy();
    expect(getByTestId('login-button')).toBeTruthy();
  });

  it('calls login with entered credentials on submit', async () => {
    mockLogin.mockResolvedValue(undefined);
    const { getByTestId } = render(<LoginScreen />);
    fireEvent.changeText(getByTestId('email-input'), 'contractor@example.com');
    fireEvent.changeText(getByTestId('password-input'), 'secret');
    fireEvent.press(getByTestId('login-button'));
    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith('contractor@example.com', 'secret')
    );
  });

  it('shows error message when login fails', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));
    const { getByTestId, findByTestId } = render(<LoginScreen />);
    fireEvent.changeText(getByTestId('email-input'), 'a@b.com');
    fireEvent.changeText(getByTestId('password-input'), 'wrong');
    fireEvent.press(getByTestId('login-button'));
    const err = await findByTestId('error-message');
    expect(err.props.children).toBe('Invalid credentials');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd mobile && npx jest __tests__/LoginScreen.test.tsx
```
Expected: FAIL — `Cannot find module '@/screens/auth/LoginScreen'`

- [ ] **Step 3: Create `src/screens/auth/LoginScreen.tsx`**

```tsx
import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.brand}>Knect</Text>
        <Text style={styles.subtitle}>Contractor sign in</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          testID="email-input"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          testID="password-input"
        />

        {error ? (
          <Text style={styles.error} testID="error-message">{error}</Text>
        ) : null}

        <TouchableOpacity
          style={[styles.button, (loading || !email || !password) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading || !email.trim() || !password}
          testID="login-button"
        >
          <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  brand: { fontSize: 32, fontWeight: '800', color: '#2563eb', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#64748b', marginBottom: 32 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  error: { color: '#dc2626', fontSize: 13, marginBottom: 8 },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && npx jest __tests__/LoginScreen.test.tsx
```
Expected: `Tests: 3 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/auth/ mobile/__tests__/LoginScreen.test.tsx
git commit -m "feat(mobile): add LoginScreen"
```

---

## Task 9: HomeScreen

**Files:**
- Create: `mobile/src/screens/home/HomeScreen.tsx`
- Create: `mobile/__tests__/HomeScreen.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `mobile/__tests__/HomeScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { HomeScreen } from '@/screens/home/HomeScreen';
import * as api from '@/api/client';
import * as Location from 'expo-location';
import type { WsEvent } from '@/lib/types';

let wsSubscriptions: Map<string, ((e: WsEvent) => void)[]> = new Map();
const mockSubscribe = jest.fn((type: string, cb: (e: WsEvent) => void) => {
  if (!wsSubscriptions.has(type)) wsSubscriptions.set(type, []);
  wsSubscriptions.get(type)!.push(cb);
  return () => {};
});

jest.mock('@/context/WsContext', () => ({
  useWs: () => ({ connected: true, subscribe: mockSubscribe }),
}));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'tok' }),
}));
jest.mock('@/api/client', () => ({
  getProfile: jest.fn(),
  setAvailability: jest.fn(),
  updateLocation: jest.fn(),
}));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => { cb(); },
  useNavigation: () => ({ navigate: jest.fn() }),
}));

beforeEach(() => {
  wsSubscriptions = new Map();
  mockSubscribe.mockClear();
  (api.getProfile as jest.Mock).mockResolvedValue({ is_available: false });
  (api.setAvailability as jest.Mock).mockResolvedValue(undefined);
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: { latitude: 40.71, longitude: -74.0 },
  });
});

describe('HomeScreen', () => {
  it('shows availability toggle', async () => {
    const { getByTestId } = render(<HomeScreen />);
    await waitFor(() => expect(getByTestId('availability-toggle')).toBeTruthy());
  });

  it('calls setAvailability(true) and requests location permission on toggle on', async () => {
    const { getByTestId } = render(<HomeScreen />);
    await waitFor(() => getByTestId('availability-toggle'));
    await act(async () => {
      fireEvent(getByTestId('availability-toggle'), 'valueChange', true);
    });
    await waitFor(() => {
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
      expect(api.setAvailability).toHaveBeenCalledWith(true);
    });
  });

  it('shows location error and does not toggle when permission denied', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    const { getByTestId, findByTestId } = render(<HomeScreen />);
    await waitFor(() => getByTestId('availability-toggle'));
    await act(async () => {
      fireEvent(getByTestId('availability-toggle'), 'valueChange', true);
    });
    await findByTestId('location-error');
    expect(api.setAvailability).not.toHaveBeenCalled();
  });

  it('adds a card when job_requested WS event arrives', async () => {
    const { findByTestId } = render(<HomeScreen />);
    await waitFor(() => wsSubscriptions.has('job_requested'));
    const event: WsEvent = {
      type: 'job_requested',
      job_id: 'job-1',
      description: 'Fix the sink',
      location_lat: 40,
      location_lng: -74,
    };
    await act(async () => {
      wsSubscriptions.get('job_requested')?.forEach(cb => cb(event));
    });
    await findByTestId('request-card-job-1');
  });

  it('removes card when job_cancelled WS event arrives', async () => {
    const { findByTestId, queryByTestId } = render(<HomeScreen />);
    await waitFor(() => wsSubscriptions.has('job_requested'));
    const requested: WsEvent = {
      type: 'job_requested', job_id: 'job-2',
      description: 'Paint wall', location_lat: 40, location_lng: -74,
    };
    await act(async () => {
      wsSubscriptions.get('job_requested')?.forEach(cb => cb(requested));
    });
    await findByTestId('request-card-job-2');
    const cancelled: WsEvent = { type: 'job_cancelled', job_id: 'job-2' };
    await act(async () => {
      wsSubscriptions.get('job_cancelled')?.forEach(cb => cb(cancelled));
    });
    await waitFor(() => expect(queryByTestId('request-card-job-2')).toBeNull());
  });

  it('shows reconnecting banner when disconnected', () => {
    jest.resetModules();
    jest.doMock('@/context/WsContext', () => ({
      useWs: () => ({ connected: false, subscribe: mockSubscribe }),
    }));
    // Re-require after mock change
    const { HomeScreen: HS } = require('@/screens/home/HomeScreen');
    const { getByTestId } = render(<HS />);
    expect(getByTestId('reconnecting-banner')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd mobile && npx jest __tests__/HomeScreen.test.tsx
```
Expected: FAIL — `Cannot find module '@/screens/home/HomeScreen'`

- [ ] **Step 3: Create `src/screens/home/HomeScreen.tsx`**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import * as api from '@/api/client';
import { useWs } from '@/context/WsContext';
import { JobRequestCard } from '@/components/JobRequestCard';
import { ReconnectingBanner } from '@/components/ReconnectingBanner';
import type { HomeStackParamList } from '@/navigation/types';
import type { PendingRequest, WsEvent } from '@/lib/types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { connected, subscribe } = useWs();
  const [isAvailable, setIsAvailable] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [requests, setRequests] = useState<PendingRequest[]>([]);

  useFocusEffect(
    useCallback(() => {
      api.getProfile().then((p) => setIsAvailable(p.is_available)).catch(() => {});
    }, []),
  );

  useEffect(() => {
    const unsub1 = subscribe('job_requested', (event: WsEvent) => {
      if (event.type !== 'job_requested') return;
      setRequests((prev) => [
        ...prev,
        {
          job_id: event.job_id,
          description: event.description,
          location_lat: event.location_lat,
          location_lng: event.location_lng,
          received_at: new Date().toISOString(),
        },
      ]);
    });

    const unsub2 = subscribe('job_cancelled', (event: WsEvent) => {
      if (event.type !== 'job_cancelled') return;
      setRequests((prev) => prev.filter((r) => r.job_id !== event.job_id));
    });

    return () => { unsub1(); unsub2(); };
  }, [subscribe]);

  // 5-second location broadcast while available
  useEffect(() => {
    if (!isAvailable) return;
    const id = setInterval(async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({});
        await api.updateLocation(pos.coords.latitude, pos.coords.longitude);
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [isAvailable]);

  async function handleToggle(value: boolean) {
    if (value) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Enable location to go available.');
        return;
      }
      setLocationError(null);
    }
    try {
      await api.setAvailability(value);
      setIsAvailable(value);
    } catch {}
  }

  return (
    <View style={styles.container}>
      <ReconnectingBanner connected={connected} />

      <View style={styles.availabilityRow}>
        <Text style={styles.availabilityLabel}>Available for work</Text>
        <Switch
          value={isAvailable}
          onValueChange={handleToggle}
          testID="availability-toggle"
        />
      </View>

      {locationError ? (
        <Text style={styles.locationError} testID="location-error">{locationError}</Text>
      ) : null}

      <FlatList
        data={requests}
        keyExtractor={(item) => item.job_id}
        renderItem={({ item }) => (
          <JobRequestCard
            request={item}
            onPress={() => navigation.navigate('JobRequestDetail', { request: item })}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty} testID="empty-requests">No pending requests</Text>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  availabilityRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  availabilityLabel: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  locationError: { color: '#dc2626', fontSize: 12, paddingHorizontal: 20, paddingTop: 8 },
  list: { paddingTop: 8 },
  empty: { textAlign: 'center', marginTop: 40, color: '#94a3b8' },
});
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && npx jest __tests__/HomeScreen.test.tsx
```
Expected: `Tests: 5 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/home/HomeScreen.tsx mobile/__tests__/HomeScreen.test.tsx
git commit -m "feat(mobile): add HomeScreen with availability toggle and live job requests"
```

---

## Task 10: JobRequestDetailScreen

**Files:**
- Create: `mobile/src/screens/home/JobRequestDetailScreen.tsx`

- [ ] **Step 1: Write failing tests**

Create `mobile/__tests__/JobRequestDetailScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { JobRequestDetailScreen } from '@/screens/home/JobRequestDetailScreen';
import * as api from '@/api/client';

jest.mock('@/api/client', () => ({
  respondToJob: jest.fn(),
}));

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({
    params: {
      request: {
        job_id: 'job-abc',
        description: 'Fix leaky faucet',
        location_lat: 40.71,
        location_lng: -74.0,
        received_at: new Date().toISOString(),
      },
    },
  }),
}));

beforeEach(() => {
  (api.respondToJob as jest.Mock).mockReset();
  mockGoBack.mockReset();
});

describe('JobRequestDetailScreen', () => {
  it('displays job description', () => {
    const { getByText } = render(<JobRequestDetailScreen />);
    expect(getByText('Fix leaky faucet')).toBeTruthy();
  });

  it('calls respondToJob(accept) and goBack on Accept press', async () => {
    (api.respondToJob as jest.Mock).mockResolvedValue(undefined);
    const { getByTestId } = render(<JobRequestDetailScreen />);
    fireEvent.press(getByTestId('accept-button'));
    await waitFor(() => {
      expect(api.respondToJob).toHaveBeenCalledWith('job-abc', 'accept');
      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  it('calls respondToJob(deny) and goBack on Deny press', async () => {
    (api.respondToJob as jest.Mock).mockResolvedValue(undefined);
    const { getByTestId } = render(<JobRequestDetailScreen />);
    fireEvent.press(getByTestId('deny-button'));
    await waitFor(() => {
      expect(api.respondToJob).toHaveBeenCalledWith('job-abc', 'deny');
      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  it('shows error toast and goes back on 409 conflict', async () => {
    const { ApiError } = require('@/api/client');
    (api.respondToJob as jest.Mock).mockRejectedValue(
      new ApiError('conflict', 409, 'Job is no longer available')
    );
    const { getByTestId, findByTestId } = render(<JobRequestDetailScreen />);
    fireEvent.press(getByTestId('accept-button'));
    await findByTestId('conflict-message');
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd mobile && npx jest __tests__/JobRequestDetailScreen.test.tsx
```
Expected: FAIL — `Cannot find module '@/screens/home/JobRequestDetailScreen'`

- [ ] **Step 3: Create `src/screens/home/JobRequestDetailScreen.tsx`**

```tsx
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as api from '@/api/client';
import { ApiError } from '@/api/client';
import type { HomeStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'JobRequestDetail'>;
type Route = RouteProp<HomeStackParamList, 'JobRequestDetail'>;

export function JobRequestDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params: { request } } = useRoute<Route>();
  const [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState(false);

  async function handleRespond(action: 'accept' | 'deny') {
    setLoading(true);
    try {
      await api.respondToJob(request.job_id, action);
      navigation.goBack();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        setTimeout(() => navigation.goBack(), 1500);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Job description</Text>
      <Text style={styles.description}>{request.description}</Text>

      {conflict ? (
        <Text style={styles.conflict} testID="conflict-message">
          This request is no longer available.
        </Text>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.denyButton]}
          onPress={() => handleRespond('deny')}
          disabled={loading}
          testID="deny-button"
        >
          <Text style={styles.denyText}>Deny</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.acceptButton]}
          onPress={() => handleRespond('accept')}
          disabled={loading}
          testID="accept-button"
        >
          <Text style={styles.acceptText}>{loading ? 'Responding…' : 'Accept'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 20 },
  label: { fontSize: 12, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', marginBottom: 6 },
  description: { fontSize: 16, color: '#0f172a', marginBottom: 24 },
  conflict: { color: '#dc2626', fontSize: 13, marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  denyButton: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  denyText: { fontWeight: '600', color: '#475569' },
  acceptButton: { backgroundColor: '#2563eb' },
  acceptText: { fontWeight: '700', color: '#fff' },
});
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && npx jest __tests__/JobRequestDetailScreen.test.tsx
```
Expected: `Tests: 4 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/home/JobRequestDetailScreen.tsx mobile/__tests__/JobRequestDetailScreen.test.tsx
git commit -m "feat(mobile): add JobRequestDetailScreen"
```

---

## Task 11: JobsScreen

**Files:**
- Create: `mobile/src/screens/jobs/JobsScreen.tsx`
- Create: `mobile/__tests__/JobsScreen.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `mobile/__tests__/JobsScreen.test.tsx`:

```tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { JobsScreen } from '@/screens/jobs/JobsScreen';
import * as api from '@/api/client';
import type { JobQueueItem } from '@/lib/types';

jest.mock('@/api/client', () => ({ listJobs: jest.fn() }));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => { cb(); },
  useNavigation: () => ({ navigate: jest.fn() }),
}));

const mockJob: JobQueueItem = {
  id: 'job-1', customer_id: 'c-1', status: 'pending',
  description: 'Install light fixture', location_lat: 40, location_lng: -74,
  location_address: '123 Main St', created_at: '2026-05-23T10:00:00Z', updated_at: '2026-05-23T10:00:00Z',
};

beforeEach(() => (api.listJobs as jest.Mock).mockReset());

describe('JobsScreen', () => {
  it('renders a list of jobs', async () => {
    (api.listJobs as jest.Mock).mockResolvedValue([mockJob]);
    const { findByText } = render(<JobsScreen />);
    await findByText('Install light fixture');
  });

  it('renders empty state when no jobs', async () => {
    (api.listJobs as jest.Mock).mockResolvedValue([]);
    const { findByTestId } = render(<JobsScreen />);
    await findByTestId('empty-jobs');
  });

  it('shows status badge for each job', async () => {
    (api.listJobs as jest.Mock).mockResolvedValue([mockJob]);
    const { findByText } = render(<JobsScreen />);
    await findByText('Pending');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd mobile && npx jest __tests__/JobsScreen.test.tsx
```
Expected: FAIL — `Cannot find module '@/screens/jobs/JobsScreen'`

- [ ] **Step 3: Create `src/screens/jobs/JobsScreen.tsx`**

```tsx
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as api from '@/api/client';
import { StatusBadge } from '@/components/StatusBadge';
import type { JobsStackParamList } from '@/navigation/types';
import type { JobQueueItem } from '@/lib/types';

type Nav = NativeStackNavigationProp<JobsStackParamList, 'Jobs'>;

export function JobsScreen() {
  const navigation = useNavigation<Nav>();
  const [jobs, setJobs] = useState<JobQueueItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      api.listJobs().then(setJobs).catch(() => {});
    }, []),
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('JobDetail', { jobId: item.id })}
            testID={`job-row-${item.id}`}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.description} numberOfLines={1}>{item.description}</Text>
              <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
            </View>
            <StatusBadge status={item.status} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty} testID="empty-jobs">No active jobs</Text>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  list: { paddingTop: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  rowLeft: { flex: 1, marginRight: 12 },
  description: { fontSize: 14, fontWeight: '500', color: '#0f172a' },
  date: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 40, color: '#94a3b8' },
});
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && npx jest __tests__/JobsScreen.test.tsx
```
Expected: `Tests: 3 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/jobs/JobsScreen.tsx mobile/__tests__/JobsScreen.test.tsx
git commit -m "feat(mobile): add JobsScreen"
```

---

## Task 12: JobDetailScreen

**Files:**
- Create: `mobile/src/screens/jobs/JobDetailScreen.tsx`
- Create: `mobile/__tests__/JobDetailScreen.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `mobile/__tests__/JobDetailScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { JobDetailScreen } from '@/screens/jobs/JobDetailScreen';
import * as api from '@/api/client';
import type { JobDetail } from '@/lib/types';

jest.mock('@/api/client', () => ({
  getJob: jest.fn(),
  submitQuote: jest.fn(),
  completeJob: jest.fn(),
}));

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: { jobId: 'job-xyz' } }),
}));

const acceptedJob: JobDetail = {
  id: 'job-xyz', customer_id: 'c-1', contractor_id: 'con-1',
  status: 'accepted', description: 'Paint bedroom', location_lat: 40, location_lng: -74,
  location_address: '456 Elm St', created_at: '2026-05-23T09:00:00Z', updated_at: '2026-05-23T09:00:00Z',
  quote: null,
};

beforeEach(() => {
  (api.getJob as jest.Mock).mockReset().mockResolvedValue(acceptedJob);
  (api.submitQuote as jest.Mock).mockReset().mockResolvedValue(undefined);
  (api.completeJob as jest.Mock).mockReset().mockResolvedValue(undefined);
  mockGoBack.mockReset();
});

describe('JobDetailScreen', () => {
  it('displays job description and status', async () => {
    const { findByText } = render(<JobDetailScreen />);
    await findByText('Paint bedroom');
    await findByText('Accepted');
  });

  it('shows quote form for accepted job', async () => {
    const { findByTestId } = render(<JobDetailScreen />);
    await findByTestId('quote-submit-button');
  });

  it('calls submitQuote with entered values', async () => {
    const { findByTestId } = render(<JobDetailScreen />);
    const amountInput = await findByTestId('quote-amount-input');
    const noteInput = await findByTestId('quote-note-input');
    fireEvent.changeText(amountInput, '150');
    fireEvent.changeText(noteInput, 'Parts included');
    fireEvent.press(await findByTestId('quote-submit-button'));
    await waitFor(() =>
      expect(api.submitQuote).toHaveBeenCalledWith('job-xyz', {
        custom_amount: 150,
        custom_note: 'Parts included',
      })
    );
  });

  it('calls completeJob and goBack on complete press', async () => {
    const { findByTestId } = render(<JobDetailScreen />);
    fireEvent.press(await findByTestId('complete-button'));
    await waitFor(() => {
      expect(api.completeJob).toHaveBeenCalledWith('job-xyz');
      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  it('hides actions for completed job', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...acceptedJob, status: 'completed' });
    const { queryByTestId } = render(<JobDetailScreen />);
    await waitFor(() => expect(queryByTestId('complete-button')).toBeNull());
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd mobile && npx jest __tests__/JobDetailScreen.test.tsx
```
Expected: FAIL — `Cannot find module '@/screens/jobs/JobDetailScreen'`

- [ ] **Step 3: Create `src/screens/jobs/JobDetailScreen.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as api from '@/api/client';
import { StatusBadge } from '@/components/StatusBadge';
import type { JobsStackParamList } from '@/navigation/types';
import type { JobDetail } from '@/lib/types';

type Nav = NativeStackNavigationProp<JobsStackParamList, 'JobDetail'>;
type Route = RouteProp<JobsStackParamList, 'JobDetail'>;

const ACTIVE_STATUSES = new Set(['accepted', 'in_progress']);

export function JobDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params: { jobId } } = useRoute<Route>();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteNote, setQuoteNote] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getJob(jobId).then((j) => {
      setJob(j);
      if (j.quote?.custom_amount != null) setQuoteAmount(String(j.quote.custom_amount));
      if (j.quote?.custom_note) setQuoteNote(j.quote.custom_note);
    }).catch(() => {});
  }, [jobId]);

  async function handleSubmitQuote() {
    if (!job) return;
    setLoading(true);
    try {
      await api.submitQuote(jobId, {
        custom_amount: quoteAmount ? parseFloat(quoteAmount) : undefined,
        custom_note: quoteNote || undefined,
      });
    } catch {} finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    setLoading(true);
    try {
      await api.completeJob(jobId);
      navigation.goBack();
    } catch {} finally {
      setLoading(false);
    }
  }

  if (!job) return null;

  const isActive = ACTIVE_STATUSES.has(job.status);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <StatusBadge status={job.status} />
        <Text style={styles.date}>{new Date(job.created_at).toLocaleDateString()}</Text>
      </View>

      <Text style={styles.sectionLabel}>Description</Text>
      <Text style={styles.description}>{job.description}</Text>

      {job.location_address ? (
        <>
          <Text style={styles.sectionLabel}>Location</Text>
          <Text style={styles.body}>{job.location_address}</Text>
        </>
      ) : null}

      {isActive ? (
        <>
          <Text style={styles.sectionLabel}>Quote</Text>
          <TextInput
            style={styles.input}
            placeholder="Custom amount (optional)"
            value={quoteAmount}
            onChangeText={setQuoteAmount}
            keyboardType="decimal-pad"
            testID="quote-amount-input"
          />
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Note (optional)"
            value={quoteNote}
            onChangeText={setQuoteNote}
            multiline
            testID="quote-note-input"
          />
          <TouchableOpacity
            style={[styles.button, styles.quoteButton]}
            onPress={handleSubmitQuote}
            disabled={loading}
            testID="quote-submit-button"
          >
            <Text style={styles.quoteButtonText}>
              {job.quote ? 'Update Quote' : 'Submit Quote'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.completeButton]}
            onPress={handleComplete}
            disabled={loading}
            testID="complete-button"
          >
            <Text style={styles.completeButtonText}>Mark Complete</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  date: { fontSize: 12, color: '#94a3b8' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginTop: 16 },
  description: { fontSize: 15, color: '#0f172a', lineHeight: 22 },
  body: { fontSize: 14, color: '#475569' },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  button: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  quoteButton: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  quoteButtonText: { fontWeight: '600', color: '#334155' },
  completeButton: { backgroundColor: '#2563eb' },
  completeButtonText: { fontWeight: '700', color: '#fff' },
});
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && npx jest __tests__/JobDetailScreen.test.tsx
```
Expected: `Tests: 5 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/jobs/ mobile/__tests__/JobDetailScreen.test.tsx
git commit -m "feat(mobile): add JobDetailScreen with quote and complete actions"
```

---

## Task 13: ProfileScreen

**Files:**
- Create: `mobile/src/screens/profile/ProfileScreen.tsx`
- Create: `mobile/__tests__/ProfileScreen.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `mobile/__tests__/ProfileScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import * as api from '@/api/client';
import type { ContractorProfile } from '@/lib/types';

jest.mock('@/api/client', () => ({
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
}));

const mockProfile: ContractorProfile = {
  user_id: 'con-1', display_name: 'Bob the Builder', bio: 'I build things.',
  base_rate: 75, base_rate_unit: 'per_hour', is_available: false, is_busy: false,
  current_lat: null, current_lng: null, avg_rating: 4.5, rating_count: 12,
  trade_categories: [{ id: '1', name: 'Carpentry', icon_slug: 'hammer' }],
};

beforeEach(() => {
  (api.getProfile as jest.Mock).mockReset().mockResolvedValue(mockProfile);
  (api.updateProfile as jest.Mock).mockReset().mockResolvedValue(undefined);
});

describe('ProfileScreen', () => {
  it('pre-populates form fields from profile', async () => {
    const { findByTestId } = render(<ProfileScreen />);
    const nameInput = await findByTestId('display-name-input');
    expect(nameInput.props.value).toBe('Bob the Builder');
    const rateInput = await findByTestId('base-rate-input');
    expect(rateInput.props.value).toBe('75');
  });

  it('calls updateProfile with edited values on save', async () => {
    const { findByTestId } = render(<ProfileScreen />);
    const nameInput = await findByTestId('display-name-input');
    fireEvent.changeText(nameInput, 'Bob Updated');
    fireEvent.press(await findByTestId('save-button'));
    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ display_name: 'Bob Updated' })
      )
    );
  });

  it('shows success message after save', async () => {
    const { findByTestId, findByText } = render(<ProfileScreen />);
    fireEvent.press(await findByTestId('save-button'));
    await findByText('Saved!');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd mobile && npx jest __tests__/ProfileScreen.test.tsx
```
Expected: FAIL — `Cannot find module '@/screens/profile/ProfileScreen'`

- [ ] **Step 3: Create `src/screens/profile/ProfileScreen.tsx`**

```tsx
import React, { useCallback, useState } from 'react';
import {
  ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as api from '@/api/client';
import { STATIC_TRADE_CATEGORIES } from '@/lib/constants';
import type { RateUnit } from '@/lib/types';

export function ProfileScreen() {
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [baseRate, setBaseRate] = useState('');
  const [rateUnit, setRateUnit] = useState<RateUnit>('per_hour');
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.getProfile().then((p) => {
        setDisplayName(p.display_name);
        setBio(p.bio ?? '');
        setBaseRate(p.base_rate != null ? String(p.base_rate) : '');
        setRateUnit(p.base_rate_unit ?? 'per_hour');
        setSelectedCatIds(p.trade_categories.map((c) => c.id));
      }).catch(() => {});
    }, []),
  );

  function toggleCategory(id: string) {
    setSelectedCatIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await api.updateProfile({
        display_name: displayName,
        bio: bio || undefined,
        base_rate: baseRate ? parseFloat(baseRate) : undefined,
        base_rate_unit: rateUnit,
        category_ids: selectedCatIds,
      });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Display Name</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Your name"
        testID="display-name-input"
      />

      <Text style={styles.sectionTitle}>Bio</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={bio}
        onChangeText={setBio}
        placeholder="Tell customers about yourself"
        multiline
        testID="bio-input"
      />

      <Text style={styles.sectionTitle}>Base Rate</Text>
      <View style={styles.rateRow}>
        <TextInput
          style={[styles.input, styles.rateInput]}
          value={baseRate}
          onChangeText={setBaseRate}
          placeholder="0.00"
          keyboardType="decimal-pad"
          testID="base-rate-input"
        />
        <View style={styles.unitToggle}>
          {(['per_hour', 'per_job'] as RateUnit[]).map((unit) => (
            <TouchableOpacity
              key={unit}
              onPress={() => setRateUnit(unit)}
              style={[styles.unitOption, rateUnit === unit && styles.unitOptionActive]}
              testID={`rate-unit-${unit}`}
            >
              <Text style={[styles.unitText, rateUnit === unit && styles.unitTextActive]}>
                {unit === 'per_hour' ? '/hr' : '/job'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Trade Categories</Text>
      <View style={styles.categories}>
        {STATIC_TRADE_CATEGORIES.map((cat) => {
          const selected = selectedCatIds.includes(cat.id);
          return (
            <TouchableOpacity
              key={cat.id}
              onPress={() => toggleCategory(cat.id)}
              style={[styles.chip, selected && styles.chipActive]}
              testID={`category-chip-${cat.id}`}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>Saved!</Text> : null}

      <TouchableOpacity
        style={[styles.saveButton, loading && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={loading}
        testID="save-button"
      >
        <Text style={styles.saveButtonText}>{loading ? 'Saving…' : 'Save'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginTop: 20, marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  rateRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  rateInput: { flex: 1 },
  unitToggle: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  unitOption: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff' },
  unitOptionActive: { backgroundColor: '#2563eb' },
  unitText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  unitTextActive: { color: '#fff' },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#475569' },
  chipTextActive: { color: '#fff' },
  error: { color: '#dc2626', fontSize: 13, marginTop: 12 },
  success: { color: '#16a34a', fontSize: 13, marginTop: 12 },
  saveButton: { marginTop: 24, backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && npx jest __tests__/ProfileScreen.test.tsx
```
Expected: `Tests: 3 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/profile/ mobile/__tests__/ProfileScreen.test.tsx
git commit -m "feat(mobile): add ProfileScreen with rate, bio, and category editing"
```

---

## Task 14: Full Test Run and Verify

- [ ] **Step 1: Run all tests**

```bash
cd mobile && npx jest
```
Expected: All test suites pass. Zero failures.

- [ ] **Step 2: Check TypeScript compiles cleanly**

```bash
cd mobile && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Final commit**

```bash
git add mobile/
git commit -m "feat(mobile): contractor app complete — all tests passing"
```
