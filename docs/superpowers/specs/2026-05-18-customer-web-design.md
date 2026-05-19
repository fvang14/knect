# Customer Web App — Design Specification
**Date:** 2026-05-18
**Status:** Approved

## Overview

The Customer Web App is a Next.js 14 web application for customers to browse nearby available contractors on a live Mapbox map, send job requests, track job status in real-time via WebSocket, and rate contractors after job completion. It is a separate application from the Admin Console, living in the `web/` directory alongside `admin/`.

---

## Architecture

```
web/                        — Next.js 14 (App Router), port 3000
├── app/
│   ├── login/              — login page + server action
│   ├── register/           — registration page + server action
│   ├── jobs/               — job history list (server component)
│   ├── api/
│   │   ├── session/        — GET: returns { access_token } from iron-session
│   │   ├── refresh/        — POST: exchanges refresh token, updates session
│   │   └── logout/         — POST: clears session, redirects to /login
│   └── page.tsx            — protected: full-screen map shell
├── components/
│   ├── providers/          — AuthProvider, MapProvider, JobProvider
│   ├── map/                — MapView, contractor pin rendering
│   ├── panels/             — ContractorPanel, JobStatusPanel, RatingPanel
│   └── ui/                 — Navbar, shared primitives
└── lib/
    ├── api.ts              — typed fetch wrapper with 401 → refresh → retry
    ├── session.ts          — iron-session config
    └── ws.ts               — WebSocket hook with exponential backoff
```

**Tech stack:** Next.js 14, TypeScript, Tailwind CSS, iron-session, Mapbox GL JS (`mapbox-gl`).

---

## Routes

| Route       | Type      | Description                                      |
|-------------|-----------|--------------------------------------------------|
| `/login`    | Public    | Email/password login; link to `/register`        |
| `/register` | Public    | Customer registration; POST /auth/register (role: customer) |
| `/`         | Protected | Full-screen map shell with slide-in panels       |
| `/jobs`     | Protected | Job history list (all customer jobs, newest first) |

Unauthenticated requests to protected routes redirect to `/login`. Authenticated users visiting `/login` or `/register` redirect to `/`.

---

## Auth Flow

1. **Login/Register** — Server Action calls `POST /auth/login` or `POST /auth/register`. On success, stores `access_token` and `refresh_token` in an iron-session httpOnly cookie. Redirects to `/`.
2. **Session hydration** — On client mount, `AuthProvider` fetches `GET /api/session` to retrieve `access_token` into React context (in-memory only; never persisted to localStorage).
3. **Token refresh** — When any API call returns 401, `lib/api.ts` calls `POST /api/refresh`, which calls `POST /auth/refresh`, updates the iron-session cookie, and returns the new `access_token`. The original request is retried once. If the refresh also fails, the user is redirected to `/login`.
4. **Logout** — `POST /api/logout` clears the iron-session cookie and redirects to `/login`.

---

## Client State (Providers)

Three React context providers are nested at the root of the protected layout:

### `AuthProvider`
- Fetches `access_token` from `/api/session` on mount.
- Exposes `{ token, refreshToken() }` to the tree.
- Opens the WebSocket connection once the token is available (via `useWebSocket`).

### `MapProvider`
- Holds `contractors: Map<string, { lat: number; lng: number }>`.
- Updated by WebSocket `snapshot` (initial bulk load) and `location_update` events.
- Exposes `{ contractors }` to `MapView`.

### `JobProvider`
- Holds `activeJob: { id, status, quote } | null`.
- Updated by WebSocket events: `job_accepted`, `job_denied`, `job_completed`, `job_cancelled`.
- Exposes `{ activeJob, setActiveJob }` to panels and `JobStatusPanel`.

---

## WebSocket

A single `useWebSocket` hook (called inside `AuthProvider`) manages the connection:

```
wss://api.knect.app/ws?token=<access_token>
```

- On connect: server sends a `snapshot` event with all current contractor positions.
- On message: dispatches to `MapProvider` or `JobProvider` based on `event.type`.
- On disconnect: reconnects with exponential backoff (1s, 2s, 4s, … capped at 30s). A "reconnecting…" banner is shown to the user.
- On reconnect: server automatically sends a fresh `snapshot`.

**WebSocket event types received by customers:**

| Event              | Payload                              | Handler         |
|--------------------|--------------------------------------|-----------------|
| `snapshot`         | `{ contractors: ContractorPosition[] }` | `MapProvider`   |
| `location_update`  | `{ contractor_id, lat, lng }`        | `MapProvider`   |
| `job_accepted`     | `{ job_id }`                         | `JobProvider`   |
| `job_denied`       | `{ job_id }`                         | `JobProvider`   |
| `job_completed`    | `{ job_id }`                         | `JobProvider`   |
| `job_cancelled`    | `{ job_id }`                         | `JobProvider`   |

---

## Components

### `MapView`
- Client component wrapping Mapbox GL JS.
- Uses two data sources that serve different roles:
  - **Position layer** (`MapProvider`, WebSocket) — live `{ contractor_id, lat, lng }` for all contractors with a cached Redis position. This is the source of truth for pin location.
  - **Availability layer** (periodic fetch) — `GET /contractors/nearby` is called on mount and re-fetched every 30s. Returns only non-busy, available contractors with full profile data. The set of IDs returned by this call defines which pins are "available" (primary color, clickable) vs "busy" (muted, not clickable). Any WS position whose ID is absent from the nearby list is rendered as a busy pin.
- On mount: calls `navigator.geolocation.getCurrentPosition()`. Coordinates center the map and seed the nearby query. If geolocation is denied, falls back to default coordinates set via `NEXT_PUBLIC_DEFAULT_LAT` / `NEXT_PUBLIC_DEFAULT_LNG` env vars.
- Clicking an available (non-busy) contractor pin opens `ContractorPanel`.

### `ContractorPanel`
- Slide-in drawer from the right.
- Fetches `GET /contractors/:id` for full profile (name, bio, rating, rate, trade categories).
- Contains the job request form: description textarea + submit button.
- On submit: `POST /jobs` → if successful, `JobProvider.setActiveJob({ id, status: 'pending' })` and closes the panel, opening `JobStatusPanel`.
- Inline error display (e.g. contractor no longer available).
- Closes on outside click or ESC.

### `JobStatusPanel`
- Slide-in drawer shown when `JobProvider.activeJob` is non-null and not yet rated.
- Displays: job status badge, contractor name, description, quote details (if `job_accepted` and a quote exists, fetched via `GET /jobs/:id`).
- Cancel button visible only when status is `pending`; calls `DELETE /jobs/:id`.
- When status becomes `completed`, transitions to `RatingPanel`.

### `RatingPanel`
- Replaces `JobStatusPanel` content when job is completed and unrated.
- Star selector (1–5) + optional review text textarea.
- On submit: `POST /jobs/:id/rating`. On success, clears `activeJob` and closes the panel.

### `Navbar`
- Fixed top bar: Knect logo (left), "My Jobs" link to `/jobs`, logout button (right).
- Shown on all protected pages.

### `/jobs` page
- Server component: reads session token, fetches `GET /jobs` (see Backend Change below).
- Renders a list of jobs with: status badge, contractor name, job description, date.
- Completed-unrated jobs show a "Leave a rating" link: `/?rate=<job_id>`. The map page reads the `rate` query param on mount; if present and the job is completed and unrated, it sets `activeJob` in `JobProvider` and renders `RatingPanel` immediately.

---

## Backend Change Required

The existing backend has no customer-scoped job list endpoint. The following must be added to the Rust backend as part of this work:

```
GET /jobs    — returns all jobs for the authenticated customer, ordered by created_at DESC
```

Response: array of `JobDetail` (same shape as `GET /jobs/:id`).

---

## Error Handling

| Scenario | Handling |
|---|---|
| API 401 | Auto-refresh token, retry once; redirect to `/login` on second failure |
| WebSocket disconnect | Exponential backoff reconnect; "reconnecting…" banner |
| Geolocation denied | Fall back to default lat/lng env vars; show dismissable location banner |
| Job request fails | Inline error in `ContractorPanel` |
| Job auto-cancelled (contractor offline) | `job_cancelled` WS event → `JobProvider` updates → UI shows "Job cancelled — contractor went offline" |
| Contractor already busy on request | Inline error from API 409 response |

---

## Testing

| Layer | Approach |
|---|---|
| `JobProvider` | Jest unit tests for all state transitions (pending → accepted → in_progress → completed, denied, cancelled) |
| `AuthProvider` | Jest unit tests for token refresh logic and 401 retry behavior |
| `RatingPanel` | Jest + RTL: score validation (1–5), submit, already-rated state |
| E2E — happy path | Playwright: register → login → browse map → click contractor → request job → receive accepted → job completes → submit rating |
| E2E — cancel flow | Playwright: login → request job → cancel while pending |
| E2E — job history | Playwright: login → navigate to /jobs → verify past jobs list |
| E2E setup | Docker Compose with real Postgres + Redis (consistent with backend test strategy) |

---

## Environment Variables

```
NEXT_PUBLIC_MAPBOX_TOKEN=        — Mapbox public access token
NEXT_PUBLIC_API_URL=             — backend base URL (e.g. http://localhost:8080)
NEXT_PUBLIC_WS_URL=              — WebSocket URL (e.g. ws://localhost:8080)
NEXT_PUBLIC_DEFAULT_LAT=         — fallback map center latitude
NEXT_PUBLIC_DEFAULT_LNG=         — fallback map center longitude
SESSION_SECRET=                  — iron-session encryption secret (32+ chars)
```

---

## Out of Scope

- In-app payments
- Customer ratings / reputation
- Chat between customer and contractor
- Job history filtering / pagination (list is unfiltered for MVP)
- Push notifications (FCM) — separate implementation phase
