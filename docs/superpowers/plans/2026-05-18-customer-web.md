# Customer Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Knect customer web app — a Next.js 14 application where customers browse nearby contractors on a live Mapbox map, send job requests, track status via WebSocket, and rate contractors after completion.

**Architecture:** New `web/` Next.js 14 (App Router) app alongside `admin/`. Auth uses iron-session (httpOnly cookie) storing `access_token` + `refresh_token`; the client retrieves `access_token` via `/api/session` for in-memory use (WebSocket auth + API calls). State lives in a single `Providers` client component composing three React contexts (auth, map contractors, active job), driven by a pure `applyWsEvent` reducer that handles all WebSocket events and is unit-tested in isolation.

**Tech Stack:** Next.js 14.2.5, TypeScript 5, Tailwind CSS 3, iron-session 8, mapbox-gl 3, Jest 29, React Testing Library 16, Playwright 1.45.

---

## File Map

**Backend (modified):**
```
backend/src/customer/handlers.rs   — add CustomerJobListItem + list_jobs handler
backend/src/lib.rs                 — register GET /jobs route
```

**Frontend (new `web/` directory):**
```
web/
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── middleware.ts
├── jest.config.js
├── jest.setup.ts
├── playwright.config.ts
├── .env.local.example
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── login/
│   │   ├── page.tsx
│   │   └── actions.ts
│   ├── register/
│   │   ├── page.tsx
│   │   └── actions.ts
│   ├── (protected)/
│   │   ├── layout.tsx          — Providers + Navbar wrapper
│   │   ├── page.tsx            — map shell
│   │   └── jobs/
│   │       └── page.tsx        — server component: job history
│   └── api/
│       ├── session/route.ts    — GET → { access_token }
│       ├── refresh/route.ts    — POST → refresh + update session
│       └── logout/route.ts     — GET → destroy + redirect
├── components/
│   ├── providers/
│   │   └── providers.tsx       — Providers client component + all context exports
│   ├── map/
│   │   └── map-view.tsx        — Mapbox GL JS client component
│   ├── panels/
│   │   ├── contractor-panel.tsx
│   │   ├── job-status-panel.tsx
│   │   └── rating-panel.tsx
│   └── ui/
│       ├── navbar.tsx
│       └── reconnecting-banner.tsx
├── lib/
│   ├── session.ts              — iron-session config
│   ├── types.ts                — shared TypeScript types
│   ├── ws-reducer.ts           — pure applyWsEvent reducer (tested)
│   ├── ws-hook.ts              — useWebSocket hook with backoff
│   ├── api-client.ts           — client-side fetch: 401 → refresh → retry
│   └── api-server.ts           — server-side fetch using session token
└── __tests__/
    ├── ws-reducer.test.ts
    ├── api-client.test.ts
    └── rating-panel.test.tsx
```

---

### Task 1: Backend — Add GET /jobs customer endpoint

**Files:**
- Modify: `backend/src/customer/handlers.rs`
- Modify: `backend/src/lib.rs`

- [ ] **Step 1: Add `CustomerJobListItem` struct and `list_jobs` handler to `backend/src/customer/handlers.rs`**

  Add after the `submit_rating` function (end of file):

  ```rust
  // ─── Job List ─────────────────────────────────────────────────────────────

  #[derive(Serialize)]
  pub struct CustomerJobListItem {
      pub id: Uuid,
      pub contractor_id: Uuid,
      pub contractor_display_name: String,
      pub status: crate::models::job::JobStatus,
      pub description: String,
      pub created_at: chrono::DateTime<chrono::Utc>,
      pub has_rating: bool,
  }

  pub async fn list_jobs(
      State(state): State<AppState>,
      CustomerUser(claims): CustomerUser,
  ) -> Result<Json<Vec<CustomerJobListItem>>, AppError> {
      let rows = sqlx::query!(
          r#"SELECT
                 j.id, j.contractor_id,
                 cp.display_name AS contractor_display_name,
                 j.status AS "status: crate::models::job::JobStatus",
                 j.description, j.created_at,
                 EXISTS(
                     SELECT 1 FROM ratings r WHERE r.job_id = j.id
                 ) AS "has_rating!: bool"
             FROM jobs j
             JOIN contractor_profiles cp ON cp.user_id = j.contractor_id
             WHERE j.customer_id = $1
             ORDER BY j.created_at DESC"#,
          claims.sub
      )
      .fetch_all(&state.db)
      .await?;

      let items = rows
          .into_iter()
          .map(|r| CustomerJobListItem {
              id: r.id,
              contractor_id: r.contractor_id,
              contractor_display_name: r.contractor_display_name,
              status: r.status,
              description: r.description,
              created_at: r.created_at,
              has_rating: r.has_rating,
          })
          .collect();

      Ok(Json(items))
  }
  ```

- [ ] **Step 2: Register the route in `backend/src/lib.rs`**

  Add after the existing `POST /jobs` line (around line 48):

  ```rust
  .route("/jobs", get(customer::handlers::list_jobs))
  ```

  The customer block should now look like:
  ```rust
  // Customer
  .route("/contractors/nearby", get(customer::handlers::nearby_contractors))
  .route("/contractors/:id", get(customer::handlers::contractor_profile))
  .route("/jobs", post(customer::handlers::create_job))
  .route("/jobs", get(customer::handlers::list_jobs))
  .route("/jobs/:id", get(customer::handlers::get_job))
  .route("/jobs/:id", delete(customer::handlers::cancel_job))
  .route("/jobs/:id/rating", post(customer::handlers::submit_rating))
  ```

- [ ] **Step 3: Compile to verify no errors**

  ```bash
  cd backend && cargo build 2>&1 | tail -20
  ```

  Expected: `Finished` with no errors. If sqlx offline mode is required, run:
  ```bash
  DATABASE_URL="postgres://knect:knect@localhost:5432/knect" cargo sqlx prepare
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add backend/src/customer/handlers.rs backend/src/lib.rs
  git commit -m "feat: add GET /jobs customer job list endpoint"
  ```

---

### Task 2: Scaffold web/ app

**Files:** All files in `web/`

- [ ] **Step 1: Create the `web/` directory structure**

  ```bash
  mkdir -p web/app/login web/app/register \
    "web/app/(protected)/jobs" \
    web/app/api/session web/app/api/refresh web/app/api/logout \
    web/components/providers web/components/map \
    web/components/panels web/components/ui \
    web/lib web/__tests__
  ```

- [ ] **Step 2: Create `web/package.json`**

  ```json
  {
    "name": "knect-web",
    "version": "0.1.0",
    "private": true,
    "scripts": {
      "dev": "next dev -p 3000",
      "build": "next build",
      "start": "next start",
      "test": "jest",
      "test:e2e": "playwright test"
    },
    "dependencies": {
      "next": "14.2.5",
      "react": "^18",
      "react-dom": "^18",
      "iron-session": "^8.0.3",
      "mapbox-gl": "^3.4.0",
      "clsx": "^2.1.1",
      "tailwind-merge": "^2.3.0",
      "lucide-react": "^0.395.0"
    },
    "devDependencies": {
      "@types/mapbox-gl": "^3.4.0",
      "@types/node": "^20",
      "@types/react": "^18",
      "@types/react-dom": "^18",
      "autoprefixer": "^10.4.19",
      "postcss": "^8",
      "tailwindcss": "^3.4.4",
      "typescript": "^5",
      "jest": "^29",
      "jest-environment-jsdom": "^29",
      "@testing-library/react": "^16",
      "@testing-library/jest-dom": "^6",
      "@testing-library/user-event": "^14",
      "@playwright/test": "^1.45"
    }
  }
  ```

- [ ] **Step 3: Create `web/tsconfig.json`**

  ```json
  {
    "compilerOptions": {
      "target": "ES2017",
      "lib": ["dom", "dom.iterable", "esnext"],
      "allowJs": true,
      "skipLibCheck": true,
      "strict": true,
      "noEmit": true,
      "esModuleInterop": true,
      "module": "esnext",
      "moduleResolution": "bundler",
      "resolveJsonModule": true,
      "isolatedModules": true,
      "jsx": "preserve",
      "incremental": true,
      "plugins": [{ "name": "next" }],
      "paths": { "@/*": ["./*"] }
    },
    "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    "exclude": ["node_modules"]
  }
  ```

- [ ] **Step 4: Create `web/next.config.js`**

  ```js
  /** @type {import('next').NextConfig} */
  const nextConfig = {}
  module.exports = nextConfig
  ```

- [ ] **Step 5: Create `web/tailwind.config.ts`**

  ```ts
  import type { Config } from "tailwindcss";

  const config: Config = {
    content: [
      "./app/**/*.{js,ts,jsx,tsx,mdx}",
      "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: { extend: {} },
    plugins: [],
  };
  export default config;
  ```

- [ ] **Step 6: Create `web/postcss.config.js`**

  ```js
  module.exports = {
    plugins: { tailwindcss: {}, autoprefixer: {} },
  }
  ```

- [ ] **Step 7: Create `web/app/globals.css`**

  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;

  html,
  body {
    height: 100%;
    margin: 0;
  }
  ```

- [ ] **Step 8: Create `web/app/layout.tsx`**

  ```tsx
  import type { Metadata } from "next";
  import "./globals.css";

  export const metadata: Metadata = { title: "Knect" };

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="en" className="h-full">
        <body className="h-full bg-gray-50 text-gray-900 antialiased">{children}</body>
      </html>
    );
  }
  ```

- [ ] **Step 9: Create `web/.env.local.example`**

  ```
  NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoiLi4uIn0...
  NEXT_PUBLIC_API_URL=http://localhost:8080
  NEXT_PUBLIC_WS_URL=ws://localhost:8080
  NEXT_PUBLIC_DEFAULT_LAT=40.7128
  NEXT_PUBLIC_DEFAULT_LNG=-74.006
  SESSION_SECRET=change-me-to-a-32-char-secret!!
  ```

  Copy it for local dev:
  ```bash
  cp web/.env.local.example web/.env.local
  ```
  Then fill in real values.

- [ ] **Step 10: Install dependencies**

  ```bash
  cd web && npm install
  ```

  Expected: `added N packages` with no errors.

- [ ] **Step 11: Commit**

  ```bash
  cd ..
  git add web/
  git commit -m "chore: scaffold web/ Next.js app"
  ```

---

### Task 3: lib/types.ts + lib/session.ts

**Files:**
- Create: `web/lib/types.ts`
- Create: `web/lib/session.ts`

- [ ] **Step 1: Create `web/lib/types.ts`**

  ```ts
  export type JobStatus =
    | "pending"
    | "accepted"
    | "denied"
    | "in_progress"
    | "completed"
    | "cancelled";

  export interface ContractorPosition {
    contractor_id: string;
    lat: number;
    lng: number;
  }

  export interface NearbyContractor {
    user_id: string;
    display_name: string;
    bio: string | null;
    base_rate: number | null;
    base_rate_unit: "per_hour" | "per_job" | null;
    is_busy: boolean;
    avg_rating: number;
    rating_count: number;
    current_lat: number | null;
    current_lng: number | null;
    distance_meters: number;
  }

  export interface PublicRating {
    score: number;
    review_text: string | null;
    created_at: string;
  }

  export interface PublicContractorProfile {
    user_id: string;
    display_name: string;
    bio: string | null;
    base_rate: number | null;
    base_rate_unit: "per_hour" | "per_job" | null;
    is_available: boolean;
    is_busy: boolean;
    avg_rating: number;
    rating_count: number;
    ratings: PublicRating[];
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

  export interface CustomerJobListItem {
    id: string;
    contractor_id: string;
    contractor_display_name: string;
    status: JobStatus;
    description: string;
    created_at: string;
    has_rating: boolean;
  }

  export interface ActiveJob {
    id: string;
    status: JobStatus;
    quote: QuoteDetail | null;
  }

  export type WsEvent =
    | { type: "snapshot"; contractors: ContractorPosition[] }
    | { type: "location_update"; contractor_id: string; lat: number; lng: number }
    | { type: "job_accepted"; job_id: string }
    | { type: "job_denied"; job_id: string }
    | { type: "job_completed"; job_id: string }
    | { type: "job_cancelled"; job_id: string };
  ```

- [ ] **Step 2: Create `web/lib/session.ts`**

  ```ts
  import { getIronSession, IronSession, SessionOptions } from "iron-session";
  import { cookies } from "next/headers";

  export interface SessionData {
    access_token?: string;
    refresh_token?: string;
  }

  export const sessionOptions: SessionOptions = {
    cookieName: "knect_session",
    password: process.env.SESSION_SECRET as string,
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "strict",
    },
  };

  export async function getSession(): Promise<IronSession<SessionData>> {
    return getIronSession<SessionData>(await cookies(), sessionOptions);
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add web/lib/
  git commit -m "feat(web): add shared types and session config"
  ```

---

### Task 4: Jest setup

**Files:**
- Create: `web/jest.config.js`
- Create: `web/jest.setup.ts`

- [ ] **Step 1: Create `web/jest.config.js`**

  ```js
  const nextJest = require("next/jest");
  const createJestConfig = nextJest({ dir: "./" });

  module.exports = createJestConfig({
    testEnvironment: "jsdom",
    setupFilesAfterFramework: ["<rootDir>/jest.setup.ts"],
    moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
    testMatch: ["**/__tests__/**/*.test.{ts,tsx}"],
  });
  ```

- [ ] **Step 2: Create `web/jest.setup.ts`**

  ```ts
  import "@testing-library/jest-dom";
  ```

- [ ] **Step 3: Run Jest to verify setup**

  ```bash
  cd web && npx jest --passWithNoTests
  ```

  Expected: `Test Suites: 0 skipped` or similar with no errors.

- [ ] **Step 4: Commit**

  ```bash
  cd ..
  git add web/jest.config.js web/jest.setup.ts
  git commit -m "chore(web): add Jest + RTL test setup"
  ```

---

### Task 5: Login page + server action

**Files:**
- Create: `web/app/login/page.tsx`
- Create: `web/app/login/actions.ts`

- [ ] **Step 1: Create `web/app/login/actions.ts`**

  ```ts
  "use server";

  import { redirect } from "next/navigation";
  import { getSession } from "@/lib/session";

  export async function loginAction(formData: FormData) {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      redirect("/login?error=Invalid+email+or+password");
    }

    const data = await res.json();
    const session = await getSession();
    session.access_token = data.access_token;
    session.refresh_token = data.refresh_token;
    await session.save();

    redirect("/");
  }
  ```

- [ ] **Step 2: Create `web/app/login/page.tsx`**

  ```tsx
  import { loginAction } from "./actions";

  export default function LoginPage({
    searchParams,
  }: {
    searchParams: { error?: string };
  }) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white shadow rounded-lg p-8 w-full max-w-sm">
          <h1 className="text-2xl font-semibold mb-2">Sign in to Knect</h1>
          <p className="text-sm text-gray-500 mb-6">
            Don&apos;t have an account?{" "}
            <a href="/register" className="text-blue-600 hover:underline">
              Sign up
            </a>
          </p>
          <form action={loginAction} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {searchParams.error && (
              <p className="text-sm text-red-600">{searchParams.error}</p>
            )}
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add web/app/login/
  git commit -m "feat(web): add login page and server action"
  ```

---

### Task 6: Register page + server action

**Files:**
- Create: `web/app/register/page.tsx`
- Create: `web/app/register/actions.ts`

- [ ] **Step 1: Create `web/app/register/actions.ts`**

  ```ts
  "use server";

  import { redirect } from "next/navigation";
  import { getSession } from "@/lib/session";

  export async function registerAction(formData: FormData) {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const display_name = formData.get("display_name") as string;

    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, display_name, role: "customer" }),
    });

    if (res.status === 409) {
      redirect("/register?error=Email+already+registered");
    }
    if (!res.ok) {
      redirect("/register?error=Registration+failed");
    }

    const data = await res.json();
    const session = await getSession();
    session.access_token = data.access_token;
    session.refresh_token = data.refresh_token;
    await session.save();

    redirect("/");
  }
  ```

- [ ] **Step 2: Create `web/app/register/page.tsx`**

  ```tsx
  import { registerAction } from "./actions";

  export default function RegisterPage({
    searchParams,
  }: {
    searchParams: { error?: string };
  }) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white shadow rounded-lg p-8 w-full max-w-sm">
          <h1 className="text-2xl font-semibold mb-2">Create an account</h1>
          <p className="text-sm text-gray-500 mb-6">
            Already have an account?{" "}
            <a href="/login" className="text-blue-600 hover:underline">
              Sign in
            </a>
          </p>
          <form action={registerAction} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="display_name">
                Name
              </label>
              <input
                id="display_name"
                name="display_name"
                type="text"
                required
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {searchParams.error && (
              <p className="text-sm text-red-600">{searchParams.error}</p>
            )}
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Create account
            </button>
          </form>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add web/app/register/
  git commit -m "feat(web): add register page and server action"
  ```

---

### Task 7: API routes — session, refresh, logout

**Files:**
- Create: `web/app/api/session/route.ts`
- Create: `web/app/api/refresh/route.ts`
- Create: `web/app/api/logout/route.ts`

- [ ] **Step 1: Create `web/app/api/session/route.ts`**

  Returns the `access_token` to the client. Called once on mount by `AuthProvider`.

  ```ts
  import { NextResponse } from "next/server";
  import { getSession } from "@/lib/session";

  export async function GET() {
    const session = await getSession();
    if (!session.access_token) {
      return NextResponse.json({ access_token: null }, { status: 401 });
    }
    return NextResponse.json({ access_token: session.access_token });
  }
  ```

- [ ] **Step 2: Create `web/app/api/refresh/route.ts`**

  Called by `api-client.ts` on 401. Exchanges the refresh token and updates the session.

  ```ts
  import { NextResponse } from "next/server";
  import { getSession } from "@/lib/session";

  export async function POST() {
    const session = await getSession();
    if (!session.refresh_token) {
      return NextResponse.json({ error: "No refresh token" }, { status: 401 });
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    if (!res.ok) {
      session.destroy();
      return NextResponse.json({ error: "Refresh failed" }, { status: 401 });
    }

    const data = await res.json();
    session.access_token = data.access_token;
    session.refresh_token = data.refresh_token;
    await session.save();

    return NextResponse.json({ access_token: data.access_token });
  }
  ```

- [ ] **Step 3: Create `web/app/api/logout/route.ts`**

  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { getSession } from "@/lib/session";

  export async function GET(request: NextRequest) {
    const session = await getSession();
    session.destroy();
    return NextResponse.redirect(new URL("/login", request.url));
  }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add web/app/api/
  git commit -m "feat(web): add session, refresh, and logout API routes"
  ```

---

### Task 8: Middleware

**Files:**
- Create: `web/middleware.ts`

- [ ] **Step 1: Create `web/middleware.ts`**

  Guards all protected routes. Redirects unauthenticated users to `/login` and authenticated users away from `/login`/`/register`.

  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { getIronSession } from "iron-session";
  import { SessionData, sessionOptions } from "@/lib/session";

  export async function middleware(request: NextRequest) {
    const response = NextResponse.next();
    const session = await getIronSession<SessionData>(
      request,
      response,
      sessionOptions
    );

    const { pathname } = request.nextUrl;
    const isPublicPage = pathname === "/login" || pathname === "/register";

    if (!session.access_token && !isPublicPage) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (session.access_token && isPublicPage) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return response;
  }

  export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
  };
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add web/middleware.ts
  git commit -m "feat(web): add auth middleware for route protection"
  ```

---

### Task 9: lib/api-server.ts + lib/api-client.ts

**Files:**
- Create: `web/lib/api-server.ts`
- Create: `web/lib/api-client.ts`

- [ ] **Step 1: Create `web/lib/api-server.ts`**

  Server-side only. Reads session token and calls the backend directly.

  ```ts
  import { getSession } from "./session";
  import type { CustomerJobListItem } from "./types";

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

  async function serverFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const session = await getSession();
    if (!session.access_token) throw new Error("Not authenticated");

    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...init?.headers,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`API error ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  export const serverApi = {
    listJobs: () => serverFetch<CustomerJobListItem[]>("/jobs"),
  };
  ```

- [ ] **Step 2: Create `web/lib/api-client.ts`**

  Client-side. Manages in-memory token with 401 → refresh → retry logic.

  ```ts
  import type {
    NearbyContractor,
    PublicContractorProfile,
    JobDetail,
  } from "./types";

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

  let _token: string | null = null;

  export function setClientToken(token: string) {
    _token = token;
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
      _token = access_token;
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
  ```

- [ ] **Step 3: Write `web/__tests__/api-client.test.ts`**

  ```ts
  import { apiFetch, setClientToken } from "@/lib/api-client";

  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  function makeResponse(status: number, body: unknown, headers?: Record<string, string>) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => (headers ?? {})[k] ?? null },
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    setClientToken("test-token");
  });

  test("sends Authorization header with token", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { id: "1" }));
    await apiFetch<{ id: string }>("/some/path");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/some/path"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      })
    );
  });

  test("on 401, calls /api/refresh and retries with new token", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(401, {}))
      .mockResolvedValueOnce(makeResponse(200, { access_token: "new-token" }))
      .mockResolvedValueOnce(makeResponse(200, { id: "2" }));

    const result = await apiFetch<{ id: string }>("/protected");

    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/refresh", { method: "POST" });
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/protected"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer new-token" }),
      })
    );
    expect(result).toEqual({ id: "2" });
  });

  test("redirects to /login if refresh fails", async () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "" },
    });
    mockFetch
      .mockResolvedValueOnce(makeResponse(401, {}))
      .mockResolvedValueOnce(makeResponse(401, {}));

    await expect(apiFetch("/protected")).rejects.toThrow("Session expired");
    expect(window.location.href).toBe("/login");
  });
  ```

- [ ] **Step 4: Run api-client tests**

  ```bash
  cd web && npx jest api-client --no-coverage 2>&1 | tail -15
  ```

  Expected: `Tests: 3 passed, 3 total`

- [ ] **Step 5: Commit**

  ```bash
  cd ..
  git add web/lib/api-server.ts web/lib/api-client.ts web/__tests__/api-client.test.ts
  git commit -m "feat(web): add server and client API fetch helpers with 401-retry tests"
  ```

---

### Task 10: lib/ws-reducer.ts (TDD)

**Files:**
- Create: `web/__tests__/ws-reducer.test.ts`
- Create: `web/lib/ws-reducer.ts`

- [ ] **Step 1: Write the failing test — `web/__tests__/ws-reducer.test.ts`**

  ```ts
  import { applyWsEvent, WsState } from "@/lib/ws-reducer";
  import type { ActiveJob } from "@/lib/types";

  const emptyState: WsState = {
    contractors: new Map(),
    activeJob: null,
  };

  const jobA: ActiveJob = { id: "job-1", status: "pending", quote: null };

  describe("applyWsEvent", () => {
    test("snapshot replaces all contractor positions", () => {
      const next = applyWsEvent(emptyState, {
        type: "snapshot",
        contractors: [
          { contractor_id: "c1", lat: 40.7, lng: -74.0 },
          { contractor_id: "c2", lat: 40.8, lng: -73.9 },
        ],
      });
      expect(next.contractors.size).toBe(2);
      expect(next.contractors.get("c1")).toEqual({ lat: 40.7, lng: -74.0 });
      expect(next.contractors.get("c2")).toEqual({ lat: 40.8, lng: -73.9 });
    });

    test("snapshot with no contractors clears the map", () => {
      const state: WsState = {
        contractors: new Map([["c1", { lat: 1, lng: 2 }]]),
        activeJob: null,
      };
      const next = applyWsEvent(state, { type: "snapshot", contractors: [] });
      expect(next.contractors.size).toBe(0);
    });

    test("location_update updates a specific contractor", () => {
      const state: WsState = {
        contractors: new Map([["c1", { lat: 40.7, lng: -74.0 }]]),
        activeJob: null,
      };
      const next = applyWsEvent(state, {
        type: "location_update",
        contractor_id: "c1",
        lat: 40.75,
        lng: -74.05,
      });
      expect(next.contractors.get("c1")).toEqual({ lat: 40.75, lng: -74.05 });
    });

    test("location_update adds a new contractor not previously in map", () => {
      const next = applyWsEvent(emptyState, {
        type: "location_update",
        contractor_id: "new",
        lat: 1,
        lng: 2,
      });
      expect(next.contractors.get("new")).toEqual({ lat: 1, lng: 2 });
    });

    test("job_accepted sets status to accepted for matching job", () => {
      const state = { ...emptyState, activeJob: jobA };
      const next = applyWsEvent(state, { type: "job_accepted", job_id: "job-1" });
      expect(next.activeJob?.status).toBe("accepted");
    });

    test("job_accepted ignores events for different job", () => {
      const state = { ...emptyState, activeJob: jobA };
      const next = applyWsEvent(state, { type: "job_accepted", job_id: "job-99" });
      expect(next.activeJob?.status).toBe("pending");
    });

    test("job_denied sets status to denied", () => {
      const state = { ...emptyState, activeJob: jobA };
      const next = applyWsEvent(state, { type: "job_denied", job_id: "job-1" });
      expect(next.activeJob?.status).toBe("denied");
    });

    test("job_completed sets status to completed", () => {
      const state = { ...emptyState, activeJob: jobA };
      const next = applyWsEvent(state, { type: "job_completed", job_id: "job-1" });
      expect(next.activeJob?.status).toBe("completed");
    });

    test("job_cancelled clears activeJob", () => {
      const state = { ...emptyState, activeJob: jobA };
      const next = applyWsEvent(state, { type: "job_cancelled", job_id: "job-1" });
      expect(next.activeJob).toBeNull();
    });

    test("job_cancelled ignores events for different job", () => {
      const state = { ...emptyState, activeJob: jobA };
      const next = applyWsEvent(state, { type: "job_cancelled", job_id: "job-99" });
      expect(next.activeJob).toEqual(jobA);
    });

    test("set_active_job sets the active job", () => {
      const next = applyWsEvent(emptyState, {
        type: "set_active_job",
        job: jobA,
      });
      expect(next.activeJob).toEqual(jobA);
    });

    test("set_active_job with null clears the active job", () => {
      const state = { ...emptyState, activeJob: jobA };
      const next = applyWsEvent(state, { type: "set_active_job", job: null });
      expect(next.activeJob).toBeNull();
    });

    test("does not mutate the original state", () => {
      const orig = new Map([["c1", { lat: 1, lng: 2 }]]);
      const state: WsState = { contractors: orig, activeJob: null };
      applyWsEvent(state, {
        type: "location_update",
        contractor_id: "c1",
        lat: 99,
        lng: 99,
      });
      expect(orig.get("c1")).toEqual({ lat: 1, lng: 2 });
    });
  });
  ```

- [ ] **Step 2: Run to confirm it fails**

  ```bash
  cd web && npx jest ws-reducer --no-coverage 2>&1 | tail -15
  ```

  Expected: `Cannot find module '@/lib/ws-reducer'`

- [ ] **Step 3: Create `web/lib/ws-reducer.ts`**

  ```ts
  import type { ActiveJob, WsEvent } from "./types";

  export interface WsState {
    contractors: Map<string, { lat: number; lng: number }>;
    activeJob: ActiveJob | null;
  }

  export type WsAction =
    | WsEvent
    | { type: "set_active_job"; job: ActiveJob | null };

  export function applyWsEvent(state: WsState, action: WsAction): WsState {
    switch (action.type) {
      case "snapshot":
        return {
          ...state,
          contractors: new Map(
            action.contractors.map((c) => [
              c.contractor_id,
              { lat: c.lat, lng: c.lng },
            ])
          ),
        };

      case "location_update": {
        const next = new Map(state.contractors);
        next.set(action.contractor_id, { lat: action.lat, lng: action.lng });
        return { ...state, contractors: next };
      }

      case "job_accepted":
        return {
          ...state,
          activeJob:
            state.activeJob?.id === action.job_id
              ? { ...state.activeJob, status: "accepted" as const }
              : state.activeJob,
        };

      case "job_denied":
        return {
          ...state,
          activeJob:
            state.activeJob?.id === action.job_id
              ? { ...state.activeJob, status: "denied" as const }
              : state.activeJob,
        };

      case "job_completed":
        return {
          ...state,
          activeJob:
            state.activeJob?.id === action.job_id
              ? { ...state.activeJob, status: "completed" as const }
              : state.activeJob,
        };

      case "job_cancelled":
        return {
          ...state,
          activeJob:
            state.activeJob?.id === action.job_id ? null : state.activeJob,
        };

      case "set_active_job":
        return { ...state, activeJob: action.job };

      default:
        return state;
    }
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  npx jest ws-reducer --no-coverage 2>&1 | tail -15
  ```

  Expected: `Tests: 12 passed, 12 total`

- [ ] **Step 5: Commit**

  ```bash
  cd ..
  git add web/lib/ws-reducer.ts web/__tests__/ws-reducer.test.ts
  git commit -m "feat(web): add ws-reducer with full state machine tests"
  ```

---

### Task 11: lib/ws-hook.ts

**Files:**
- Create: `web/lib/ws-hook.ts`

- [ ] **Step 1: Create `web/lib/ws-hook.ts`**

  Manages a single WebSocket connection with exponential backoff on disconnect. Calls `onMessage` for each parsed event and `onConnectionChange` when connection status changes.

  ```ts
  "use client";

  import { useEffect, useRef, useCallback } from "react";
  import type { WsEvent } from "./types";

  const MAX_BACKOFF_MS = 30_000;

  export function useWebSocket(
    token: string | null,
    onMessage: (event: WsEvent) => void,
    onConnectionChange: (connected: boolean) => void
  ) {
    const wsRef = useRef<WebSocket | null>(null);
    const backoffRef = useRef(1_000);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onMessageRef = useRef(onMessage);
    const onConnRef = useRef(onConnectionChange);

    useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
    useEffect(() => { onConnRef.current = onConnectionChange; }, [onConnectionChange]);

    const connect = useCallback(() => {
      if (!token || wsRef.current) return;

      const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";
      const ws = new WebSocket(`${WS_URL}/ws?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 1_000;
        onConnRef.current(true);
      };

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as WsEvent;
          onMessageRef.current(event);
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => ws.close();

      ws.onclose = () => {
        wsRef.current = null;
        onConnRef.current(false);
        timerRef.current = setTimeout(() => {
          connect();
        }, backoffRef.current);
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      };
    }, [token]);

    useEffect(() => {
      connect();
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        wsRef.current?.close();
        wsRef.current = null;
      };
    }, [connect]);
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add web/lib/ws-hook.ts
  git commit -m "feat(web): add useWebSocket hook with exponential backoff"
  ```

---

### Task 12: Providers component

**Files:**
- Create: `web/components/providers/providers.tsx`

- [ ] **Step 1: Create `web/components/providers/providers.tsx`**

  Single client component that composes all React contexts and manages app-level state (auth token, contractor positions, active job, WS connection status).

  ```tsx
  "use client";

  import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useReducer,
    useState,
  } from "react";
  import type { ActiveJob, NearbyContractor } from "@/lib/types";
  import { applyWsEvent, WsState } from "@/lib/ws-reducer";
  import { useWebSocket } from "@/lib/ws-hook";
  import { setClientToken } from "@/lib/api-client";

  // ─── Contexts ────────────────────────────────────────────────────────────────

  interface AuthCtxValue {
    token: string | null;
  }
  interface MapCtxValue {
    contractors: Map<string, { lat: number; lng: number }>;
    availableIds: Set<string>;
    setAvailableIds: (ids: Set<string>) => void;
  }
  interface JobCtxValue {
    activeJob: ActiveJob | null;
    setActiveJob: (job: ActiveJob | null) => void;
  }
  interface WsCtxValue {
    connected: boolean;
  }

  const AuthCtx = createContext<AuthCtxValue>({ token: null });
  const MapCtx = createContext<MapCtxValue>({
    contractors: new Map(),
    availableIds: new Set(),
    setAvailableIds: () => {},
  });
  const JobCtx = createContext<JobCtxValue>({
    activeJob: null,
    setActiveJob: () => {},
  });
  const WsCtx = createContext<WsCtxValue>({ connected: false });

  export const useAuth = () => useContext(AuthCtx);
  export const useMapContractors = () => useContext(MapCtx);
  export const useJob = () => useContext(JobCtx);
  export const useWsStatus = () => useContext(WsCtx);

  // ─── Providers ───────────────────────────────────────────────────────────────

  const INITIAL_STATE: WsState = { contractors: new Map(), activeJob: null };

  export function Providers({ children }: { children: React.ReactNode }) {
    const [token, setToken] = useState<string | null>(null);
    const [wsConnected, setWsConnected] = useState(false);
    const [state, dispatch] = useReducer(applyWsEvent, INITIAL_STATE);
    const [availableIds, setAvailableIds] = useState<Set<string>>(new Set());

    // Hydrate token on mount
    useEffect(() => {
      fetch("/api/session")
        .then((r) => r.json())
        .then((d) => {
          if (d.access_token) {
            setToken(d.access_token);
            setClientToken(d.access_token);
          }
        })
        .catch(() => {});
    }, []);

    const handleMessage = useCallback(
      (event: Parameters<typeof applyWsEvent>[1]) => {
        dispatch(event);
      },
      []
    );

    useWebSocket(token, handleMessage, setWsConnected);

    const setActiveJob = useCallback((job: ActiveJob | null) => {
      dispatch({ type: "set_active_job", job });
    }, []);

    return (
      <AuthCtx.Provider value={{ token }}>
        <MapCtx.Provider
          value={{
            contractors: state.contractors,
            availableIds,
            setAvailableIds,
          }}
        >
          <JobCtx.Provider value={{ activeJob: state.activeJob, setActiveJob }}>
            <WsCtx.Provider value={{ connected: wsConnected }}>
              {children}
            </WsCtx.Provider>
          </JobCtx.Provider>
        </MapCtx.Provider>
      </AuthCtx.Provider>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add web/components/providers/
  git commit -m "feat(web): add Providers component with auth, map, job, and ws contexts"
  ```

---

### Task 13: Protected layout, Navbar, ReconnectingBanner

**Files:**
- Create: `web/app/(protected)/layout.tsx`
- Create: `web/components/ui/navbar.tsx`
- Create: `web/components/ui/reconnecting-banner.tsx`

- [ ] **Step 1: Create `web/components/ui/reconnecting-banner.tsx`**

  ```tsx
  "use client";

  import { useWsStatus } from "@/components/providers/providers";

  export function ReconnectingBanner() {
    const { connected } = useWsStatus();
    if (connected) return null;
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-400 text-yellow-900 text-sm text-center py-1 font-medium">
        Reconnecting to live updates…
      </div>
    );
  }
  ```

- [ ] **Step 2: Create `web/components/ui/navbar.tsx`**

  ```tsx
  import Link from "next/link";

  export function Navbar() {
    return (
      <nav className="fixed top-0 left-0 right-0 z-40 h-14 bg-white border-b flex items-center px-4 gap-4">
        <span className="font-bold text-blue-600 text-lg tracking-tight">Knect</span>
        <div className="flex-1" />
        <Link
          href="/jobs"
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          My Jobs
        </Link>
        <a
          href="/api/logout"
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          Sign out
        </a>
      </nav>
    );
  }
  ```

- [ ] **Step 3: Create `web/app/(protected)/layout.tsx`**

  Server component that wraps all protected pages with the Navbar and `Providers`. The `<Suspense>` wrapper is required by Next.js 14 because the map page uses `useSearchParams`.

  ```tsx
  import { Suspense } from "react";
  import { Providers } from "@/components/providers/providers";
  import { Navbar } from "@/components/ui/navbar";
  import { ReconnectingBanner } from "@/components/ui/reconnecting-banner";

  export default function ProtectedLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <Providers>
        <ReconnectingBanner />
        <Navbar />
        <div className="pt-14 h-full">
          <Suspense>{children}</Suspense>
        </div>
      </Providers>
    );
  }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add web/app/"(protected)"/layout.tsx web/components/ui/
  git commit -m "feat(web): add protected layout, Navbar, and ReconnectingBanner"
  ```

---

### Task 14: MapView + map page

**Files:**
- Create: `web/components/map/map-view.tsx`
- Create: `web/app/(protected)/page.tsx`

- [ ] **Step 1: Create `web/components/map/map-view.tsx`**

  Full-screen Mapbox GL JS map. Fetches nearby contractors every 30s (availability layer). Merges with WebSocket positions. Renders pins; available = blue, busy = gray. Clicking an available pin calls `onContractorClick`.

  ```tsx
  "use client";

  import { useEffect, useRef, useState, useCallback } from "react";
  import mapboxgl from "mapbox-gl";
  import "mapbox-gl/dist/mapbox-gl.css";
  import { useMapContractors } from "@/components/providers/providers";
  import { api } from "@/lib/api-client";
  import type { NearbyContractor } from "@/lib/types";

  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

  const DEFAULT_LAT = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? "40.7128");
  const DEFAULT_LNG = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? "-74.006");

  interface Props {
    onContractorClick: (contractorId: string) => void;
    onUserLocationChange: (pos: { lat: number; lng: number }) => void;
  }

  export function MapView({ onContractorClick, onUserLocationChange }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markersRef = useRef<mapboxgl.Marker[]>([]);
    const { contractors, availableIds, setAvailableIds } = useMapContractors();
    const [locationBanner, setLocationBanner] = useState(false);
    const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
    const onClickRef = useRef(onContractorClick);
    const onLocationRef = useRef(onUserLocationChange);
    useEffect(() => { onClickRef.current = onContractorClick; }, [onContractorClick]);
    useEffect(() => { onLocationRef.current = onUserLocationChange; }, [onUserLocationChange]);

    // Initialize map
    useEffect(() => {
      if (!containerRef.current || mapRef.current) return;
      mapRef.current = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [DEFAULT_LNG, DEFAULT_LAT],
        zoom: 13,
      });
      return () => {
        mapRef.current?.remove();
        mapRef.current = null;
      };
    }, []);

    // Get user location and seed nearby fetch
    useEffect(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          setUserPos({ lat, lng });
          onLocationRef.current({ lat, lng });
          mapRef.current?.flyTo({ center: [lng, lat], zoom: 14 });
        },
        () => {
          setLocationBanner(true);
          const fallback = { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
          setUserPos(fallback);
          onLocationRef.current(fallback);
        }
      );
    }, []);

    // Fetch nearby contractors (availability layer) every 30s
    const fetchNearby = useCallback(async () => {
      if (!userPos) return;
      try {
        const nearby = await api.nearbyContractors(userPos.lat, userPos.lng);
        setAvailableIds(new Set(nearby.map((c: NearbyContractor) => c.user_id)));
      } catch {
        // keep previous availableIds on error
      }
    }, [userPos, setAvailableIds]);

    useEffect(() => {
      fetchNearby();
      const interval = setInterval(fetchNearby, 30_000);
      return () => clearInterval(interval);
    }, [fetchNearby]);

    // Render markers whenever contractor positions or availability changes
    useEffect(() => {
      if (!mapRef.current) return;

      // Remove old markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      for (const [id, pos] of contractors) {
        const isAvailable = availableIds.has(id);
        const el = document.createElement("div");
        el.style.cssText = `
          width: 16px; height: 16px; border-radius: 50%;
          background: ${isAvailable ? "#2563eb" : "#9ca3af"};
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          cursor: ${isAvailable ? "pointer" : "default"};
        `;
        if (isAvailable) {
          el.addEventListener("click", () => onClickRef.current(id));
        }
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([pos.lng, pos.lat])
          .addTo(mapRef.current!);
        markersRef.current.push(marker);
      }
    }, [contractors, availableIds]);

    return (
      <div className="relative w-full h-full">
        <div ref={containerRef} className="w-full h-full" />
        {locationBanner && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow px-4 py-2 text-sm text-gray-700 flex items-center gap-2 z-10">
            <span>Using default location — enable location for better results.</span>
            <button
              onClick={() => setLocationBanner(false)}
              className="text-gray-400 hover:text-gray-600 ml-1"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: Create `web/app/(protected)/page.tsx`**

  Map shell. Manages which panel is open and passes the selected contractor id to `ContractorPanel`.

  ```tsx
  "use client";

  import { useState } from "react";
  import { MapView } from "@/components/map/map-view";
  import { ContractorPanel } from "@/components/panels/contractor-panel";
  import { JobStatusPanel } from "@/components/panels/job-status-panel";
  import { useJob } from "@/components/providers/providers";

  export default function MapPage() {
    const [selectedContractorId, setSelectedContractorId] = useState<string | null>(null);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const { activeJob } = useJob();

    return (
      <div className="relative w-full h-full">
        <MapView
          onContractorClick={setSelectedContractorId}
          onUserLocationChange={setUserLocation}
        />

        {selectedContractorId && !activeJob && (
          <ContractorPanel
            contractorId={selectedContractorId}
            userLocation={userLocation}
            onClose={() => setSelectedContractorId(null)}
          />
        )}

        {activeJob && (
          <JobStatusPanel onClose={() => {}} />
        )}
      </div>
    );
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add web/components/map/ "web/app/(protected)/page.tsx"
  git commit -m "feat(web): add Mapbox MapView and map page shell"
  ```

---

### Task 15: ContractorPanel

**Files:**
- Create: `web/components/panels/contractor-panel.tsx`

- [ ] **Step 1: Create `web/components/panels/contractor-panel.tsx`**

  Slide-in drawer from the right. Fetches contractor profile, shows details, and contains the job request form.

  ```tsx
  "use client";

  import { useEffect, useState } from "react";
  import { X, Star } from "lucide-react";
  import { api } from "@/lib/api-client";
  import { useJob } from "@/components/providers/providers";
  import type { PublicContractorProfile } from "@/lib/types";

  interface Props {
    contractorId: string;
    userLocation: { lat: number; lng: number } | null;
    onClose: () => void;
  }

  export function ContractorPanel({ contractorId, userLocation, onClose }: Props) {
    const { setActiveJob } = useJob();
    const [profile, setProfile] = useState<PublicContractorProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [description, setDescription] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      setLoading(true);
      setProfile(null);
      api
        .contractorProfile(contractorId)
        .then(setProfile)
        .catch(() => setError("Could not load contractor profile."))
        .finally(() => setLoading(false));
    }, [contractorId]);

    const handleRequest = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!description.trim()) return;
      setSubmitting(true);
      setError(null);
      try {
        const job = await api.createJob({
          contractor_id: contractorId,
          description: description.trim(),
          location_lat: userLocation?.lat ?? 0,
          location_lng: userLocation?.lng ?? 0,
        });
        setActiveJob({ id: job.id, status: "pending", quote: null });
        onClose();
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to send request. Try again."
        );
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-20"
          onClick={onClose}
          aria-hidden="true"
        />
        {/* Panel */}
        <div className="fixed right-0 top-14 bottom-0 w-full max-w-sm bg-white shadow-xl z-30 overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold text-lg">
              {loading ? "Loading…" : (profile?.display_name ?? "Contractor")}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {loading && (
            <div className="p-4 text-gray-500 text-sm">Loading profile…</div>
          )}

          {!loading && profile && (
            <div className="p-4 space-y-4">
              {/* Rating */}
              <div className="flex items-center gap-1 text-sm text-gray-600">
                <Star size={14} className="text-yellow-400 fill-yellow-400" />
                <span>
                  {profile.avg_rating.toFixed(1)} ({profile.rating_count} ratings)
                </span>
              </div>

              {/* Rate */}
              {profile.base_rate != null && (
                <p className="text-sm text-gray-700">
                  <span className="font-medium">${profile.base_rate}</span>{" "}
                  {profile.base_rate_unit === "per_hour" ? "/ hr" : "/ job"}
                </p>
              )}

              {/* Bio */}
              {profile.bio && (
                <p className="text-sm text-gray-600">{profile.bio}</p>
              )}

              {/* Status badge */}
              {profile.is_busy && (
                <span className="inline-block text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-medium">
                  Currently busy
                </span>
              )}

              {/* Job request form */}
              {!profile.is_busy && (
                <form onSubmit={handleRequest} className="space-y-3 pt-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Describe your job
                    <textarea
                      className="mt-1 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      rows={4}
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What do you need help with?"
                    />
                  </label>
                  {error && (
                    <p className="text-sm text-red-600">{error}</p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting || !description.trim()}
                    className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? "Sending…" : "Send Request"}
                  </button>
                </form>
              )}
            </div>
          )}

          {error && !loading && !profile && (
            <div className="p-4 text-red-600 text-sm">{error}</div>
          )}
        </div>
      </>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add web/components/panels/contractor-panel.tsx
  git commit -m "feat(web): add ContractorPanel slide-in drawer"
  ```

---

### Task 16: JobStatusPanel

**Files:**
- Create: `web/components/panels/job-status-panel.tsx`

- [ ] **Step 1: Create `web/components/panels/job-status-panel.tsx`**

  Shows the active job status. Fetches job detail (for quote) when status is `accepted`. Transitions to `RatingPanel` when status is `completed`. Renders cancel button when `pending`.

  ```tsx
  "use client";

  import { useEffect, useState } from "react";
  import { useJob } from "@/components/providers/providers";
  import { api } from "@/lib/api-client";
  import { RatingPanel } from "./rating-panel";
  import type { JobDetail } from "@/lib/types";

  const STATUS_LABELS: Record<string, string> = {
    pending: "Waiting for contractor…",
    accepted: "Contractor accepted!",
    denied: "Request denied",
    in_progress: "Job in progress",
    completed: "Job completed",
    cancelled: "Job cancelled",
  };

  const STATUS_COLORS: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    accepted: "bg-green-100 text-green-800",
    denied: "bg-red-100 text-red-800",
    in_progress: "bg-blue-100 text-blue-800",
    completed: "bg-gray-100 text-gray-800",
    cancelled: "bg-gray-100 text-gray-500",
  };

  interface Props {
    onClose: () => void;
  }

  export function JobStatusPanel({ onClose }: Props) {
    const { activeJob, setActiveJob } = useJob();
    const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
    const [cancelling, setCancelling] = useState(false);
    const [rated, setRated] = useState(false);

    useEffect(() => {
      if (!activeJob) return;
      if (activeJob.status === "accepted" || activeJob.status === "in_progress") {
        api.getJob(activeJob.id).then(setJobDetail).catch(() => {});
      }
    }, [activeJob?.id, activeJob?.status]);

    if (!activeJob) return null;

    const status = activeJob.status;
    const isTerminal = ["denied", "cancelled"].includes(status);

    const handleCancel = async () => {
      if (!activeJob) return;
      setCancelling(true);
      try {
        await api.cancelJob(activeJob.id);
        setActiveJob(null);
      } catch {
        setCancelling(false);
      }
    };

    const handleDismiss = () => setActiveJob(null);

    if (status === "completed" && !rated) {
      return (
        <RatingPanel
          jobId={activeJob.id}
          onRated={() => {
            setRated(true);
            setActiveJob(null);
          }}
        />
      );
    }

    return (
      <div className="fixed right-0 top-14 bottom-0 w-full max-w-sm bg-white shadow-xl z-30 overflow-y-auto">
        <div className="p-4 space-y-4">
          <h2 className="font-semibold text-lg">Job Status</h2>

          <span
            className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${
              STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"
            }`}
          >
            {STATUS_LABELS[status] ?? status}
          </span>

          {jobDetail?.quote && (
            <div className="border rounded p-3 space-y-1 text-sm">
              <p className="font-medium text-gray-700">Quote from contractor</p>
              {jobDetail.quote.custom_amount != null ? (
                <p>
                  <span className="font-semibold">
                    ${jobDetail.quote.custom_amount}
                  </span>
                  {jobDetail.quote.custom_note && (
                    <span className="text-gray-500 ml-1">
                      — {jobDetail.quote.custom_note}
                    </span>
                  )}
                </p>
              ) : jobDetail.quote.base_rate_snapshot != null ? (
                <p>
                  Base rate:{" "}
                  <span className="font-semibold">
                    ${jobDetail.quote.base_rate_snapshot}
                  </span>
                </p>
              ) : null}
            </div>
          )}

          {status === "denied" && (
            <p className="text-sm text-gray-600">
              The contractor is unavailable. You can request a different contractor.
            </p>
          )}

          {status === "cancelled" && (
            <p className="text-sm text-gray-600">
              Job cancelled — contractor went offline.
            </p>
          )}

          <div className="pt-2 flex gap-2">
            {status === "pending" && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 border border-red-300 text-red-600 py-2 rounded text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                {cancelling ? "Cancelling…" : "Cancel Request"}
              </button>
            )}
            {isTerminal && (
              <button
                onClick={handleDismiss}
                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add web/components/panels/job-status-panel.tsx
  git commit -m "feat(web): add JobStatusPanel with status display and cancel"
  ```

---

### Task 17: RatingPanel (TDD)

**Files:**
- Create: `web/__tests__/rating-panel.test.tsx`
- Create: `web/components/panels/rating-panel.tsx`

- [ ] **Step 1: Write the failing test — `web/__tests__/rating-panel.test.tsx`**

  ```tsx
  import { render, screen, fireEvent, waitFor } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { RatingPanel } from "@/components/panels/rating-panel";

  // Mock api-client
  jest.mock("@/lib/api-client", () => ({
    api: {
      submitRating: jest.fn(),
    },
  }));

  import { api } from "@/lib/api-client";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders 5 star buttons", () => {
    render(<RatingPanel jobId="job-1" onRated={jest.fn()} />);
    expect(screen.getAllByRole("button", { name: /star/i })).toHaveLength(5);
  });

  test("submit button is disabled until a star is selected", () => {
    render(<RatingPanel jobId="job-1" onRated={jest.fn()} />);
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });

  test("clicking a star enables the submit button", async () => {
    render(<RatingPanel jobId="job-1" onRated={jest.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /4 star/i }));
    expect(screen.getByRole("button", { name: /submit/i })).not.toBeDisabled();
  });

  test("submits correct score and calls onRated", async () => {
    (api.submitRating as jest.Mock).mockResolvedValueOnce(undefined);
    const onRated = jest.fn();
    render(<RatingPanel jobId="job-1" onRated={onRated} />);

    await userEvent.click(screen.getByRole("button", { name: /5 star/i }));
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(api.submitRating).toHaveBeenCalledWith("job-1", 5, undefined);
      expect(onRated).toHaveBeenCalled();
    });
  });

  test("submits score with optional review text", async () => {
    (api.submitRating as jest.Mock).mockResolvedValueOnce(undefined);
    render(<RatingPanel jobId="job-1" onRated={jest.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /3 star/i }));
    await userEvent.type(screen.getByRole("textbox"), "Great work!");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(api.submitRating).toHaveBeenCalledWith("job-1", 3, "Great work!");
    });
  });

  test("shows error message on submit failure", async () => {
    (api.submitRating as jest.Mock).mockRejectedValueOnce(new Error("Network error"));
    render(<RatingPanel jobId="job-1" onRated={jest.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /1 star/i }));
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to submit/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run to confirm failure**

  ```bash
  cd web && npx jest rating-panel --no-coverage 2>&1 | tail -15
  ```

  Expected: `Cannot find module '@/components/panels/rating-panel'`

- [ ] **Step 3: Create `web/components/panels/rating-panel.tsx`**

  ```tsx
  "use client";

  import { useState } from "react";
  import { Star } from "lucide-react";
  import { api } from "@/lib/api-client";

  interface Props {
    jobId: string;
    onRated: () => void;
  }

  export function RatingPanel({ jobId, onRated }: Props) {
    const [score, setScore] = useState<number | null>(null);
    const [hovered, setHovered] = useState<number | null>(null);
    const [reviewText, setReviewText] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!score) return;
      setSubmitting(true);
      setError(null);
      try {
        await api.submitRating(
          jobId,
          score,
          reviewText.trim() || undefined
        );
        onRated();
      } catch {
        setError("Failed to submit rating. Please try again.");
        setSubmitting(false);
      }
    };

    const display = hovered ?? score;

    return (
      <div className="fixed right-0 top-14 bottom-0 w-full max-w-sm bg-white shadow-xl z-30 overflow-y-auto">
        <div className="p-4 space-y-4">
          <h2 className="font-semibold text-lg">Rate your contractor</h2>
          <p className="text-sm text-gray-600">How was the service?</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Stars */}
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} star`}
                  onClick={() => setScore(n)}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(null)}
                  className="focus:outline-none"
                >
                  <Star
                    size={28}
                    className={
                      display !== null && n <= display
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-300"
                    }
                  />
                </button>
              ))}
            </div>

            {/* Review text */}
            <textarea
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
              placeholder="Add a review (optional)"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              aria-label="Submit rating"
              disabled={!score || submitting}
              className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Submitting…" : "Submit Rating"}
            </button>
          </form>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  npx jest rating-panel --no-coverage 2>&1 | tail -15
  ```

  Expected: `Tests: 5 passed, 5 total`

- [ ] **Step 5: Commit**

  ```bash
  cd ..
  git add web/components/panels/rating-panel.tsx web/__tests__/rating-panel.test.tsx
  git commit -m "feat(web): add RatingPanel with TDD (5 tests passing)"
  ```

---

### Task 18: /jobs history page

**Files:**
- Create: `web/app/(protected)/jobs/page.tsx`

- [ ] **Step 1: Create `web/app/(protected)/jobs/page.tsx`**

  Server component. Fetches the customer's job list using the session token, renders a list with status badges. Completed-unrated jobs show a "Leave a rating" link to `/?rate=<job_id>`.

  ```tsx
  import { serverApi } from "@/lib/api-server";
  import type { CustomerJobListItem, JobStatus } from "@/lib/types";

  const STATUS_LABELS: Record<JobStatus, string> = {
    pending: "Pending",
    accepted: "Accepted",
    denied: "Denied",
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  const STATUS_COLORS: Record<JobStatus, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    accepted: "bg-green-100 text-green-800",
    denied: "bg-red-100 text-red-800",
    in_progress: "bg-blue-100 text-blue-800",
    completed: "bg-gray-100 text-gray-700",
    cancelled: "bg-gray-100 text-gray-500",
  };

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  export default async function JobsPage() {
    let jobs: CustomerJobListItem[] = [];
    try {
      jobs = await serverApi.listJobs();
    } catch {
      // session may have expired; middleware will redirect if needed
    }

    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold mb-6">My Jobs</h1>

        {jobs.length === 0 && (
          <p className="text-gray-500 text-sm">No jobs yet.</p>
        )}

        <ul className="space-y-3">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="bg-white rounded-lg shadow-sm border p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">
                    {job.contractor_display_name}
                  </p>
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {job.description}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                    STATUS_COLORS[job.status]
                  }`}
                >
                  {STATUS_LABELS[job.status]}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{formatDate(job.created_at)}</span>
                {job.status === "completed" && !job.has_rating && (
                  <a
                    href={`/?rate=${job.id}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    Leave a rating
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  ```

- [ ] **Step 2: Handle `?rate=<job_id>` on the map page**

  Update `web/app/(protected)/page.tsx` to read the `rate` query param and pre-open the rating panel:

  ```tsx
  "use client";

  import { useState, useEffect } from "react";
  import { useSearchParams } from "next/navigation";
  import { MapView } from "@/components/map/map-view";
  import { ContractorPanel } from "@/components/panels/contractor-panel";
  import { JobStatusPanel } from "@/components/panels/job-status-panel";
  import { useJob } from "@/components/providers/providers";
  import { api } from "@/lib/api-client";

  export default function MapPage() {
    const [selectedContractorId, setSelectedContractorId] = useState<string | null>(null);
    const { activeJob, setActiveJob } = useJob();
    const searchParams = useSearchParams();

    // Pre-open rating panel for completed jobs linked from /jobs
    useEffect(() => {
      const rateJobId = searchParams.get("rate");
      if (!rateJobId || activeJob) return;
      api
        .getJob(rateJobId)
        .then((job) => {
          if (job.status === "completed") {
            setActiveJob({ id: job.id, status: "completed", quote: job.quote });
          }
        })
        .catch(() => {});
    }, [searchParams, activeJob, setActiveJob]);

    return (
      <div className="relative w-full h-full">
        <MapView onContractorClick={setSelectedContractorId} />

        {selectedContractorId && !activeJob && (
          <ContractorPanel
            contractorId={selectedContractorId}
            onClose={() => setSelectedContractorId(null)}
          />
        )}

        {activeJob && <JobStatusPanel onClose={() => setActiveJob(null)} />}
      </div>
    );
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add "web/app/(protected)/jobs/page.tsx" "web/app/(protected)/page.tsx"
  git commit -m "feat(web): add job history page and rating deep-link from /jobs"
  ```

---

### Task 19: Playwright E2E setup + specs

**Files:**
- Create: `web/playwright.config.ts`
- Create: `web/e2e/auth.spec.ts`
- Create: `web/e2e/jobs.spec.ts`

- [ ] **Step 1: Install Playwright browsers**

  ```bash
  cd web && npx playwright install chromium
  ```

  Expected: `Chromium N.N downloaded to ...`

- [ ] **Step 2: Create `web/playwright.config.ts`**

  ```ts
  import { defineConfig, devices } from "@playwright/test";

  export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    retries: 0,
    use: {
      baseURL: "http://localhost:3000",
      trace: "on-first-retry",
    },
    projects: [
      { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ],
    webServer: {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  });
  ```

- [ ] **Step 3: Create `web/e2e/` directory**

  ```bash
  mkdir web/e2e
  ```

- [ ] **Step 4: Create `web/e2e/auth.spec.ts`**

  Tests registration and login flows against the real backend.

  ```ts
  import { test, expect } from "@playwright/test";

  const EMAIL = `e2e-${Date.now()}@test.knect.dev`;
  const PASSWORD = "e2epassword1";
  const NAME = "E2E Customer";

  test.describe("Auth flow", () => {
    test("registers a new customer account and is redirected to map", async ({
      page,
    }) => {
      await page.goto("/register");
      await page.fill('input[name="display_name"]', NAME);
      await page.fill('input[name="email"]', EMAIL);
      await page.fill('input[name="password"]', PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL("/");
      // Navbar should be visible
      await expect(page.locator("nav")).toContainText("Knect");
    });

    test("redirects to /login if not authenticated", async ({ page }) => {
      await page.goto("/");
      await page.waitForURL("/login");
      await expect(page.locator("h1")).toContainText("Sign in");
    });

    test("logs in with existing credentials", async ({ page }) => {
      await page.goto("/login");
      await page.fill('input[name="email"]', EMAIL);
      await page.fill('input[name="password"]', PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL("/");
      await expect(page.locator("nav")).toContainText("My Jobs");
    });

    test("signs out and redirects to /login", async ({ page }) => {
      // Login first
      await page.goto("/login");
      await page.fill('input[name="email"]', EMAIL);
      await page.fill('input[name="password"]', PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL("/");

      await page.click("text=Sign out");
      await page.waitForURL("/login");
      await expect(page.locator("h1")).toContainText("Sign in");
    });
  });
  ```

- [ ] **Step 5: Create `web/e2e/jobs.spec.ts`**

  Tests the job history page. Requires at least the registered account from auth.spec. Runs after auth.spec in sequence.

  ```ts
  import { test, expect } from "@playwright/test";

  // Uses the same credentials created in auth.spec.ts
  // In CI, run auth.spec.ts first or use a shared state file.
  const EMAIL = "e2e-fixture@test.knect.dev"; // pre-seeded fixture account
  const PASSWORD = "e2epassword1";

  test.describe("Job history page", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/login");
      await page.fill('input[name="email"]', EMAIL);
      await page.fill('input[name="password"]', PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL("/");
    });

    test("navigates to /jobs and shows job list or empty state", async ({
      page,
    }) => {
      await page.click("text=My Jobs");
      await page.waitForURL("/jobs");
      await expect(page.locator("h1")).toContainText("My Jobs");
      // Either a list or empty state is rendered
      const hasJobs = await page.locator("li").count();
      const hasEmpty = await page.locator("text=No jobs yet").count();
      expect(hasJobs + hasEmpty).toBeGreaterThan(0);
    });
  });
  ```

  > **Note on fixtures:** The e2e/jobs.spec uses a pre-seeded `e2e-fixture@test.knect.dev` account. Create this account by running `e2e/auth.spec.ts` once and updating the email constant, or by seeding via a migration/script. In CI, set up a Docker Compose fixture seed step.

- [ ] **Step 6: Run E2E tests (requires backend + web server running)**

  Start the backend: `cd backend && cargo run`
  Then in another terminal:

  ```bash
  cd web && npm run test:e2e -- --reporter=line 2>&1 | tail -30
  ```

  Expected: auth flow tests pass. Jobs test requires a pre-seeded fixture account (skip with `--grep "Auth flow"` if not set up).

- [ ] **Step 7: Commit**

  ```bash
  cd ..
  git add web/playwright.config.ts web/e2e/
  git commit -m "feat(web): add Playwright E2E specs for auth and job history"
  ```

---

### Task 20: Full test run + final commit

- [ ] **Step 1: Run all Jest unit tests**

  ```bash
  cd web && npx jest --no-coverage 2>&1 | tail -20
  ```

  Expected:
  ```
  Test Suites: 3 passed, 3 total
  Tests:       20 passed, 20 total
  ```
  (ws-reducer: 12 tests, api-client: 3 tests, rating-panel: 5 tests)

- [ ] **Step 2: Verify TypeScript compiles cleanly**

  ```bash
  npx tsc --noEmit 2>&1
  ```

  Expected: no output (no errors).

- [ ] **Step 3: Verify the app builds**

  ```bash
  npm run build 2>&1 | tail -20
  ```

  Expected: `Route (app)` table with all routes listed, no errors.

- [ ] **Step 4: Commit final state**

  ```bash
  cd ..
  git add web/
  git commit -m "feat: complete customer web app — map, panels, auth, job history, tests"
  ```
