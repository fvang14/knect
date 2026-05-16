# Knect — Design Specification
**Date:** 2026-05-16
**Status:** Approved

## Overview

Knect is an on-demand platform that connects customers with nearby private contractors. Customers browse available contractors on a map, send job requests, receive quotes, and rate completed work. Contractors manage their availability, accept or deny incoming requests, and submit custom quotes — all from a dedicated mobile app.

---

## Clients

Three separate applications, each scoped to a single user type:

| App | Platform | Users |
|---|---|---|
| Contractor App | React Native (iOS + Android) | Contractors / Professionals |
| Customer Web | Next.js | Customers |
| Admin Console | Next.js (separate app) | Developer / Admins |

**Contractor App responsibilities:** Toggle availability, receive and respond to job requests, submit custom quotes, view job queue, manage profile and rates.

**Customer Web responsibilities:** Browse map of nearby available contractors (login required), send job requests, view quotes, track job status, rate contractors after completion.

**Admin Console responsibilities:** Monitor all active jobs, manage user accounts (suspend contractors/customers), view system metrics.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                              Clients                                │
│                                                                     │
│  React Native (iOS/Android)   Next.js (Web)    Next.js (Admin)      │
│  ── Contractors only ──       ── Customers ──  ── Dev/Admin ──      │
└──────────┬───────────────────────────┬──────────────┬──────────────┘
           │                           │              │
           │        REST + WebSocket   │              │ REST (admin-scoped JWT)
           ▼                           ▼              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Rust API Server (Axum / Tokio)                    │
│  • REST API (auth, jobs, quotes, profiles, ratings, admin)          │
│  • WebSocket hub (location broadcasting + job events)               │
│  • FCM push notification dispatch                                   │
│  • JWT authentication (role-based: contractor | customer | admin)   │
└──────┬────────────────────────┬──────────────────────────────────-──┘
       ▼                        ▼
┌─────────────┐        ┌────────────────┐
│ PostgreSQL  │        │     Redis      │
│ + PostGIS   │        │ pub/sub + cache│
└─────────────┘        └────────────────┘
```

### Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Backend | Rust (Axum + Tokio) | High-concurrency async, WebSocket support, type safety |
| Mobile | React Native (Expo) | iOS + Android from one codebase |
| Web / Admin | Next.js | React ecosystem, SSR for map SEO |
| Database | PostgreSQL + PostGIS | Relational + geospatial proximity queries |
| Cache / Pub-Sub | Redis | Live location broadcasting, contractor position cache |
| Push Notifications | Firebase Cloud Messaging (FCM) | Unified push for Android + iOS (APNs via FCM) |
| Maps | Mapbox | Customizable, fair pricing, strong React Native SDK |

---

## Data Model

```sql
users
  id, email, phone, password_hash,
  role (contractor | customer | admin),
  created_at, suspended_at

contractor_profiles
  user_id (FK → users),
  display_name, bio,
  base_rate, base_rate_unit (per_hour | per_job),
  is_available (bool),   -- contractor toggled on
  is_busy (bool),        -- currently on an active job
  current_lat, current_lng, location_updated_at,
  avg_rating, rating_count

contractor_trade_categories          -- join table (replaces text[] array)
  contractor_id (FK → contractor_profiles),
  category_id (FK → trade_categories)

customer_profiles
  user_id (FK → users),
  display_name

jobs
  id, customer_id (FK), contractor_id (FK),
  status (pending | accepted | denied | in_progress | completed | cancelled),
  description,
  location_lat, location_lng, location_address,
  created_at, updated_at

quotes                               -- informational; attached after accept
  id, job_id (FK), contractor_id (FK),
  base_rate_snapshot,
  custom_amount, custom_note,        -- optional override, customer cannot reject
  created_at

ratings
  id, job_id (FK), contractor_id (FK), customer_id (FK),
  score (1–5), review_text, created_at

trade_categories
  id, name, icon_slug
```

### Job State Machine

```
pending → accepted → in_progress → completed
        → denied
        → cancelled   (customer cancels before contractor accepts)
```

---

## Real-Time & WebSocket Flow

### Location Channel (customer web subscribes)

```
Contractor app → POST /location (every 5s while available)
  → Rust writes to Redis "contractor:{id}:pos"
  → Redis pub/sub broadcasts to all subscribed customer WebSocket connections
  → Customer map updates contractor pin in real-time
```

Contractor position is written to `contractor_profiles` periodically as last-known fallback. Redis keys carry a TTL — if a contractor disconnects without toggling off, their pin fades from the map when the TTL expires.

### Job Events Channel (both apps subscribe)

```
Customer sends request
  → POST /jobs → DB write → WS event pushed to contractor app
  → Contractor sees notification + request details

Contractor accepts/denies
  → POST /jobs/:id/respond → DB update
  → WS event pushed to customer
  → If accepted: contractor is_busy = true, still visible on map as "busy"

Job completed
  → POST /jobs/:id/complete → DB update
  → Contractor is_busy = false (available again if they re-toggle)
  → Customer prompted to submit rating
```

### Backgrounded App Fallback

When the recipient app is backgrounded, FCM push fires instead of WebSocket delivery. Client handles both paths with identical event payloads — no special-casing needed.

### WebSocket Authentication

JWT passed as query param on upgrade handshake: `wss://api.knect.app/ws?token=...`
Axum middleware validates the token before accepting the connection.

---

## API Structure

### Auth
```
POST /auth/register        — create account (role: contractor | customer)
POST /auth/login           — returns JWT + refresh token
POST /auth/refresh         — exchange refresh token for new JWT
```

### Contractor (mobile app)
```
GET  /contractor/profile          — own profile
PUT  /contractor/profile          — update bio, rates, trade categories
POST /contractor/availability     — toggle available { available: bool }
POST /location                    — push current lat/lng (every 5s)
GET  /contractor/jobs             — job queue (pending + active)
POST /jobs/:id/respond            — { action: "accept" | "deny" }
POST /jobs/:id/quote              — send custom quote
POST /jobs/:id/complete           — mark job done
```

### Customer (web app)
```
GET  /contractors/nearby          — PostGIS ST_DWithin query, returns contractors within radius (auth required)
GET  /contractors/:id             — public profile + ratings
POST /jobs                        — create job request
GET  /jobs/:id                    — job status + quote details
DELETE /jobs/:id                  — cancel (only while status = pending)
POST /jobs/:id/rating             — submit rating (only after status = completed)
```

### Admin (admin console)
```
GET  /admin/users                 — list all users, filterable by role/status
PUT  /admin/users/:id/suspend     — suspend account
GET  /admin/jobs                  — all jobs, filterable by status/date
GET  /admin/metrics               — active contractors, jobs today, avg rating
```

All endpoints require a valid JWT. Admin endpoints additionally check `role: admin` in JWT claims and return 403 otherwise.

---

## Error Handling

All API errors return a consistent JSON envelope:
```json
{
  "error": "job_not_found",
  "message": "Job does not exist or you lack access",
  "status": 404
}
```

Key error scenarios handled explicitly:

| Scenario | Handling |
|---|---|
| Contractor goes offline mid-request | Job auto-cancelled, customer notified via push |
| Customer requests a busy contractor | Request queued, contractor sees it in job screen |
| WebSocket disconnects | Client reconnects with exponential backoff; server replays last known state on reconnect |
| Location update fails | Last known position retained in Redis with TTL; contractor remains visible until TTL expires |
| Customer cancels after accepted | Not allowed — status locked after acceptance |

---

## Testing Strategy

| Layer | Approach |
|---|---|
| Rust business logic | Unit tests on job state machine transitions, quote validation, JWT auth |
| API endpoints | Integration tests using `sqlx` test transactions (rolled back after each test) |
| Geospatial queries | Integration tests with seeded PostGIS data |
| WebSocket flows | Integration tests using Axum's built-in test client |
| React Native | Jest + React Testing Library for core screens |
| Next.js web/admin | Jest unit tests + Playwright E2E for critical flows (request, track, rate) |

No database mocking in backend tests — all tests run against a real Postgres instance via Docker Compose.

---

## Out of Scope (MVP)

- In-app payments — customers and contractors settle externally
- Contractor verification / verified badge — self-reported at launch, formal verification and badge system added in a later phase
- Customer ratings / reputation — customers are not rated in MVP
- Chat / messaging between customer and contractor
- Contractor earnings history / invoicing
