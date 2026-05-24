# Contractor App — Design Specification
**Date:** 2026-05-23
**Status:** Approved

## Overview

React Native (Expo) mobile app for contractors on the Knect platform. Contractors use this app to toggle their availability, receive and respond to job requests in real time, submit quotes, manage their job queue, and edit their profile and rates.

Targets iOS and Android from a single codebase using the Expo managed workflow.

---

## Scope

Five features in this build:

1. Authentication (email/password + auto-login via stored refresh token)
2. Availability toggle + foreground GPS location broadcasting
3. Live job request flow (receive → accept/deny → quote → complete)
4. Job queue and history
5. Profile management (name, bio, rate, trade categories)

**Out of scope for this build:** FCM push notifications (stubbed), background location tracking, contractor earnings/invoicing, biometric unlock.

---

## Navigation Structure

Root navigator is a stack with two branches gated by auth state:

```
RootNavigator (Stack)
├── LoginScreen                   ← unauthenticated
└── TabNavigator                  ← authenticated
    ├── Home (Stack)
    │   ├── HomeScreen
    │   └── JobRequestDetailScreen
    ├── Jobs (Stack)
    │   ├── JobsScreen
    │   └── JobDetailScreen
    └── Profile (Stack)
        └── ProfileScreen
```

**Tab bar — three tabs:**

| Tab | Icon | Purpose |
|---|---|---|
| Home | bolt / lightning | Availability toggle + live incoming requests |
| Jobs | briefcase | Active job queue + history |
| Profile | person | Profile, rates, trade categories |

---

## Auth Flow

1. On cold start, read `refresh_token` from `expo-secure-store`.
2. If present, call `POST /auth/refresh`. On success, store new tokens and navigate to the tab bar. On failure (expired/invalid), clear storage and show Login.
3. If absent, show Login.
4. Login form calls `POST /auth/login`. On success, persist both tokens to SecureStore and navigate to the tab bar.
5. Logout clears SecureStore and navigates back to Login.
6. `api/client.ts` intercepts 401 responses, attempts one silent token refresh, retries the original request. If the refresh itself fails, triggers logout.

Tokens are stored under keys `knect_access_token` and `knect_refresh_token` in SecureStore.

---

## Screens

### LoginScreen

- Email + password fields, "Sign in" button.
- Inline error message below the form on failure.
- No register flow — contractors are onboarded externally for MVP.

### HomeScreen

**Top section — Availability:**
- Toggle switch labeled "Available for work" / "Not available".
- Toggle is disabled with message "Enable location to go available" if GPS permission is denied or unavailable.
- On toggle-on: request foreground location permission if not yet granted, get initial GPS fix, start 5-second interval calling `POST /location`. On toggle-off: clear interval, call `POST /contractor/availability { available: false }`.
- Calls `POST /contractor/availability { available: true/false }` on every toggle.

**Bottom section — Incoming Requests:**
- List of `JobRequestCard` components, populated from `job_requested` WebSocket events.
- Each card shows: job description, distance/location, timestamp.
- Tapping a card navigates to `JobRequestDetailScreen`.
- Cards are removed when a `job_cancelled` event arrives for that job ID.
- Empty state: "No pending requests" placeholder.

**Reconnecting banner:**
- Persistent banner at top of screen when WebSocket is disconnected: "Reconnecting…". Dismisses automatically on reconnect.

### JobRequestDetailScreen

- Full job details: description, location address.
- Two buttons: **Accept** and **Deny**.
- Accept calls `POST /jobs/:id/respond { action: "accept" }` → on success, navigates back to Home and adds job to the Jobs tab queue.
- Deny calls `POST /jobs/:id/respond { action: "deny" }` → on success, navigates back and removes the card.
- 409 response: toast "This request is no longer available", navigate back and remove card.

### JobsScreen

- Flat list of jobs from `GET /contractor/jobs` (pending + active).
- Each row: job description (truncated), status badge, timestamp.
- Tapping a row navigates to `JobDetailScreen`.
- Refreshes on tab focus via `useFocusEffect`.
- Empty state: "No active jobs".

### JobDetailScreen

- Full job details: description, location, status, created timestamp.
- **Quote section** (shown when status is `accepted` or `in_progress`):
  - Optional custom amount field and note field.
  - "Submit Quote" button → `POST /jobs/:id/quote`.
  - If a quote already exists, fields are pre-populated and button shows "Update Quote".
- **Complete button** (shown when status is `accepted` or `in_progress`):
  - "Mark Complete" → `POST /jobs/:id/complete` → on success, navigate back to JobsScreen.
- Status-only view for `completed`, `denied`, `cancelled` jobs (no actions).

### ProfileScreen

- Form pre-populated from `GET /contractor/profile` on mount.
- Fields: display name, bio (multiline), base rate (numeric), rate unit (per_hour / per_job picker), trade categories (multi-select from a static list for MVP).
- "Save" button → `PUT /contractor/profile`.
- Inline success/error feedback below the form.

---

## State Management

### AuthContext

```
{
  accessToken: string | null,
  userId: string | null,
  isLoading: boolean,          // true during cold-start token check
  login(email, password): Promise<void>,
  logout(): void,
}
```

Wraps the root navigator. `isLoading: true` renders a splash/loading screen to prevent flash of Login during auto-login.

### WsContext

```
{
  connected: boolean,
  subscribe(eventType, callback): () => void,   // returns unsubscribe fn
}
```

Opens the WebSocket connection once `accessToken` is set. Reconnects with exponential backoff (1s initial, 2× multiplier, 30s cap). Screens call `subscribe` on mount and invoke the returned unsubscribe on unmount.

**Subscriptions by screen:**
- `HomeScreen` subscribes to `job_requested`, `job_cancelled`
- `JobRequestDetailScreen` subscribes to `job_cancelled` (to handle race)
- `JobDetailScreen` subscribes to `job_accepted`, `job_completed`, `job_cancelled`

### Local screen state

All job/profile data is fetched and held in local `useState` per screen. No shared job state between tabs. Each tab fetches fresh data on focus via `useFocusEffect`.

---

## API Client (`src/api/client.ts`)

Typed functions over plain `fetch`. Single `apiFetch(path, options)` base:

1. Reads access token from `AuthContext`.
2. Makes request with `Authorization: Bearer <token>`.
3. On 401: calls `/auth/refresh`, updates stored tokens, retries once.
4. On second 401: calls `logout()`.
5. On non-2xx: throws `ApiError` with `{ code, message, status }` matching the backend envelope.

Exported functions mirror the backend routes:
- `api.login(email, password)`
- `api.getProfile()`
- `api.updateProfile(data)`
- `api.setAvailability(available)`
- `api.updateLocation(lat, lng)`
- `api.listJobs()`
- `api.respondToJob(id, action)`
- `api.submitQuote(id, data)`
- `api.completeJob(id)`

---

## Location Loop

Lives in `HomeScreen`. Not a context.

```
useEffect(() => {
  if (!isAvailable) return;
  const id = setInterval(async () => {
    const pos = await Location.getCurrentPositionAsync({});
    api.updateLocation(pos.coords.latitude, pos.coords.longitude);
  }, 5000);
  return () => clearInterval(id);
}, [isAvailable]);
```

Location permission is requested once before the first toggle-on. If denied, the toggle is blocked.

---

## Error Handling

| Scenario | Handling |
|---|---|
| Stored refresh token expired on cold start | Silent — clear storage, show Login |
| Login failure | Inline error below form |
| GPS permission denied | Block availability toggle, show inline message |
| GPS unavailable | Same — do not start interval |
| 409 on job respond | Toast "This request is no longer available", remove card, navigate back |
| Network error on action | Inline error with retry button on the relevant screen |
| Token refresh failure mid-action | Logout immediately, redirect to Login |
| WebSocket disconnected | "Reconnecting…" banner on HomeScreen |

---

## File Structure

```
mobile/
├── app.json
├── babel.config.js
├── tsconfig.json
├── package.json
├── App.tsx                          ← providers + RootNavigator
├── src/
│   ├── api/
│   │   └── client.ts
│   ├── context/
│   │   ├── AuthContext.tsx
│   │   └── WsContext.tsx
│   ├── navigation/
│   │   ├── RootNavigator.tsx
│   │   └── TabNavigator.tsx
│   ├── screens/
│   │   ├── auth/
│   │   │   └── LoginScreen.tsx
│   │   ├── home/
│   │   │   ├── HomeScreen.tsx
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
│       └── types.ts
└── __tests__/
    ├── AuthContext.test.tsx
    ├── WsContext.test.tsx
    ├── api-client.test.ts
    ├── HomeScreen.test.tsx
    ├── JobsScreen.test.tsx
    └── ProfileScreen.test.tsx
```

---

## Testing Strategy

**Jest + React Native Testing Library.**

| Test file | What it covers |
|---|---|
| `AuthContext.test.tsx` | Auto-login flow, login action, logout, 401 refresh retry |
| `WsContext.test.tsx` | Subscribe/unsubscribe, reconnect backoff |
| `api-client.test.ts` | Request construction, 401 retry, error propagation |
| `HomeScreen.test.tsx` | Availability toggle state, incoming request card render, reconnecting banner |
| `JobsScreen.test.tsx` | List render, empty state, focus refetch |
| `ProfileScreen.test.tsx` | Form population from API response, save action |

**Not tested in this build:** E2E (no Detox/Maestro), navigation flows, location interval timer.

---

## Dependencies

| Package | Purpose |
|---|---|
| `expo` | Managed workflow runtime |
| `expo-secure-store` | Persist JWT tokens |
| `expo-location` | Foreground GPS |
| `@react-navigation/native` | Navigation core |
| `@react-navigation/native-stack` | Stack navigator |
| `@react-navigation/bottom-tabs` | Tab bar navigator |
| `react-native-safe-area-context` | Safe area insets |
| `react-native-screens` | Native screen optimization |
| `@testing-library/react-native` | Component tests |
| `jest-expo` | Jest preset for Expo |
