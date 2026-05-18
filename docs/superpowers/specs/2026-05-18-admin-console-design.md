# Knect Admin Console — Design Specification
**Date:** 2026-05-18
**Status:** Approved

## Overview

A Next.js 14 App Router admin console that gives developers and admins visibility into all platform activity and control over user accounts. The app lives at `admin/` in the monorepo and deploys as a Docker container on the same Linux server as the API, exposed on port 3001.

---

## Architecture

```
admin/
├── app/
│   ├── login/              page.tsx + server action (POST /auth/login)
│   ├── (dashboard)/        layout.tsx (auth guard + sidebar) + page.tsx (metrics)
│   │   ├── jobs/           page.tsx (jobs table)
│   │   └── users/          page.tsx (users table + suspend)
│   └── api/
│       └── logout/         route.ts (clears JWT cookie)
├── lib/
│   └── api.ts              typed fetch wrapper that reads JWT cookie server-side
├── components/             shadcn/ui components (Radix UI + Tailwind CSS)
├── middleware.ts            redirects unauthenticated requests → /login
├── Dockerfile
└── next.config.ts
```

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| UI | shadcn/ui (Radix UI + Tailwind CSS) |
| Auth | httpOnly cookie holding the Axum-issued JWT |
| Data fetching | Server components + server actions |
| Containerization | Docker (node:20-alpine, standalone output) |

---

## Auth Flow

1. Admin submits email + password on `/login`
2. A server action forwards credentials to `POST /auth/login` on the Axum API
3. On success, the server action sets an httpOnly, SameSite=Strict cookie containing the JWT
4. Next.js middleware checks for the cookie on every request; missing → redirect to `/login`
5. All server components read the JWT from the cookie and pass it as `Authorization: Bearer` to Axum API calls — the token never reaches client-side JavaScript
6. Logout clears the cookie via `GET /api/logout` (a Next.js route handler)

The Axum API enforces `role: admin` on all `/admin/*` routes and returns 403 for any non-admin JWT. No duplicate role check is needed in Next.js.

A `JWT_COOKIE_SECRET` env var signs the cookie to prevent client-side tampering.

---

## Pages

### `/login`
Email + password form. Server action POSTs to Axum, sets cookie, redirects to `/`. No client-side JS required.

### `/` — Metrics Dashboard
Three stat cards from `GET /admin/metrics`:
- Active contractors currently online
- Jobs created today
- Platform average rating

### `/jobs` — Jobs Table
Columns: ID (truncated UUID), customer, contractor, status badge, created date.
Filters: status, date range — implemented as URL search params (bookmarkable, works without JS).
Data from `GET /admin/jobs?status=&date=`.

### `/users` — Users Table
Columns: email, role badge, created date, suspended status.
Filter: role, suspended.
Suspend action: server action → `PUT /admin/users/:id/suspend` → revalidates page.
Data from `GET /admin/users?role=&status=`.

### Shared Layout (`(dashboard)/layout.tsx`)
Sidebar nav: Dashboard / Jobs / Users. Logout button. Wraps all authenticated routes. Auth guard redirects to `/login` if cookie is absent.

---

## Data Flow

```
Browser → Next.js server component
       → reads JWT from httpOnly cookie
       → fetch to Axum API (internal Docker network: http://api:3000)
       → returns typed JSON
       → renders HTML
       → sends HTML to browser
```

No client-side fetching. No loading spinners. No token in browser memory.

Mutations (suspend user) use Next.js server actions:
```
Browser form submit → server action → PUT /admin/users/:id/suspend → revalidatePath("/users")
```

---

## Deployment

### Dockerfile (`admin/Dockerfile`)
Multi-stage build:
- `node:20-alpine` build stage: `npm ci` + `next build` with `output: 'standalone'`
- `node:20-alpine` runtime: copies `.next/standalone` only

### docker-compose.prod.yml additions
New `admin` service added to the existing compose file:
```yaml
admin:
  build: ../admin
  ports:
    - "3001:3001"
  environment:
    API_URL: http://api:3000
    JWT_COOKIE_SECRET: ${JWT_COOKIE_SECRET}
    PORT: "3001"
  depends_on:
    - api
  restart: unless-stopped
```

`API_URL` uses the internal Docker bridge hostname — traffic between Next.js and Axum never leaves the machine.

### New env vars (added to `backend/.env.example`)
```
JWT_COOKIE_SECRET=     # signs the admin httpOnly cookie
```

### deploy.sh
Unchanged — `docker compose up --build -d` rebuilds all services including the new `admin` container.

---

## Error Handling

| Scenario | Handling |
|---|---|
| Invalid credentials | Server action returns error message, re-renders login form |
| Expired JWT | Middleware detects missing/invalid cookie, redirects to `/login` |
| 403 from API | Shown as an error page ("Access denied — admin role required") |
| API unreachable | Next.js error boundary shows a generic "Something went wrong" page |

---

## Out of Scope

- Unsuspending users (not in the API spec)
- Real-time metrics updates (page refresh is sufficient for an admin tool)
- Role management beyond suspend
- Audit log of admin actions
