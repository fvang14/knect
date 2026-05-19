# Knect Admin Console — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js 14 admin console at `admin/` — login, metrics dashboard, jobs table, and users table with suspend. Dockerized, deployed alongside the Axum API on port 3001.

**Architecture:** Next.js App Router, server components for all data fetching, `iron-session` for encrypted httpOnly cookie holding the Axum JWT, shadcn/ui + Tailwind for UI. All Axum API calls made server-side via a typed `lib/api.ts` wrapper. URL search params drive table filters (bookmarkable, no client-side state).

**Spec:** `docs/superpowers/specs/2026-05-18-admin-console-design.md`

---

## File Map

```
admin/
├── app/
│   ├── layout.tsx                    — root layout (fonts, globals.css)
│   ├── globals.css                   — Tailwind base styles
│   ├── login/
│   │   ├── page.tsx                  — login form (server component)
│   │   └── actions.ts                — server action: call /auth/login, set cookie
│   ├── (dashboard)/
│   │   ├── layout.tsx                — sidebar + auth guard
│   │   ├── page.tsx                  — metrics dashboard
│   │   ├── jobs/
│   │   │   └── page.tsx              — jobs table with status filter
│   │   └── users/
│   │       ├── page.tsx              — users table with role/status filter
│   │       └── actions.ts            — server action: PUT /admin/users/:id/suspend
│   └── api/
│       └── logout/
│           └── route.ts              — DELETE cookie, redirect to /login
├── components/
│   ├── sidebar.tsx
│   ├── stat-card.tsx
│   ├── jobs-table.tsx
│   └── users-table.tsx
├── lib/
│   ├── api.ts                        — typed server-side fetch wrapper (reads session JWT)
│   ├── session.ts                    — iron-session config + getSession helper
│   └── types.ts                      — API response types
├── middleware.ts                     — redirect unauthenticated → /login
├── next.config.ts                    — output: standalone
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── postcss.config.js
├── .env.local.example               — documents dev env vars
└── Dockerfile
```

---

## Task 1: Scaffold Next.js project

Creates the `admin/` directory with all project config files. No runtime code yet.

**Files:** `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `app/globals.css`, `app/layout.tsx`, `.env.local.example`

- [ ] **Step 1: Create `admin/package.json`**

```json
{
  "name": "knect-admin",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "node .next/standalone/server.js"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "^18",
    "react-dom": "^18",
    "iron-session": "^8.0.3",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.3.0",
    "lucide-react": "^0.395.0",
    "@radix-ui/react-slot": "^1.0.2",
    "class-variance-authority": "^0.7.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10.4.19",
    "postcss": "^8",
    "tailwindcss": "^3.4.4",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Volumes/Brown-32/knect/admin
npm install
```

Expected: `node_modules/` created, `package-lock.json` generated. No errors.

- [ ] **Step 3: Create `admin/next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 4: Create `admin/tsconfig.json`**

```json
{
  "compilerOptions": {
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

- [ ] **Step 5: Create `admin/tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Create `admin/postcss.config.js`**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: Create `admin/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create `admin/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Knect Admin",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Create `admin/.env.local.example`**

```
# Copy to .env.local for local development
API_URL=http://localhost:3000
JWT_COOKIE_SECRET=dev-secret-32-chars-minimum-here
```

- [ ] **Step 10: Verify the scaffold builds**

```bash
cd /Volumes/Brown-32/knect/admin
npm run build
```

Expected: build succeeds. If it errors, fix config issues before proceeding.

---

## Task 2: Session & API client

`iron-session` encrypts the httpOnly cookie. `lib/api.ts` wraps every Axum API call with the JWT from the session.

**Files:** `lib/types.ts`, `lib/session.ts`, `lib/api.ts`

- [ ] **Step 1: Create `admin/lib/types.ts`**

```typescript
export type UserRole = "contractor" | "customer" | "admin";
export type JobStatus =
  | "pending"
  | "accepted"
  | "denied"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface UserSummary {
  id: string;
  email: string;
  phone: string | null;
  role: UserRole;
  created_at: string;
  suspended_at: string | null;
}

export interface JobSummary {
  id: string;
  customer_id: string;
  contractor_id: string;
  status: JobStatus;
  description: string;
  created_at: string;
}

export interface Metrics {
  active_contractors: number;
  jobs_today: number;
  avg_rating: number;
}
```

- [ ] **Step 2: Create `admin/lib/session.ts`**

```typescript
import { getIronSession, IronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  jwt?: string;
}

export const sessionOptions: SessionOptions = {
  cookieName: "knect_admin_session",
  password: process.env.JWT_COOKIE_SECRET as string,
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

- [ ] **Step 3: Create `admin/lib/api.ts`**

```typescript
import { getSession } from "./session";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getSession();
  if (!session.jwt) throw new Error("Not authenticated");

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.jwt}`,
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(`API returned ${res.status}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  metrics: () => apiFetch<import("./types").Metrics>("/admin/metrics"),
  users: () => apiFetch<import("./types").UserSummary[]>("/admin/users"),
  jobs: () => apiFetch<import("./types").JobSummary[]>("/admin/jobs"),
  suspendUser: (id: string) =>
    apiFetch<void>(`/admin/users/${id}/suspend`, { method: "PUT" }),
};
```

---

## Task 3: Auth — login, middleware, logout

Login server action sets the encrypted cookie. Middleware protects all dashboard routes. Logout clears the cookie.

**Files:** `app/login/actions.ts`, `app/login/page.tsx`, `middleware.ts`, `app/api/logout/route.ts`

- [ ] **Step 1: Create `admin/app/login/actions.ts`**

```typescript
"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const API_URL = process.env.API_URL ?? "http://localhost:3000";
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    return { error: "Invalid credentials" };
  }

  const data = await res.json();
  const session = await getSession();
  session.jwt = data.token;
  await session.save();

  redirect("/");
}
```

- [ ] **Step 2: Create `admin/app/login/page.tsx`**

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
        <h1 className="text-2xl font-semibold mb-6">Knect Admin</h1>
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

- [ ] **Step 3: Create `admin/middleware.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { SessionData, sessionOptions } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!session.jwt && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session.jwt && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 4: Create `admin/app/api/logout/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  session.destroy();
  return NextResponse.redirect(
    new URL("/login", process.env.NEXTAUTH_URL ?? "http://localhost:3001")
  );
}
```

- [ ] **Step 5: Verify auth flow builds**

```bash
cd /Volumes/Brown-32/knect/admin
npm run build
```

Expected: build succeeds with no TypeScript errors.

---

## Task 4: Shared dashboard layout + sidebar

The `(dashboard)` route group wraps all authenticated pages with a sidebar nav.

**Files:** `components/sidebar.tsx`, `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create `admin/components/sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Briefcase, Users } from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/users", label: "Users", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 min-h-screen bg-white border-r flex flex-col">
      <div className="px-6 py-5 border-b">
        <span className="font-bold text-lg tracking-tight">Knect Admin</span>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t">
        <a
          href="/api/logout"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
        >
          Sign out
        </a>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create `admin/app/(dashboard)/layout.tsx`**

```tsx
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
```

---

## Task 5: Metrics dashboard page

**Files:** `components/stat-card.tsx`, `app/(dashboard)/page.tsx`

- [ ] **Step 1: Create `admin/components/stat-card.tsx`**

```tsx
interface StatCardProps {
  label: string;
  value: string | number;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg border p-6">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
```

- [ ] **Step 2: Create `admin/app/(dashboard)/page.tsx`**

```tsx
import { api } from "@/lib/api";
import { StatCard } from "@/components/stat-card";

export default async function DashboardPage() {
  const metrics = await api.metrics();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active Contractors" value={metrics.active_contractors} />
        <StatCard label="Jobs Today" value={metrics.jobs_today} />
        <StatCard
          label="Platform Avg Rating"
          value={metrics.avg_rating.toFixed(2)}
        />
      </div>
    </div>
  );
}
```

---

## Task 6: Jobs page

Server component fetches jobs; client component handles the status filter via URL search params.

**Files:** `components/jobs-table.tsx`, `app/(dashboard)/jobs/page.tsx`

- [ ] **Step 1: Create `admin/components/jobs-table.tsx`**

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { JobSummary, JobStatus } from "@/lib/types";

const STATUS_OPTIONS: { label: string; value: JobStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Accepted", value: "accepted" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Denied", value: "denied" },
];

const STATUS_COLORS: Record<JobStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  accepted: "bg-blue-100 text-blue-800",
  in_progress: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-800",
  denied: "bg-red-100 text-red-800",
};

export function JobsTable({ jobs }: { jobs: JobSummary[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status") ?? "";

  const filtered = statusFilter
    ? jobs.filter((j) => j.status === statusFilter)
    : jobs;

  function setFilter(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("status", value);
    else params.delete("status");
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === opt.value
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">ID</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Description</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  No jobs found
                </td>
              </tr>
            )}
            {filtered.map((job) => (
              <tr key={job.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-500">
                  {job.id.slice(0, 8)}…
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[job.status]}`}
                  >
                    {job.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                  {job.description}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(job.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-400">{filtered.length} jobs</p>
    </div>
  );
}
```

- [ ] **Step 2: Create `admin/app/(dashboard)/jobs/page.tsx`**

```tsx
import { api } from "@/lib/api";
import { JobsTable } from "@/components/jobs-table";
import { Suspense } from "react";

export default async function JobsPage() {
  const jobs = await api.jobs();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Jobs</h1>
      <Suspense>
        <JobsTable jobs={jobs} />
      </Suspense>
    </div>
  );
}
```

---

## Task 7: Users page

Server component fetches users; client component handles the role/status filter and suspend action.

**Files:** `app/(dashboard)/users/actions.ts`, `components/users-table.tsx`, `app/(dashboard)/users/page.tsx`

- [ ] **Step 1: Create `admin/app/(dashboard)/users/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";

export async function suspendUserAction(userId: string) {
  await api.suspendUser(userId);
  revalidatePath("/users");
}
```

- [ ] **Step 2: Create `admin/components/users-table.tsx`**

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import type { UserSummary, UserRole } from "@/lib/types";
import { suspendUserAction } from "@/app/(dashboard)/users/actions";

const ROLE_OPTIONS: { label: string; value: UserRole | "" }[] = [
  { label: "All", value: "" },
  { label: "Contractors", value: "contractor" },
  { label: "Customers", value: "customer" },
  { label: "Admins", value: "admin" },
];

const ROLE_COLORS: Record<UserRole, string> = {
  contractor: "bg-orange-100 text-orange-800",
  customer: "bg-blue-100 text-blue-800",
  admin: "bg-purple-100 text-purple-800",
};

export function UsersTable({ users }: { users: UserSummary[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roleFilter = searchParams.get("role") ?? "";
  const statusFilter = searchParams.get("status") ?? "";
  const [isPending, startTransition] = useTransition();

  const filtered = users.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (statusFilter === "active" && u.suspended_at) return false;
    if (statusFilter === "suspended" && !u.suspended_at) return false;
    return true;
  });

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function handleSuspend(userId: string) {
    startTransition(() => {
      suspendUserAction(userId);
    });
  }

  return (
    <div>
      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="flex gap-2">
          {ROLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setParam("role", opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                roleFilter === opt.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {[
            { label: "All", value: "" },
            { label: "Active", value: "active" },
            { label: "Suspended", value: "suspended" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setParam("status", opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === opt.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Email</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Role</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Joined</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  No users found
                </td>
              </tr>
            )}
            {filtered.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700">{user.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[user.role]}`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  {user.suspended_at ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      Suspended
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!user.suspended_at && user.role !== "admin" && (
                    <button
                      onClick={() => handleSuspend(user.id)}
                      disabled={isPending}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-400">{filtered.length} users</p>
    </div>
  );
}
```

- [ ] **Step 3: Create `admin/app/(dashboard)/users/page.tsx`**

```tsx
import { api } from "@/lib/api";
import { UsersTable } from "@/components/users-table";
import { Suspense } from "react";

export default async function UsersPage() {
  const users = await api.users();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Users</h1>
      <Suspense>
        <UsersTable users={users} />
      </Suspense>
    </div>
  );
}
```

---

## Task 8: Dockerfile

Multi-stage build with Next.js standalone output for a minimal image.

**Files:** `admin/Dockerfile`

- [ ] **Step 1: Create `admin/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public 2>/dev/null || true

USER nextjs
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

- [ ] **Step 2: Verify Docker image builds locally**

```bash
cd /Volumes/Brown-32/knect/admin
docker build -t knect-admin:test .
```

Expected: `Successfully built` and `Successfully tagged knect-admin:test`.

- [ ] **Step 3: Smoke-test the image starts**

```bash
docker run --rm \
  -e API_URL=http://localhost:3000 \
  -e JWT_COOKIE_SECRET=test-secret-that-is-long-enough-32chars \
  -p 3001:3001 \
  knect-admin:test
```

Expected: server starts on port 3001. `curl http://localhost:3001/login` returns HTML. Stop with Ctrl+C.

---

## Task 9: Wire into docker-compose.prod.yml and .env.example

Add the `admin` service to the existing production compose file and document the new env var.

**Files:** `backend/docker-compose.prod.yml` (modify), `backend/.env.example` (modify)

- [ ] **Step 1: Add admin service to `backend/docker-compose.prod.yml`**

Add this block after the existing `api` service (before `volumes:`):

```yaml
  admin:
    build: ../admin
    ports:
      - "3001:3001"
    environment:
      API_URL: http://api:3000
      JWT_COOKIE_SECRET: ${JWT_COOKIE_SECRET}
      PORT: "3001"
      HOSTNAME: "0.0.0.0"
    depends_on:
      - api
    restart: unless-stopped
```

- [ ] **Step 2: Add JWT_COOKIE_SECRET to `backend/.env.example`**

Add after the `JWT_REFRESH_SECRET=` line:

```
JWT_COOKIE_SECRET=    # signs the admin console httpOnly session cookie (min 32 chars)
```

- [ ] **Step 3: Commit everything**

```bash
cd /Volumes/Brown-32/knect
git add admin/ backend/docker-compose.prod.yml backend/.env.example
git commit -m "feat: add Next.js admin console (login, metrics, jobs, users)"
```

---

## Task 10: First-time server setup for admin

Performed once manually via SSH. Assumes the API stack is already running.

- [ ] **Step 1: Add JWT_COOKIE_SECRET to the server's .env**

```bash
ssh home
cd ~/Projects/knect
openssl rand -hex 32
nano backend/.env
```

Add the generated value as `JWT_COOKIE_SECRET=<value>`.

- [ ] **Step 2: Deploy from your Mac**

```bash
./deploy.sh
```

Expected: git pull, Docker rebuilds all containers including `admin`, admin container starts on port 3001.

- [ ] **Step 3: Open port 3001 on the server firewall**

```bash
ssh home
sudo ufw allow 3001/tcp
sudo ufw status
```

Expected: `3001/tcp   ALLOW   Anywhere`.

- [ ] **Step 4: Verify the admin console is reachable**

```bash
curl -s -o /dev/null -w "%{http_code}" http://<SERVER_IP>:3001/login
```

Expected: `200`.

- [ ] **Step 5: Log in and verify all pages work**

Open `http://<SERVER_IP>:3001/login` in a browser. Log in with your admin account. Verify:
- Dashboard shows three metric cards
- Jobs page shows jobs table with status filters
- Users page shows users table with suspend button
- Sign out redirects to /login

---

## Notes

- **Admin account:** Create one via `POST /auth/register` with `role: "admin"` — the API allows self-registration with any role at MVP stage.
- **Client-side filtering:** The Axum `list_jobs` and `list_users` endpoints return all records without query params. All filtering is done in table components. Acceptable given the 200-job cap and small user count at launch.
- **Expired JWT:** If the JWT expires, the cookie still exists but the API returns 401. The `apiFetch` wrapper throws; the server component surfaces Next.js's error boundary. For MVP this is acceptable — redirect-to-login on 401 is a follow-up improvement.
- **No automated tests:** This internal tool is verified via browser. Playwright E2E can be added alongside the customer web app in a later phase.
