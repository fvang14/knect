# L1 Directory Redesign — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the Knect customer web app from a map-first surface to a warm directory-first surface across 8 screens (Phase A).

**Architecture:** `app/page.tsx` (new) handles `/` for both logged-out (public directory) and logged-in (signed-in directory) users via a server-side session check. `<Providers>` moves to the root layout so all pages share one context tree. The existing `app/(protected)/page.tsx` is deleted; the protected group now only wraps `/jobs` and `/pro/[id]`.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, Mapbox GL JS, Lucide React, iron-session, @testing-library/react + Jest

---

## File Map

**Modified:**
- `web/tailwind.config.ts` — warm color tokens, card radii
- `web/app/globals.css` — bg-warm-bg body, tabular-nums utility, rfPulse keyframe
- `web/app/layout.tsx` — add `<Providers>` + `<ReconnectingBanner>`, change body bg
- `web/app/(protected)/layout.tsx` — remove `<Providers>`+`<ReconnectingBanner>`, add session check, pass user to logged-in Navbar
- `web/components/ui/navbar.tsx` — two states: logged-out and logged-in
- `web/app/login/page.tsx` — split-screen layout
- `web/app/register/page.tsx` — split-screen layout
- `web/app/(protected)/jobs/page.tsx` — redesigned list with filter chips
- `web/components/map/map-view.tsx` — capsule pins replacing dot pins
- `web/components/panels/job-status-panel.tsx` — floating bottom-right sheet
- `web/middleware.ts` — allow `/` as a public path
- `web/lib/api-server.ts` — add `nearbyContractors` (unauthenticated) + `contractorProfile` (authenticated)

**Created:**
- `web/components/ui/auth-dark-panel.tsx` — shared dark-side panel for login + register
- `web/components/ui/avatar.tsx`
- `web/components/ui/rating.tsx`
- `web/components/ui/trade-chip.tsx`
- `web/components/ui/verified-badge.tsx`
- `web/components/directory/directory-row.tsx`
- `web/components/directory/directory-list.tsx`
- `web/components/directory/public-directory.tsx`
- `web/components/directory/signed-in-directory.tsx`
- `web/app/page.tsx` (replaces `app/(protected)/page.tsx` for the `/` route)
- `web/app/(protected)/pro/[id]/page.tsx`
- `web/app/(protected)/pro/[id]/pro-request-form.tsx`
- `web/__tests__/avatar.test.tsx`
- `web/__tests__/rating.test.tsx`
- `web/__tests__/trade-chip.test.tsx`
- `web/__tests__/verified-badge.test.tsx`
- `web/__tests__/navbar.test.tsx`
- `web/__tests__/directory-row.test.tsx`
- `web/__tests__/directory-list.test.tsx`
- `web/__tests__/job-status-panel-sheet.test.tsx`

**Deleted:**
- `web/app/(protected)/page.tsx` — route moved to `web/app/page.tsx`

---

## Task 1: Design Tokens & Root Layout

**Files:**
- Modify: `web/tailwind.config.ts`
- Modify: `web/app/globals.css`
- Modify: `web/app/layout.tsx`
- Modify: `web/app/(protected)/layout.tsx`
- Modify: `web/middleware.ts`
- Modify: `web/lib/api-server.ts`

- [ ] **Step 1: Update Tailwind config**

Replace `web/tailwind.config.ts` with:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "warm-bg":     "#faf8f4",
        "warm-border": "#ece6d6",
        "warm-line":   "#f3eee2",
        "warm-muted":  "#fafaf7",
      },
      borderRadius: {
        card:    "14px",
        "card-lg": "16px",
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 2: Update globals.css**

Replace `web/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body {
  height: 100%;
  margin: 0;
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
}

@keyframes rfPulse {
  0%   { transform: translateX(-50%) scale(0.4); opacity: 0.5; }
  100% { transform: translateX(-50%) scale(1.6); opacity: 0; }
}
```

- [ ] **Step 3: Update root layout — move Providers here**

Replace `web/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers/providers";
import { ReconnectingBanner } from "@/components/ui/reconnecting-banner";

export const metadata: Metadata = { title: "Knect" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-warm-bg text-gray-900 antialiased">
        <Providers>
          <ReconnectingBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Update protected layout — remove Providers, add session-aware Navbar**

Replace `web/app/(protected)/layout.tsx` with:

```tsx
import { Suspense } from "react";
import { Navbar } from "@/components/ui/navbar";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar isLoggedIn={true} />
      <div className="pt-[60px] h-full">
        <Suspense>{children}</Suspense>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Update middleware to allow `/` as public**

Replace `web/middleware.ts` with:

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
  const isPublicPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/";

  if (!session.access_token && !isPublicPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session.access_token && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 6: Add nearbyContractors to serverApi**

Replace `web/lib/api-server.ts` with:

```ts
import { getSession } from "./session";
import type { CustomerJobListItem, NearbyContractor, PublicContractorProfile } from "./types";

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

  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

export const serverApi = {
  listJobs: () => serverFetch<CustomerJobListItem[]>("/jobs"),
  contractorProfile: (id: string) =>
    serverFetch<PublicContractorProfile>(`/contractors/${id}`),
  nearbyContractors: async (lat: number, lng: number, radius = 5000): Promise<NearbyContractor[]> => {
    try {
      const res = await fetch(
        `${API_URL}/contractors/nearby?lat=${lat}&lng=${lng}&radius=${radius}`,
        { cache: "no-store" }
      );
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
  },
};
```

- [ ] **Step 7: Delete the old protected page**

```bash
rm web/app/\(protected\)/page.tsx
```

- [ ] **Step 8: Verify the app still builds**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors. (The app won't render `/` yet — that comes in Task 10.)

- [ ] **Step 9: Commit**

```bash
git add web/tailwind.config.ts web/app/globals.css web/app/layout.tsx \
  "web/app/(protected)/layout.tsx" web/middleware.ts web/lib/api-server.ts
git commit -m "feat: add L1 design tokens, move Providers to root layout, update middleware"
```

---

## Task 2: Avatar Component

**Files:**
- Create: `web/components/ui/avatar.tsx`
- Create: `web/__tests__/avatar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/avatar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { Avatar } from "@/components/ui/avatar";

test("renders two-word initials", () => {
  render(<Avatar name="Sarah Khelka" size={36} palette="blue" />);
  expect(screen.getByText("SK")).toBeInTheDocument();
});

test("renders single-word initial", () => {
  render(<Avatar name="Marcus" size={36} palette="amber" />);
  expect(screen.getByText("M")).toBeInTheDocument();
});

test("renders correct size", () => {
  render(<Avatar name="Sarah Khelka" size={64} palette="blue" />);
  const el = screen.getByText("SK");
  expect(el).toHaveStyle({ width: "64px", height: "64px" });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && npx jest __tests__/avatar.test.tsx --no-coverage
```

Expected: FAIL — `Cannot find module '@/components/ui/avatar'`

- [ ] **Step 3: Implement Avatar**

Create `web/components/ui/avatar.tsx`:

```tsx
const PALETTE_GRADIENTS: Record<string, string> = {
  blue:   "linear-gradient(135deg, #60a5fa, #2563eb)",
  green:  "linear-gradient(135deg, #4ade80, #16a34a)",
  amber:  "linear-gradient(135deg, #fcd34d, #d97706)",
  rose:   "linear-gradient(135deg, #fb7185, #e11d48)",
  mint:   "linear-gradient(135deg, #6ee7b7, #059669)",
  violet: "linear-gradient(135deg, #a78bfa, #7c3aed)",
};

interface AvatarProps {
  name: string;
  size?: number;
  palette?: "blue" | "green" | "amber" | "rose" | "mint" | "violet";
}

export function Avatar({ name, size = 36, palette = "blue" }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <span
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: PALETTE_GRADIENTS[palette] ?? PALETTE_GRADIENTS.blue,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "9999px",
        color: "#fff",
        fontWeight: 600,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {initials}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd web && npx jest __tests__/avatar.test.tsx --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add web/components/ui/avatar.tsx web/__tests__/avatar.test.tsx
git commit -m "feat: add Avatar component"
```

---

## Task 3: Rating Component

**Files:**
- Create: `web/components/ui/rating.tsx`
- Create: `web/__tests__/rating.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/rating.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { Rating } from "@/components/ui/rating";

test("renders numeric value", () => {
  render(<Rating value={4.9} count={52} />);
  expect(screen.getByText("4.9")).toBeInTheDocument();
});

test("renders count in parentheses", () => {
  render(<Rating value={4.9} count={52} />);
  expect(screen.getByText("(52)")).toBeInTheDocument();
});

test("hides count when showCount is false", () => {
  render(<Rating value={4.9} count={52} showCount={false} />);
  expect(screen.queryByText("(52)")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && npx jest __tests__/rating.test.tsx --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement Rating**

Create `web/components/ui/rating.tsx`:

```tsx
import { Star } from "lucide-react";

interface RatingProps {
  value: number;
  count: number;
  size?: number;
  showCount?: boolean;
}

export function Rating({ value, count, size = 12, showCount = true }: RatingProps) {
  return (
    <span className="inline-flex items-center gap-1 text-slate-500 tabular-nums" style={{ fontSize: 12 }}>
      <Star size={size} className="text-amber-400 fill-amber-400" />
      <span className="font-semibold text-slate-900">{value.toFixed(1)}</span>
      {showCount && <span className="text-slate-400">({count})</span>}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd web && npx jest __tests__/rating.test.tsx --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add web/components/ui/rating.tsx web/__tests__/rating.test.tsx
git commit -m "feat: add Rating component"
```

---

## Task 4: TradeChip & VerifiedBadge

**Files:**
- Create: `web/components/ui/trade-chip.tsx`
- Create: `web/components/ui/verified-badge.tsx`
- Create: `web/__tests__/trade-chip.test.tsx`
- Create: `web/__tests__/verified-badge.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `web/__tests__/trade-chip.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { TradeChip } from "@/components/ui/trade-chip";

test("renders plumbing label", () => {
  render(<TradeChip trade="plumbing" />);
  expect(screen.getByText("Plumbing")).toBeInTheDocument();
});

test("renders electrical label", () => {
  render(<TradeChip trade="electrical" />);
  expect(screen.getByText("Electrical")).toBeInTheDocument();
});

test("returns null for unknown trade", () => {
  const { container } = render(<TradeChip trade="unknown" />);
  expect(container).toBeEmptyDOMElement();
});
```

Create `web/__tests__/verified-badge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { VerifiedBadge } from "@/components/ui/verified-badge";

test("renders verified badge", () => {
  render(<VerifiedBadge />);
  expect(screen.getByTitle("Verified")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd web && npx jest __tests__/trade-chip.test.tsx __tests__/verified-badge.test.tsx --no-coverage
```

Expected: FAIL — modules not found

- [ ] **Step 3: Implement TradeChip**

Create `web/components/ui/trade-chip.tsx`:

```tsx
import { Wrench, Plug, Snowflake, Hammer, Shield, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const TRADES: Record<string, { label: string; Icon: LucideIcon }> = {
  plumbing:   { label: "Plumbing",   Icon: Wrench },
  electrical: { label: "Electrical", Icon: Plug },
  hvac:       { label: "HVAC",       Icon: Snowflake },
  carpentry:  { label: "Carpentry",  Icon: Hammer },
  locksmith:  { label: "Locksmith",  Icon: Shield },
  handyman:   { label: "Handyman",   Icon: Zap },
};

interface TradeChipProps {
  trade: string;
}

export function TradeChip({ trade }: TradeChipProps) {
  const t = TRADES[trade];
  if (!t) return null;
  const { label, Icon } = t;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-warm-border bg-white text-slate-600 text-xs font-medium">
      <Icon size={11} />
      {label}
    </span>
  );
}
```

- [ ] **Step 4: Implement VerifiedBadge**

Create `web/components/ui/verified-badge.tsx`:

```tsx
import { Check } from "lucide-react";

export function VerifiedBadge() {
  return (
    <span
      title="Verified"
      className="inline-flex items-center justify-center rounded-full bg-blue-600 text-white"
      style={{ width: 18, height: 18, flexShrink: 0 }}
    >
      <Check size={11} />
    </span>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd web && npx jest __tests__/trade-chip.test.tsx __tests__/verified-badge.test.tsx --no-coverage
```

Expected: PASS (4 tests total)

- [ ] **Step 6: Commit**

```bash
git add web/components/ui/trade-chip.tsx web/components/ui/verified-badge.tsx \
  web/__tests__/trade-chip.test.tsx web/__tests__/verified-badge.test.tsx
git commit -m "feat: add TradeChip and VerifiedBadge components"
```

---

## Task 5: Navbar

**Files:**
- Modify: `web/components/ui/navbar.tsx`
- Create: `web/__tests__/navbar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/navbar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { Navbar } from "@/components/ui/navbar";

test("logged-out: shows Sign in and Get started", () => {
  render(<Navbar isLoggedIn={false} />);
  expect(screen.getByText("Sign in")).toBeInTheDocument();
  expect(screen.getByText("Get started")).toBeInTheDocument();
});

test("logged-out: does not show My jobs", () => {
  render(<Navbar isLoggedIn={false} />);
  expect(screen.queryByText("My jobs")).not.toBeInTheDocument();
});

test("logged-in: shows My jobs", () => {
  render(<Navbar isLoggedIn={true} />);
  expect(screen.getByText("My jobs")).toBeInTheDocument();
});

test("logged-in: does not show Sign in", () => {
  render(<Navbar isLoggedIn={true} />);
  expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
});

test("always shows Knect wordmark", () => {
  render(<Navbar isLoggedIn={false} />);
  expect(screen.getByText("Knect")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && npx jest __tests__/navbar.test.tsx --no-coverage
```

Expected: FAIL — Navbar does not accept `isLoggedIn` prop

- [ ] **Step 3: Implement Navbar**

Replace `web/components/ui/navbar.tsx` with:

```tsx
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

interface NavbarProps {
  isLoggedIn: boolean;
  user?: { displayName: string };
}

export function Navbar({ isLoggedIn, user }: NavbarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-[60px] bg-white border-b border-warm-border flex items-center px-10 gap-6">
      <Link href="/" className="font-bold text-blue-600 text-xl tracking-tight">
        Knect
      </Link>

      {isLoggedIn ? (
        <>
          <nav className="flex gap-5 text-sm ml-2">
            <Link href="/" className="text-slate-900 font-medium hover:text-slate-700 transition-colors">
              Find a pro
            </Link>
            <Link href="/jobs" className="text-slate-500 hover:text-slate-900 transition-colors">
              My jobs
            </Link>
          </nav>
          <div className="flex-1" />
          <button className="flex items-center gap-2 bg-transparent border-none cursor-pointer p-1">
            <Avatar name={user?.displayName ?? "User"} size={32} palette="green" />
            {user?.displayName && (
              <span className="text-sm font-medium text-slate-900">
                {user.displayName.split(" ")[0]}
              </span>
            )}
            <ChevronDown size={14} className="text-slate-400" />
          </button>
        </>
      ) : (
        <>
          <nav className="flex gap-6 text-sm">
            <Link href="/" className="text-slate-900 font-medium hover:text-slate-700 transition-colors">
              Find a pro
            </Link>
            <a href="#" className="text-slate-500 hover:text-slate-900 transition-colors">
              For pros
            </a>
            <a href="#" className="text-slate-500 hover:text-slate-900 transition-colors">
              How it works
            </a>
          </nav>
          <div className="flex-1" />
          <Link
            href="/login"
            className="px-4 py-[7px] rounded-lg border border-warm-border text-slate-900 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="px-4 py-[7px] rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Get started
          </Link>
        </>
      )}
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd web && npx jest __tests__/navbar.test.tsx --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add web/components/ui/navbar.tsx web/__tests__/navbar.test.tsx
git commit -m "feat: redesign Navbar with logged-in/logged-out states"
```

---

## Task 6: Auth Pages — Split Screen Layout

**Files:**
- Modify: `web/app/login/page.tsx`
- Modify: `web/app/register/page.tsx`

No unit tests for server action forms — these are integration-tested via E2E. TypeScript compilation is the check.

- [ ] **Step 1: Create the shared auth layout structure in login page**

Replace `web/app/login/page.tsx` with:

```tsx
import { loginAction } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left: form */}
      <section className="flex-1 flex flex-col p-8 sm:p-14 bg-warm-bg">
        <header className="flex items-center justify-between">
          <span className="font-bold text-[22px] text-blue-600 tracking-tight">Knect</span>
          <div className="text-sm text-slate-500">
            New here?{" "}
            <a href="/register" className="text-blue-600 font-medium hover:underline">
              Create an account
            </a>
          </div>
        </header>

        <div className="flex-1 flex flex-col justify-center max-w-[380px] w-full mx-auto">
          <h1 className="text-[30px] font-bold text-slate-900 tracking-[-0.022em] m-0">
            Sign in to Knect
          </h1>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            Find a verified pro near you in seconds.
          </p>

          <form action={loginAction} className="mt-7 flex flex-col gap-3">
            <AuthField label="Email" name="email" type="email" placeholder="you@email.com" />
            <AuthField
              label="Password"
              name="password"
              type="password"
              placeholder="••••••••"
              trailing={
                <a href="/forgot" className="text-xs text-blue-600 font-medium hover:underline">
                  Forgot?
                </a>
              }
            />
            {searchParams.error && (
              <p className="text-sm text-red-600">{searchParams.error}</p>
            )}
            <button
              type="submit"
              className="mt-1 w-full bg-blue-600 text-white py-[10px] rounded-[10px] text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Sign in
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-warm-border" />
            <span className="text-xs text-slate-400">or</span>
            <div className="flex-1 h-px bg-warm-border" />
          </div>

          <button
            disabled
            className="w-full py-[10px] px-4 rounded-[10px] bg-white border border-warm-border text-slate-900 text-sm font-medium flex items-center justify-center gap-2 opacity-50 cursor-not-allowed"
          >
            <GoogleG />
            Continue with Google
          </button>
        </div>
      </section>

      {/* Right: dark map collage */}
      <AuthDarkPanel />
    </div>
  );
}

function AuthField({
  label,
  name,
  type = "text",
  placeholder,
  trailing,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-[13px] font-medium text-slate-900">{label}</span>
        {trailing}
      </div>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required
        className="w-full px-3 py-[10px] border border-warm-border rounded-[10px] bg-white text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </label>
  );
}

function AuthDarkPanel() {
  return (
    <aside className="hidden lg:flex flex-1 bg-[#0f172a] flex-col p-10 justify-end relative overflow-hidden">
      {/* Map SVG background */}
      <div className="absolute inset-0 opacity-60">
        <svg viewBox="0 0 640 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
          <rect width="640" height="800" fill="#1e293b" />
          <path d="M0 0 L640 0 L640 90 C540 120, 420 60, 320 100 C220 135, 120 80, 0 120 Z" fill="#2d4a6e" />
          <ellipse cx="100" cy="600" rx="120" ry="80" fill="#1e3a2a" />
          <ellipse cx="540" cy="260" rx="100" ry="70" fill="#1e3a2a" />
          <g stroke="#2d3748" strokeWidth="18" fill="none">
            <path d="M-10 340 L650 320" />
            <path d="M300 -10 L320 810" />
          </g>
          <g stroke="#2d3748" strokeWidth="10" fill="none">
            <path d="M-10 520 L650 540" />
            <path d="M150 -10 L170 810" />
            <path d="M460 -10 L480 810" />
          </g>
          <g fill="#374151">
            <rect x="30" y="220" width="110" height="60" rx="2" />
            <rect x="30" y="310" width="110" height="40" rx="2" />
            <rect x="180" y="220" width="120" height="60" rx="2" />
            <rect x="350" y="220" width="110" height="60" rx="2" />
            <rect x="350" y="310" width="110" height="40" rx="2" />
            <rect x="500" y="350" width="120" height="40" rx="2" />
          </g>
        </svg>
      </div>

      {/* Gradient mask */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.85) 70%, #0f172a 100%)" }}
      />

      {/* Floating pin cards */}
      <FloatingPin name="Sarah" rate="$65" palette="blue" left="22%" top="28%" />
      <FloatingPin name="Marcus" rate="$90" palette="amber" left="58%" top="20%" />
      <FloatingPin name="Diego" rate="$75" palette="rose" left="44%" top="44%" />
      <FloatingPin name="Priya" rate="$55" palette="mint" left="68%" top="56%" />

      {/* Bottom copy */}
      <div className="relative">
        <h2 className="text-[28px] font-semibold text-white tracking-tight leading-snug m-0">
          Six verified pros within a mile of you.
        </h2>
        <p className="mt-3 text-sm text-slate-300 leading-relaxed">
          No bids, no callbacks, no platform fee. Tap a pro, send a request, watch them arrive.
        </p>
        <div className="mt-6 flex gap-6 text-xs text-slate-400">
          <div>
            <div className="text-[22px] font-bold text-white tabular-nums">12k+</div>
            <div className="mt-0.5">Verified pros</div>
          </div>
          <div>
            <div className="text-[22px] font-bold text-white tabular-nums">11 min</div>
            <div className="mt-0.5">Median ETA</div>
          </div>
          <div>
            <div className="text-[22px] font-bold text-white tabular-nums">0%</div>
            <div className="mt-0.5">Platform fee</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function FloatingPin({
  name,
  rate,
  palette,
  left,
  top,
}: {
  name: string;
  rate: string;
  palette: string;
  left: string;
  top: string;
}) {
  const gradients: Record<string, string> = {
    blue:   "linear-gradient(135deg,#60a5fa,#2563eb)",
    amber:  "linear-gradient(135deg,#fcd34d,#d97706)",
    rose:   "linear-gradient(135deg,#fb7185,#e11d48)",
    mint:   "linear-gradient(135deg,#6ee7b7,#059669)",
  };
  const initials = name[0].toUpperCase();
  return (
    <div
      className="absolute"
      style={{ left, top }}
    >
      <div
        className="flex items-center gap-2 bg-white rounded-full pl-1 pr-3 py-1 text-xs font-semibold text-slate-900"
        style={{ boxShadow: "0 12px 30px -8px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05)" }}
      >
        <span
          className="inline-flex items-center justify-center rounded-full text-white font-bold"
          style={{ width: 24, height: 24, fontSize: 10, background: gradients[palette] }}
        >
          {initials}
        </span>
        {name} · <span className="text-blue-600 tabular-nums">{rate}</span>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}
```

- [ ] **Step 2: Update register page**

Replace `web/app/register/page.tsx` with:

```tsx
import { registerAction } from "./actions";

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left: form */}
      <section className="flex-1 flex flex-col p-8 sm:p-14 bg-warm-bg">
        <header className="flex items-center justify-between">
          <span className="font-bold text-[22px] text-blue-600 tracking-tight">Knect</span>
          <div className="text-sm text-slate-500">
            Already have an account?{" "}
            <a href="/login" className="text-blue-600 font-medium hover:underline">
              Sign in
            </a>
          </div>
        </header>

        <div className="flex-1 flex flex-col justify-center max-w-[380px] w-full mx-auto">
          <h1 className="text-[30px] font-bold text-slate-900 tracking-[-0.022em] m-0">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            Takes about 30 seconds. We&apos;ll only ask for what we need.
          </p>

          <form action={registerAction} className="mt-7 flex flex-col gap-3">
            <AuthField label="Full name" name="display_name" placeholder="Jess Lim" />
            <AuthField label="Email" name="email" type="email" placeholder="you@email.com" />
            <AuthField label="Password" name="password" type="password" placeholder="••••••••" />
            {searchParams.error && (
              <p className="text-sm text-red-600">{searchParams.error}</p>
            )}
            <button
              type="submit"
              className="mt-1 w-full bg-blue-600 text-white py-[10px] rounded-[10px] text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Create account
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-warm-border" />
            <span className="text-xs text-slate-400">or</span>
            <div className="flex-1 h-px bg-warm-border" />
          </div>

          <button
            disabled
            className="w-full py-[10px] px-4 rounded-[10px] bg-white border border-warm-border text-slate-900 text-sm font-medium flex items-center justify-center gap-2 opacity-50 cursor-not-allowed"
          >
            <GoogleG />
            Continue with Google
          </button>

          <p className="mt-5 text-[11px] text-slate-400 leading-relaxed">
            By creating an account you agree to Knect&apos;s{" "}
            <a href="#" className="text-slate-500 hover:underline">Terms</a>{" "}
            and{" "}
            <a href="#" className="text-slate-500 hover:underline">Privacy Policy</a>.
            No marketing emails.
          </p>
        </div>
      </section>

      <AuthDarkPanel />
    </div>
  );
}

function AuthField({
  label,
  name,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1.5">
        <span className="text-[13px] font-medium text-slate-900">{label}</span>
      </div>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required
        className="w-full px-3 py-[10px] border border-warm-border rounded-[10px] bg-white text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </label>
  );
}

function AuthDarkPanel() {
  return (
    <aside className="hidden lg:flex flex-1 bg-[#0f172a] flex-col p-10 justify-end relative overflow-hidden">
      <div className="absolute inset-0 opacity-60">
        <svg viewBox="0 0 640 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
          <rect width="640" height="800" fill="#1e293b" />
          <path d="M0 0 L640 0 L640 90 C540 120, 420 60, 320 100 C220 135, 120 80, 0 120 Z" fill="#2d4a6e" />
          <ellipse cx="100" cy="600" rx="120" ry="80" fill="#1e3a2a" />
          <ellipse cx="540" cy="260" rx="100" ry="70" fill="#1e3a2a" />
          <g stroke="#2d3748" strokeWidth="18" fill="none">
            <path d="M-10 340 L650 320" /><path d="M300 -10 L320 810" />
          </g>
          <g stroke="#2d3748" strokeWidth="10" fill="none">
            <path d="M-10 520 L650 540" /><path d="M150 -10 L170 810" /><path d="M460 -10 L480 810" />
          </g>
          <g fill="#374151">
            <rect x="30" y="220" width="110" height="60" rx="2" />
            <rect x="30" y="310" width="110" height="40" rx="2" />
            <rect x="180" y="220" width="120" height="60" rx="2" />
            <rect x="350" y="220" width="110" height="60" rx="2" />
            <rect x="500" y="350" width="120" height="40" rx="2" />
          </g>
        </svg>
      </div>
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.85) 70%, #0f172a 100%)" }}
      />
      <FloatingPin name="Sarah" rate="$65" palette="blue" left="22%" top="28%" />
      <FloatingPin name="Marcus" rate="$90" palette="amber" left="58%" top="20%" />
      <FloatingPin name="Diego" rate="$75" palette="rose" left="44%" top="44%" />
      <FloatingPin name="Priya" rate="$55" palette="mint" left="68%" top="56%" />
      <div className="relative">
        <h2 className="text-[28px] font-semibold text-white tracking-tight leading-snug m-0">
          Six verified pros within a mile of you.
        </h2>
        <p className="mt-3 text-sm text-slate-300 leading-relaxed">
          No bids, no callbacks, no platform fee.
        </p>
        <div className="mt-6 flex gap-6 text-xs text-slate-400">
          <div><div className="text-[22px] font-bold text-white tabular-nums">12k+</div><div className="mt-0.5">Verified pros</div></div>
          <div><div className="text-[22px] font-bold text-white tabular-nums">11 min</div><div className="mt-0.5">Median ETA</div></div>
          <div><div className="text-[22px] font-bold text-white tabular-nums">0%</div><div className="mt-0.5">Platform fee</div></div>
        </div>
      </div>
    </aside>
  );
}

function FloatingPin({ name, rate, palette, left, top }: { name: string; rate: string; palette: string; left: string; top: string }) {
  const gradients: Record<string, string> = {
    blue: "linear-gradient(135deg,#60a5fa,#2563eb)",
    amber: "linear-gradient(135deg,#fcd34d,#d97706)",
    rose: "linear-gradient(135deg,#fb7185,#e11d48)",
    mint: "linear-gradient(135deg,#6ee7b7,#059669)",
  };
  return (
    <div className="absolute" style={{ left, top }}>
      <div className="flex items-center gap-2 bg-white rounded-full pl-1 pr-3 py-1 text-xs font-semibold text-slate-900"
        style={{ boxShadow: "0 12px 30px -8px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05)" }}>
        <span className="inline-flex items-center justify-center rounded-full text-white font-bold"
          style={{ width: 24, height: 24, fontSize: 10, background: gradients[palette] }}>
          {name[0]}
        </span>
        {name} · <span className="text-blue-600 tabular-nums">{rate}</span>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add web/app/login/page.tsx web/app/register/page.tsx
git commit -m "feat: redesign auth pages with split-screen layout"
```

---

## Task 7: DirectoryRow Component

**Files:**
- Create: `web/components/directory/directory-row.tsx`
- Create: `web/__tests__/directory-row.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/directory-row.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { DirectoryRow } from "@/components/directory/directory-row";
import type { NearbyContractor } from "@/lib/types";

const base: NearbyContractor = {
  user_id: "c1",
  display_name: "Sarah Khelka",
  bio: "Expert plumber",
  base_rate: 65,
  base_rate_unit: "per_hour",
  is_busy: false,
  avg_rating: 4.9,
  rating_count: 52,
  current_lat: null,
  current_lng: null,
  distance_meters: 640,
};

test("renders contractor name", () => {
  render(<DirectoryRow contractor={base} isLoggedIn={false} />);
  expect(screen.getByText("Sarah Khelka")).toBeInTheDocument();
});

test("renders rate", () => {
  render(<DirectoryRow contractor={base} isLoggedIn={false} />);
  expect(screen.getByText("$65")).toBeInTheDocument();
});

test("renders bio", () => {
  render(<DirectoryRow contractor={base} isLoggedIn={false} />);
  expect(screen.getByText("Expert plumber")).toBeInTheDocument();
});

test("shows Request button when available", () => {
  render(<DirectoryRow contractor={base} isLoggedIn={false} />);
  expect(screen.getByRole("link", { name: /request/i })).toBeInTheDocument();
});

test("links to /login when not logged in", () => {
  render(<DirectoryRow contractor={base} isLoggedIn={false} />);
  expect(screen.getByRole("link", { name: /request/i })).toHaveAttribute("href", "/login");
});

test("links to pro detail when logged in", () => {
  render(<DirectoryRow contractor={base} isLoggedIn={true} />);
  expect(screen.getByRole("link", { name: /request/i })).toHaveAttribute("href", "/pro/c1");
});

test("shows 'On a job' when busy", () => {
  render(<DirectoryRow contractor={{ ...base, is_busy: true }} isLoggedIn={false} />);
  expect(screen.getByText(/on a job/i)).toBeInTheDocument();
});

test("hides Request button when busy", () => {
  render(<DirectoryRow contractor={{ ...base, is_busy: true }} isLoggedIn={false} />);
  expect(screen.queryByRole("link", { name: /request/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && npx jest __tests__/directory-row.test.tsx --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement DirectoryRow**

Create `web/components/directory/directory-row.tsx`:

```tsx
import Link from "next/link";
import { MapPin, Clock, ArrowRight, Check } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Rating } from "@/components/ui/rating";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import type { NearbyContractor } from "@/lib/types";

const PALETTES = ["blue", "green", "amber", "rose", "mint", "violet"] as const;

function paletteFor(id: string): typeof PALETTES[number] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

function formatDistance(meters: number): string {
  return (meters / 1609).toFixed(1);
}

interface DirectoryRowProps {
  contractor: NearbyContractor;
  isLoggedIn: boolean;
}

export function DirectoryRow({ contractor: c, isLoggedIn }: DirectoryRowProps) {
  const requestHref = isLoggedIn ? `/pro/${c.user_id}` : "/login";
  const rateUnit = c.base_rate_unit === "per_hour" ? "/ hr" : "/ job";

  return (
    <article
      className="bg-white border border-warm-border rounded-card p-[18px] flex items-start gap-[18px]"
      style={{ opacity: c.is_busy ? 0.7 : 1 }}
    >
      {/* Avatar with status dot */}
      <div className="relative flex-shrink-0">
        <Avatar name={c.display_name} size={64} palette={paletteFor(c.user_id)} />
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full border-[3px] border-white"
          style={{
            width: 16,
            height: 16,
            background: c.is_busy ? "#9ca3af" : "#10b981",
          }}
        />
      </div>

      {/* Center: name + meta + bio */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[17px] font-semibold text-slate-900 tracking-[-0.01em]">
            {c.display_name}
          </span>
          <VerifiedBadge />
        </div>

        <div className="mt-1.5 flex items-center gap-2.5 flex-wrap">
          <Rating value={c.avg_rating} count={c.rating_count} />
          <span className="text-xs text-slate-500 inline-flex items-center gap-1">
            <MapPin size={11} />
            <span className="tabular-nums">{formatDistance(c.distance_meters)}</span> mi
          </span>
          {c.base_rate != null && (
            <span className="text-xs text-slate-500 inline-flex items-center gap-1">
              <Check size={11} className="text-emerald-700" />
              verified
            </span>
          )}
        </div>

        {c.bio && (
          <p className="mt-2.5 text-[13px] text-slate-500 leading-[1.55]">{c.bio}</p>
        )}
      </div>

      {/* Right: rate + action */}
      <div className="flex flex-col items-end gap-2.5 flex-shrink-0 w-[140px]">
        {c.base_rate != null && (
          <div className="text-right">
            <div className="text-[22px] font-bold text-slate-900 tracking-[-0.01em] tabular-nums">
              ${c.base_rate}
            </div>
            <div className="text-xs text-slate-500">{rateUnit}</div>
          </div>
        )}

        {c.is_busy ? (
          <span className="text-[11px] text-amber-800 bg-amber-100 px-3 py-1 rounded-full font-medium">
            On a job
          </span>
        ) : (
          <Link
            href={requestHref}
            className="w-full flex items-center justify-center gap-1 bg-blue-600 text-white text-[13px] font-medium px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Request <ArrowRight size={14} />
          </Link>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd web && npx jest __tests__/directory-row.test.tsx --no-coverage
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add web/components/directory/directory-row.tsx web/__tests__/directory-row.test.tsx
git commit -m "feat: add DirectoryRow component"
```

---

## Task 8: DirectoryList Component

**Files:**
- Create: `web/components/directory/directory-list.tsx`
- Create: `web/__tests__/directory-list.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/directory-list.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectoryList } from "@/components/directory/directory-list";
import type { NearbyContractor } from "@/lib/types";

const makeContractor = (id: string, name: string): NearbyContractor => ({
  user_id: id,
  display_name: name,
  bio: null,
  base_rate: 65,
  base_rate_unit: "per_hour",
  is_busy: false,
  avg_rating: 4.5,
  rating_count: 10,
  current_lat: null,
  current_lng: null,
  distance_meters: 500,
});

const contractors = [
  makeContractor("c1", "Sarah Khelka"),
  makeContractor("c2", "Marcus Tate"),
];

test("renders all contractor names", () => {
  render(<DirectoryList contractors={contractors} isLoggedIn={false} />);
  expect(screen.getByText("Sarah Khelka")).toBeInTheDocument();
  expect(screen.getByText("Marcus Tate")).toBeInTheDocument();
});

test("shows All chip as active by default", () => {
  render(<DirectoryList contractors={contractors} isLoggedIn={false} />);
  const allBtn = screen.getByRole("button", { name: /^all/i });
  expect(allBtn).toHaveClass("bg-slate-900");
});

test("shows count in All chip", () => {
  render(<DirectoryList contractors={contractors} isLoggedIn={false} />);
  expect(screen.getByText("2", { selector: "span" })).toBeInTheDocument();
});

test("shows empty state when no contractors", () => {
  render(<DirectoryList contractors={[]} isLoggedIn={false} />);
  expect(screen.getByText(/no pros/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && npx jest __tests__/directory-list.test.tsx --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement DirectoryList**

Create `web/components/directory/directory-list.tsx`:

```tsx
"use client";

import { useState } from "react";
import { DirectoryRow } from "./directory-row";
import type { NearbyContractor } from "@/lib/types";

const TRADE_CHIPS = [
  { key: "all",        label: "All" },
  { key: "plumbing",   label: "Plumbing" },
  { key: "electrical", label: "Electrical" },
  { key: "hvac",       label: "HVAC" },
  { key: "carpentry",  label: "Carpentry" },
  { key: "locksmith",  label: "Locksmith" },
  { key: "handyman",   label: "Handyman" },
];

interface DirectoryListProps {
  contractors: NearbyContractor[];
  isLoggedIn: boolean;
  showLiveIndicator?: boolean;
}

export function DirectoryList({
  contractors,
  isLoggedIn,
  showLiveIndicator = false,
}: DirectoryListProps) {
  const [activeFilter, setActiveFilter] = useState("all");

  // NearbyContractor has no trade field — filter is visual-only (all shown for any trade chip)
  const visible = contractors;

  return (
    <div className="flex flex-col min-h-0">
      {/* Trade filter chips */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {TRADE_CHIPS.map((chip) => {
          const isActive = activeFilter === chip.key;
          const count = chip.key === "all" ? contractors.length : 0;
          return (
            <button
              key={chip.key}
              onClick={() => setActiveFilter(chip.key)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-slate-900 text-white border border-slate-900"
                  : "bg-white text-slate-500 border border-warm-border hover:border-slate-300"
              }`}
            >
              {chip.label}
              {chip.key === "all" && (
                <span
                  className={`text-[11px] px-1.5 rounded-full font-medium ${
                    isActive ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Results header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-warm-border">
        <span className="text-[11px] text-slate-500 uppercase tracking-[0.05em] font-semibold">
          {showLiveIndicator ? "Live · ranked by response time" : "Available · ranked by response time"}
        </span>
        {showLiveIndicator && (
          <span className="text-[11px] text-slate-400 inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Updated 2s ago
          </span>
        )}
      </div>

      {/* Rows */}
      {visible.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">No pros available nearby.</p>
      ) : (
        <div className="flex flex-col gap-3 overflow-auto flex-1 pb-6">
          {visible.map((c) => (
            <DirectoryRow key={c.user_id} contractor={c} isLoggedIn={isLoggedIn} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd web && npx jest __tests__/directory-list.test.tsx --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add web/components/directory/directory-list.tsx web/__tests__/directory-list.test.tsx
git commit -m "feat: add DirectoryList with trade filter chips"
```

---

## Task 9: Public & Signed-in Directory Pages

**Files:**
- Create: `web/components/directory/public-directory.tsx`
- Create: `web/components/directory/signed-in-directory.tsx`
- Create: `web/app/page.tsx`

- [ ] **Step 1: Create PublicDirectory component**

Create `web/components/directory/public-directory.tsx`:

```tsx
import { DirectoryList } from "./directory-list";
import type { NearbyContractor } from "@/lib/types";

const DEFAULT_ADDRESS = "247 Lake Ave, Brooklyn";

interface PublicDirectoryProps {
  contractors: NearbyContractor[];
}

export function PublicDirectory({ contractors }: PublicDirectoryProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Hero */}
      <section className="px-10 pt-6 pb-4 flex-shrink-0">
        <h1 className="text-[30px] font-bold text-slate-900 tracking-[-0.02em] m-0">
          {contractors.length} pros near{" "}
          <span className="text-blue-600">{DEFAULT_ADDRESS}</span>
        </h1>
      </section>

      {/* Two-column */}
      <div className="flex gap-7 px-10 pb-7 flex-1 min-h-0 overflow-hidden">
        {/* List */}
        <main className="flex-1 min-w-0 flex flex-col min-h-0">
          <DirectoryList contractors={contractors} isLoggedIn={false} />
        </main>

        {/* Aside: locked map + how it works */}
        <aside className="w-[320px] flex-shrink-0 flex flex-col gap-4 overflow-auto">
          <LockedMapPromo />
          <HowItWorks />
        </aside>
      </div>
    </div>
  );
}

function LockedMapPromo() {
  return (
    <div className="bg-white border border-warm-border rounded-card p-4">
      {/* Static map preview */}
      <div className="relative h-[160px] rounded-[10px] overflow-hidden mb-3.5">
        <svg viewBox="0 0 320 160" className="w-full h-full" style={{ background: "#eef1ea" }}>
          <path d="M0 0 L320 0 L320 30 C260 45, 200 20, 140 35 C90 48, 40 28, 0 42 Z" fill="#cfdef0" />
          <ellipse cx="50" cy="130" rx="60" ry="35" fill="#d9e7d0" />
          <ellipse cx="280" cy="70" rx="50" ry="30" fill="#d9e7d0" />
          <g stroke="#fff" fill="none" strokeWidth="8"><path d="M-5 80 L325 76" /></g>
          <g stroke="#fff" fill="none" strokeWidth="5"><path d="M155 -5 L160 165" /><path d="M-5 120 L325 122" /></g>
          <g fill="#e7e1d2">
            <rect x="20" y="55" width="60" height="22" rx="1" /><rect x="20" y="90" width="60" height="16" rx="1" />
            <rect x="100" y="55" width="65" height="22" rx="1" /><rect x="185" y="55" width="60" height="22" rx="1" />
            <rect x="185" y="90" width="60" height="16" rx="1" /><rect x="260" y="90" width="55" height="16" rx="1" />
          </g>
        </svg>
        {/* Pin dots */}
        {([[40, 50], [70, 30], [30, 80], [80, 70], [55, 60]] as [number, number][]).map(([x, y], i) => (
          <div
            key={i}
            className="absolute rounded-full bg-blue-600"
            style={{
              left: `${x}%`, top: `${y}%`,
              width: 10, height: 10,
              transform: "translate(-50%, -50%)",
              boxShadow: "0 0 0 2px #fff, 0 0 0 3px rgba(37,99,235,0.25)",
            }}
          />
        ))}
        {/* Frosted overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "rgba(248,250,252,0.65)", backdropFilter: "blur(2px)" }}
        >
          <div
            className="bg-white rounded-full px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900"
            style={{ boxShadow: "0 6px 18px -4px rgba(15,23,42,0.18)" }}
          >
            🔒 Sign in to view live map
          </div>
        </div>
      </div>

      <h3 className="m-0 text-[15px] font-semibold text-slate-900">See pros live on a map</h3>
      <p className="mt-1.5 mb-3 text-[13px] text-slate-500 leading-relaxed">
        Watch them move toward you in real time after you request. Free account, takes 30 seconds.
      </p>
      <a
        href="/register"
        className="block w-full text-center bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors"
      >
        Create free account
      </a>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    ["Browse", "See verified pros within a few miles. No bids, no callbacks."],
    ["Request", "Tap a pro — they get the request instantly."],
    ["Track", "Watch them arrive on a live map."],
    ["Pay", "Settle directly. No platform fee."],
  ] as const;

  return (
    <div className="px-2 py-1">
      <h3 className="m-0 text-[13px] font-semibold text-slate-900 uppercase tracking-[0.06em]">
        How Knect works
      </h3>
      <ol className="mt-3 list-none p-0 flex flex-col gap-3">
        {steps.map(([title, desc], i) => (
          <li key={title} className="flex gap-3">
            <span className="w-[22px] h-[22px] rounded-full bg-blue-50 text-blue-700 text-xs font-bold inline-flex items-center justify-center flex-shrink-0">
              {i + 1}
            </span>
            <div>
              <div className="text-[13px] font-semibold text-slate-900">{title}</div>
              <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 2: Create SignedInDirectory component**

Create `web/components/directory/signed-in-directory.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { MapPin } from "lucide-react";
import { DirectoryList } from "./directory-list";
import { MapView } from "@/components/map/map-view";
import { JobStatusPanel } from "@/components/panels/job-status-panel";
import { useJob } from "@/components/providers/providers";
import { api } from "@/lib/api-client";
import type { NearbyContractor } from "@/lib/types";

const DEFAULT_LAT = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? "40.7128");
const DEFAULT_LNG = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? "-74.006");

interface SignedInDirectoryProps {
  initialContractors: NearbyContractor[];
}

export function SignedInDirectory({ initialContractors }: SignedInDirectoryProps) {
  const [contractors, setContractors] = useState<NearbyContractor[]>(initialContractors);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const { activeJob } = useJob();

  const fetchContractors = useCallback(async () => {
    try {
      const lat = userLocation?.lat ?? DEFAULT_LAT;
      const lng = userLocation?.lng ?? DEFAULT_LNG;
      const nearby = await api.nearbyContractors(lat, lng);
      setContractors(nearby);
    } catch {
      // keep previous data on error
    }
  }, [userLocation]);

  useEffect(() => {
    fetchContractors();
    const interval = setInterval(fetchContractors, 30_000);
    return () => clearInterval(interval);
  }, [fetchContractors]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Hero */}
      <section className="px-10 pt-5 pb-3 flex-shrink-0">
        <h2 className="text-[22px] font-semibold text-slate-900 m-0">
          {contractors.length} pros near you
        </h2>
      </section>

      {/* Two-column */}
      <div className="flex gap-6 px-10 pb-7 flex-1 min-h-0 overflow-hidden">
        {/* List */}
        <main className="flex-1 min-w-0 flex flex-col min-h-0">
          <DirectoryList
            contractors={contractors}
            isLoggedIn={true}
            showLiveIndicator={true}
          />
        </main>

        {/* Map sidebar */}
        <aside className="w-[380px] flex-shrink-0 flex flex-col gap-3">
          <div className="relative flex-1 min-h-[360px] bg-white border border-warm-border rounded-card overflow-hidden">
            <MapView
              onContractorClick={(id) => {
                // Navigation handled by capsule pins via router.push in MapView
              }}
              onUserLocationChange={setUserLocation}
            />
            {/* Recenter button */}
            <button
              className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-white border border-warm-border flex items-center justify-center"
              style={{ boxShadow: "0 2px 6px -2px rgba(15,23,42,0.15)" }}
              onClick={() => {}}
              aria-label="Recenter map"
            >
              <MapPin size={16} />
            </button>
          </div>
        </aside>
      </div>

      {activeJob && <JobStatusPanel />}
    </div>
  );
}
```

- [ ] **Step 3: Create the root page**

Create `web/app/page.tsx`:

```tsx
import { getSession } from "@/lib/session";
import { serverApi } from "@/lib/api-server";
import { Navbar } from "@/components/ui/navbar";
import { PublicDirectory } from "@/components/directory/public-directory";
import { SignedInDirectory } from "@/components/directory/signed-in-directory";

const DEFAULT_LAT = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? "40.7128");
const DEFAULT_LNG = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? "-74.006");

export default async function HomePage() {
  const session = await getSession();
  const isLoggedIn = !!session.access_token;

  const contractors = await serverApi.nearbyContractors(DEFAULT_LAT, DEFAULT_LNG);

  return (
    <>
      <Navbar isLoggedIn={isLoggedIn} />
      <div className="pt-[60px] h-full flex flex-col">
        {isLoggedIn ? (
          <SignedInDirectory initialContractors={contractors} />
        ) : (
          <PublicDirectory contractors={contractors} />
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Run all tests to verify nothing broke**

```bash
cd web && npx jest --no-coverage
```

Expected: All existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add web/components/directory/public-directory.tsx \
  web/components/directory/signed-in-directory.tsx \
  web/app/page.tsx
git commit -m "feat: add public and signed-in directory pages at root route"
```

---

## Task 10: Map Capsule Pins

**Files:**
- Modify: `web/components/map/map-view.tsx`

- [ ] **Step 1: Update MapView to use capsule pins and navigate to pro detail**

Replace `web/components/map/map-view.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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

function createCapsuleElement(
  rate: number | null,
  isAvailable: boolean,
  onClick: () => void
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "cursor: pointer; transform: translate(-50%, -100%);";

  const pill = document.createElement("div");
  pill.style.cssText = `
    display: inline-flex; align-items: center; gap: 6px;
    background: #fff; border-radius: 9999px; padding: 3px 9px 3px 4px;
    box-shadow: 0 4px 12px -2px rgba(15,23,42,0.18), 0 0 0 1px rgba(15,23,42,0.06);
    font-size: 11px; font-weight: 600; color: #0f172a;
    font-variant-numeric: tabular-nums;
  `;

  const dot = document.createElement("span");
  dot.style.cssText = `
    width: 16px; height: 16px; border-radius: 9999px;
    background: ${isAvailable ? "#2563eb" : "#9ca3af"};
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(15,23,42,0.1);
    flex-shrink: 0;
  `;

  const label = document.createElement("span");
  label.textContent = rate != null ? `$${rate}` : "···";

  const tail = document.createElement("div");
  tail.style.cssText = `
    width: 0; height: 0; margin: 0 auto;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 5px solid #fff;
    filter: drop-shadow(0 2px 1px rgba(15,23,42,0.1));
  `;

  pill.appendChild(dot);
  pill.appendChild(label);
  wrapper.appendChild(pill);
  wrapper.appendChild(tail);

  if (isAvailable) {
    wrapper.addEventListener("click", onClick);
  } else {
    wrapper.style.cursor = "default";
    wrapper.style.opacity = "0.6";
  }

  return wrapper;
}

export function MapView({ onContractorClick, onUserLocationChange }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const { contractors, availableIds, setAvailableIds } = useMapContractors();
  const [locationBanner, setLocationBanner] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const onClickRef = useRef(onContractorClick);
  const onLocationRef = useRef(onUserLocationChange);
  useEffect(() => { onClickRef.current = onContractorClick; }, [onContractorClick]);
  useEffect(() => { onLocationRef.current = onUserLocationChange; }, [onUserLocationChange]);

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

  const fetchNearby = useCallback(async () => {
    if (!userPos) return;
    try {
      const nearby = await api.nearbyContractors(userPos.lat, userPos.lng);
      setAvailableIds(new Set(nearby.map((c: NearbyContractor) => c.user_id)));
    } catch {
      // keep previous
    }
  }, [userPos, setAvailableIds]);

  useEffect(() => {
    fetchNearby();
    const interval = setInterval(fetchNearby, 30_000);
    return () => clearInterval(interval);
  }, [fetchNearby]);

  // User location pin
  useEffect(() => {
    if (!mapRef.current || !userPos) return;
    userMarkerRef.current?.remove();
    const el = document.createElement("div");
    el.style.cssText = `
      width: 16px; height: 16px; border-radius: 50%;
      background: #0f172a; border: 3px solid #fff;
      box-shadow: 0 0 0 6px rgba(15,23,42,0.12);
    `;
    userMarkerRef.current = new mapboxgl.Marker({ element: el })
      .setLngLat([userPos.lng, userPos.lat])
      .addTo(mapRef.current!);
  }, [userPos]);

  // Contractor capsule pins
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const [id, pos] of contractors) {
      const isAvailable = availableIds.has(id);
      const rate: number | null = null; // rate not in position data; shown as ···
      const el = createCapsuleElement(rate, isAvailable, () => {
        router.push(`/pro/${id}`);
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([pos.lng, pos.lat])
        .addTo(mapRef.current!);
      markersRef.current.push(marker);
    }
  }, [contractors, availableIds, router]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {locationBanner && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow px-4 py-2 text-sm text-slate-700 flex items-center gap-2 z-10">
          <span>Using default location — enable location for better results.</span>
          <button onClick={() => setLocationBanner(false)} className="text-slate-400 hover:text-slate-600 ml-1">✕</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/map/map-view.tsx
git commit -m "feat: redesign map pins to capsule style, navigate to pro detail on click"
```

---

## Task 11: Pro Detail Route

**Files:**
- Create: `web/app/(protected)/pro/[id]/page.tsx`
- Create: `web/app/(protected)/pro/[id]/pro-request-form.tsx`

- [ ] **Step 1: Create ProRequestForm (client component)**

Create `web/app/(protected)/pro/[id]/pro-request-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api-client";
import { useJob } from "@/components/providers/providers";

interface ProRequestFormProps {
  contractorId: string;
}

export function ProRequestForm({ contractorId }: ProRequestFormProps) {
  const router = useRouter();
  const { setActiveJob } = useJob();
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const job = await api.createJob({
        contractor_id: contractorId,
        description: description.trim(),
        location_lat: 0,
        location_lng: 0,
      });
      setActiveJob({ id: job.id, status: "pending", quote: null });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send request. Try again.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="block">
        <span className="text-[13px] font-medium text-slate-900 block mb-1.5">
          What do you need help with?
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your job…"
          required
          rows={4}
          className="w-full px-3 py-2.5 border border-warm-border rounded-[10px] text-sm text-slate-900 bg-white resize-none outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !description.trim()}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Sending…" : <>Send Request <ArrowRight size={14} /></>}
      </button>

      <p className="text-[11px] text-slate-400 text-center leading-relaxed">
        Your request goes directly to this pro. No platform fee.
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Create the pro detail page**

Create `web/app/(protected)/pro/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { serverApi } from "@/lib/api-server";
import { Avatar } from "@/components/ui/avatar";
import { Rating } from "@/components/ui/rating";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { ProRequestForm } from "./pro-request-form";
import type { PublicContractorProfile } from "@/lib/types";

const PALETTES = ["blue", "green", "amber", "rose", "mint", "violet"] as const;

function paletteFor(id: string): typeof PALETTES[number] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

async function getProfile(id: string): Promise<PublicContractorProfile | null> {
  try {
    return await serverApi.contractorProfile(id);
  } catch {
    return null;
  }
}

export default async function ProDetailPage({ params }: { params: { id: string } }) {
  const profile = await getProfile(params.id);
  if (!profile) notFound();

  const palette = paletteFor(profile.user_id);
  const rateUnit = profile.base_rate_unit === "per_hour" ? "/ hr" : "/ job";

  return (
    <div className="max-w-[1100px] mx-auto px-8 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
          <ArrowLeft size={14} /> Back to results
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-medium">{profile.display_name}</span>
      </div>

      <div className="flex gap-8 items-start">
        {/* Left column */}
        <main className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Header card */}
          <div className="bg-white border border-warm-border rounded-card-lg p-6 flex gap-5 items-start">
            <div className="relative flex-shrink-0">
              <Avatar name={profile.display_name} size={96} palette={palette} />
              <span
                className="absolute -bottom-1 -right-1 rounded-full border-[3px] border-white"
                style={{
                  width: 22,
                  height: 22,
                  background: profile.is_busy ? "#9ca3af" : "#10b981",
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[26px] font-bold text-slate-900 tracking-[-0.02em] m-0">
                  {profile.display_name}
                </h1>
                <VerifiedBadge />
              </div>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <Rating value={profile.avg_rating} count={profile.rating_count} />
              </div>
              {profile.bio && (
                <p className="mt-3 text-sm text-slate-600 leading-relaxed max-w-[620px]">
                  {profile.bio}
                </p>
              )}
            </div>
            {profile.base_rate != null && (
              <div className="flex-shrink-0 text-right">
                <div className="text-[30px] font-bold text-slate-900 tracking-[-0.02em] tabular-nums">
                  ${profile.base_rate}
                </div>
                <div className="text-xs text-slate-500">{rateUnit}</div>
              </div>
            )}
          </div>

          {/* Recent reviews */}
          {profile.ratings.length > 0 && (
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900 mb-3">Recent reviews</h2>
              <div className="flex flex-col gap-3">
                {profile.ratings.filter(r => r.review_text).slice(0, 5).map((r, i) => (
                  <div key={i} className="bg-white border border-warm-border rounded-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Avatar name="A" size={32} palette="blue" />
                        <span className="text-sm font-medium text-slate-900">Anonymous</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{formatDate(r.created_at)}</span>
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, si) => (
                            <span key={si} className={si < r.score ? "text-amber-400" : "text-slate-200"}>★</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">{r.review_text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Right aside: request form */}
        <aside className="w-[360px] flex-shrink-0 sticky top-[84px]">
          <div className="bg-white border border-warm-border rounded-card p-5">
            <h3 className="text-[15px] font-semibold text-slate-900 mb-4">Send a request</h3>
            {profile.is_busy ? (
              <div className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                {profile.display_name} is currently on another job. Try again soon.
              </div>
            ) : (
              <ProRequestForm contractorId={profile.user_id} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add "web/app/(protected)/pro/[id]/page.tsx" "web/app/(protected)/pro/[id]/pro-request-form.tsx"
git commit -m "feat: add pro detail route with request form"
```

---

## Task 12: Status Sheet Refactor

**Files:**
- Modify: `web/components/panels/job-status-panel.tsx`
- Create: `web/__tests__/job-status-panel-sheet.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `web/__tests__/job-status-panel-sheet.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { JobStatusPanel } from "@/components/panels/job-status-panel";

jest.mock("@/components/providers/providers", () => ({
  useJob: jest.fn(),
}));
jest.mock("@/lib/api-client", () => ({
  api: { getJob: jest.fn(), cancelJob: jest.fn() },
}));
jest.mock("@/components/panels/rating-panel", () => ({
  RatingPanel: () => <div data-testid="rating-panel" />,
}));

import { useJob } from "@/components/providers/providers";

beforeEach(() => jest.clearAllMocks());

test("renders nothing when no active job", () => {
  (useJob as jest.Mock).mockReturnValue({ activeJob: null, setActiveJob: jest.fn() });
  const { container } = render(<JobStatusPanel />);
  expect(container).toBeEmptyDOMElement();
});

test("shows waiting title for pending status", () => {
  (useJob as jest.Mock).mockReturnValue({
    activeJob: { id: "j1", status: "pending", quote: null },
    setActiveJob: jest.fn(),
  });
  render(<JobStatusPanel />);
  expect(screen.getByText(/waiting for contractor/i)).toBeInTheDocument();
});

test("shows accepted title for accepted status", () => {
  (useJob as jest.Mock).mockReturnValue({
    activeJob: { id: "j1", status: "accepted", quote: null },
    setActiveJob: jest.fn(),
  });
  render(<JobStatusPanel />);
  expect(screen.getByText(/on their way/i)).toBeInTheDocument();
});

test("shows Cancel Request button for pending", () => {
  (useJob as jest.Mock).mockReturnValue({
    activeJob: { id: "j1", status: "pending", quote: null },
    setActiveJob: jest.fn(),
  });
  render(<JobStatusPanel />);
  expect(screen.getByRole("button", { name: /cancel request/i })).toBeInTheDocument();
});

test("is positioned fixed bottom-right", () => {
  (useJob as jest.Mock).mockReturnValue({
    activeJob: { id: "j1", status: "pending", quote: null },
    setActiveJob: jest.fn(),
  });
  render(<JobStatusPanel />);
  const panel = screen.getByRole("complementary");
  expect(panel).toHaveClass("fixed");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd web && npx jest __tests__/job-status-panel-sheet.test.tsx --no-coverage
```

Expected: FAIL — panel not positioned as expected, wrong titles

- [ ] **Step 3: Implement the floating status sheet**

Replace `web/components/panels/job-status-panel.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Clock, Check, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useJob } from "@/components/providers/providers";
import { api } from "@/lib/api-client";
import { RatingPanel } from "./rating-panel";
import type { JobDetail } from "@/lib/types";

interface SheetConfig {
  Icon: LucideIcon;
  tintBg: string;
  tintFg: string;
  title: string;
}

const SHEET_CONFIG: Record<string, SheetConfig> = {
  pending: {
    Icon: Clock,
    tintBg: "#fef3c7",
    tintFg: "#92400e",
    title: "Waiting for contractor…",
  },
  accepted: {
    Icon: Check,
    tintBg: "#dcfce7",
    tintFg: "#047857",
    title: "On their way!",
  },
  in_progress: {
    Icon: Wrench,
    tintBg: "#eff6ff",
    tintFg: "#1d4ed8",
    title: "Job in progress",
  },
  completed: {
    Icon: Check,
    tintBg: "#f1f5f9",
    tintFg: "#475569",
    title: "Job complete",
  },
};

export function JobStatusPanel() {
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

  if (isTerminal) {
    return (
      <aside
        role="complementary"
        className="fixed bottom-8 right-8 w-[380px] z-30 bg-white rounded-card-lg"
        style={{ boxShadow: "0 18px 40px -16px rgba(15,23,42,0.22), 0 4px 12px -4px rgba(15,23,42,0.1)" }}
      >
        <div className="p-5">
          <p className="text-sm text-slate-600 mb-4">
            {status === "denied"
              ? "The contractor is unavailable. You can request a different contractor."
              : "Job cancelled — contractor went offline."}
          </p>
          <button
            onClick={() => setActiveJob(null)}
            className="w-full bg-slate-100 text-slate-700 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </aside>
    );
  }

  const config = SHEET_CONFIG[status];
  if (!config) return null;
  const { Icon, tintBg, tintFg, title } = config;

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

  return (
    <aside
      role="complementary"
      className="fixed bottom-8 right-8 w-[380px] z-30 bg-white rounded-card-lg overflow-hidden"
      style={{ boxShadow: "0 18px 40px -16px rgba(15,23,42,0.22), 0 4px 12px -4px rgba(15,23,42,0.1)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: tintBg }}>
        <span
          className="inline-flex items-center justify-center rounded-full w-9 h-9 flex-shrink-0"
          style={{ background: tintBg, color: tintFg, border: `1.5px solid ${tintFg}20` }}
        >
          <Icon size={18} />
        </span>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: tintFg }}>
            {status.replace("_", " ")}
          </div>
          <div className="text-[15px] font-semibold text-slate-900 leading-tight">{title}</div>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col gap-3">
        {status === "pending" && (
          <>
            <p className="text-sm text-slate-500">Typically responds within 60 seconds.</p>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full border border-red-300 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {cancelling ? "Cancelling…" : "Cancel Request"}
            </button>
          </>
        )}

        {status === "accepted" && (
          <>
            <p className="text-sm text-slate-500">Your pro is on the way.</p>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full border border-warm-border text-slate-600 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {cancelling ? "Cancelling…" : "Cancel Request"}
            </button>
          </>
        )}

        {status === "in_progress" && jobDetail?.quote && (
          <div className="border border-warm-border rounded-[10px] p-3 text-sm bg-warm-muted">
            <p className="font-medium text-slate-700 mb-1">Quote from contractor</p>
            {jobDetail.quote.custom_amount != null ? (
              <p>
                <span className="font-semibold text-slate-900 tabular-nums">
                  ${jobDetail.quote.custom_amount}
                </span>
                {jobDetail.quote.custom_note && (
                  <span className="text-slate-500 ml-1">— {jobDetail.quote.custom_note}</span>
                )}
              </p>
            ) : jobDetail.quote.base_rate_snapshot != null ? (
              <p>
                Base rate:{" "}
                <span className="font-semibold text-slate-900 tabular-nums">
                  ${jobDetail.quote.base_rate_snapshot}
                </span>
              </p>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd web && npx jest __tests__/job-status-panel-sheet.test.tsx --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Run full test suite**

```bash
cd web && npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add web/components/panels/job-status-panel.tsx web/__tests__/job-status-panel-sheet.test.tsx
git commit -m "feat: refactor JobStatusPanel to floating bottom-right sheet"
```

---

## Task 13: Jobs History Redesign

**Files:**
- Create: `web/components/jobs/jobs-client.tsx`
- Modify: `web/app/(protected)/jobs/page.tsx`
- Create: `web/__tests__/jobs-page.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/jobs-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JobsClient } from "@/components/jobs/jobs-client";
import type { CustomerJobListItem } from "@/lib/types";

const jobs: CustomerJobListItem[] = [
  {
    id: "job-1",
    contractor_id: "c1",
    contractor_display_name: "Sarah Khelka",
    status: "completed",
    description: "Fixed the drain",
    created_at: "2025-03-01T10:00:00Z",
    has_rating: false,
  },
  {
    id: "job-2",
    contractor_id: "c2",
    contractor_display_name: "Marcus Tate",
    status: "in_progress",
    description: "Panel upgrade",
    created_at: "2025-04-01T10:00:00Z",
    has_rating: false,
  },
];

test("renders My jobs heading", () => {
  render(<JobsClient jobs={jobs} totalSpent={null} />);
  expect(screen.getByRole("heading", { name: /my jobs/i })).toBeInTheDocument();
});

test("renders all jobs by default", () => {
  render(<JobsClient jobs={jobs} totalSpent={null} />);
  expect(screen.getByText("Sarah Khelka")).toBeInTheDocument();
  expect(screen.getByText("Marcus Tate")).toBeInTheDocument();
});

test("shows Leave a rating for completed unrated job", () => {
  render(<JobsClient jobs={jobs} totalSpent={null} />);
  expect(screen.getByRole("link", { name: /leave a rating/i })).toBeInTheDocument();
});

test("Active filter shows only in_progress job", async () => {
  render(<JobsClient jobs={jobs} totalSpent={null} />);
  await userEvent.click(screen.getByRole("button", { name: /^active/i }));
  expect(screen.getByText("Marcus Tate")).toBeInTheDocument();
  expect(screen.queryByText("Sarah Khelka")).not.toBeInTheDocument();
});

test("shows total spent when provided", () => {
  render(<JobsClient jobs={jobs} totalSpent={530} />);
  expect(screen.getByText(/530 spent/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && npx jest __tests__/jobs-page.test.tsx --no-coverage
```

Expected: FAIL — `Cannot find module '@/components/jobs/jobs-client'`

- [ ] **Step 3: Implement JobsClient**

The server component fetches data; a client component handles filter state. Create `web/components/jobs/jobs-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import type { CustomerJobListItem, JobStatus } from "@/lib/types";

const PALETTES = ["blue", "green", "amber", "rose", "mint", "violet"] as const;

function paletteFor(id: string): typeof PALETTES[number] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_PILL: Record<JobStatus, { bg: string; fg: string; label: string }> = {
  pending:     { bg: "#fef3c7", fg: "#92400e", label: "Pending" },
  accepted:    { bg: "#fef3c7", fg: "#92400e", label: "Accepted" },
  in_progress: { bg: "#eff6ff", fg: "#1d4ed8", label: "In progress" },
  completed:   { bg: "#f1f5f9", fg: "#475569", label: "Completed" },
  cancelled:   { bg: "#fef2f2", fg: "#b91c1c", label: "Cancelled" },
  denied:      { bg: "#fef2f2", fg: "#b91c1c", label: "Denied" },
};

const ACTIVE_STATUSES: JobStatus[] = ["pending", "accepted", "in_progress"];

type FilterKey = "all" | "active" | "completed" | "cancelled";

const FILTERS: { key: FilterKey; label: string; match: (s: JobStatus) => boolean }[] = [
  { key: "all",       label: "All",       match: () => true },
  { key: "active",    label: "Active",    match: (s) => ACTIVE_STATUSES.includes(s) },
  { key: "completed", label: "Completed", match: (s) => s === "completed" },
  { key: "cancelled", label: "Cancelled", match: (s) => s === "cancelled" || s === "denied" },
];

interface JobsClientProps {
  jobs: CustomerJobListItem[];
  totalSpent: number | null;
}

export function JobsClient({ jobs, totalSpent }: JobsClientProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const visible = jobs.filter((j) =>
    FILTERS.find((f) => f.key === activeFilter)!.match(j.status)
  );

  return (
    <div className="max-w-[1100px] mx-auto px-8 py-8">
      {/* Hero */}
      <h1 className="text-[30px] font-bold text-slate-900 tracking-[-0.022em] m-0">My jobs</h1>
      <p className="mt-1 text-sm text-slate-500">
        {jobs.length} jobs{totalSpent != null ? ` · $${totalSpent.toLocaleString()} spent in 2025` : ""}
      </p>

      {/* Filter chips */}
      <div className="flex gap-1.5 mt-5 mb-6 flex-wrap">
        {FILTERS.map((f) => {
          const count = jobs.filter((j) => f.match(j.status)).length;
          const isActive = activeFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-slate-900 text-white border border-slate-900"
                  : "bg-white text-slate-500 border border-warm-border hover:border-slate-300"
              }`}
            >
              {f.label}
              <span
                className={`text-[11px] px-1.5 rounded-full font-medium ${
                  isActive ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Job list */}
      {visible.length === 0 ? (
        <p className="text-sm text-slate-500">No jobs in this category.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((job) => {
            const pill = STATUS_PILL[job.status];
            return (
              <li
                key={job.id}
                className="bg-white border border-warm-border rounded-card p-[18px] flex items-center gap-4"
              >
                <Avatar name={job.contractor_display_name} size={48} palette={paletteFor(job.contractor_id)} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-semibold text-slate-900">
                      {job.contractor_display_name}
                    </span>
                    <span
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                      style={{ background: pill.bg, color: pill.fg }}
                    >
                      {pill.label}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 truncate mt-0.5">{job.description}</p>
                  <div className="text-xs text-slate-400 tabular-nums mt-0.5">
                    {formatDate(job.created_at)} · #{job.id.slice(0, 8)}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  {job.status === "completed" && !job.has_rating && (
                    <Link
                      href={`/?rate=${job.id}`}
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      Leave a rating
                    </Link>
                  )}
                  <Link
                    href={`/pro/${job.contractor_id}`}
                    className="text-xs text-slate-500 hover:text-slate-900 font-medium transition-colors"
                  >
                    Details →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd web && npx jest __tests__/jobs-page.test.tsx --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Update the jobs server page to use JobsClient**

Replace `web/app/(protected)/jobs/page.tsx` with:

```tsx
import { serverApi } from "@/lib/api-server";
import { JobsClient } from "@/components/jobs/jobs-client";
import type { CustomerJobListItem } from "@/lib/types";

function computeSpent(jobs: CustomerJobListItem[]): number | null {
  const completed = jobs.filter((j) => j.status === "completed");
  if (completed.length === 0) return null;
  // has_rating is the only field we have; no quote data in list items
  // Return null — spent total requires quote data not available in list response
  return null;
}

export default async function JobsPage() {
  let jobs: CustomerJobListItem[] = [];
  try {
    jobs = await serverApi.listJobs();
  } catch {
    // session may have expired; middleware will redirect if needed
  }

  return <JobsClient jobs={jobs} totalSpent={computeSpent(jobs)} />;
}
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Run full test suite**

```bash
cd web && npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add web/components/jobs/jobs-client.tsx web/app/(protected)/jobs/page.tsx \
  web/__tests__/jobs-page.test.tsx
git commit -m "feat: redesign jobs history with filter chips and L1 card style"
```

---

## Final Verification

- [ ] **Run all tests one last time**

```bash
cd web && npx jest --no-coverage
```

Expected: All tests pass. Note the count — should be greater than the original test count.

- [ ] **TypeScript clean build**

```bash
cd web && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Summary commit tag**

```bash
git tag l1-phase-a-complete
```
