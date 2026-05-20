# L1 Directory Redesign — Phase A Design Spec

**Date:** 2026-05-19
**Source:** `design_handoff_l1_directory/`
**Scope:** Phase A — core customer journey (13 screens total; Phase A covers 8)

---

## Overview

Reskin the Knect customer web app from a map-first surface to a warm, directory-first surface (Yelp / Thumbtack feel). Same product, same flows, same brand color. The map is gated behind sign-in on the public view and demoted to a sidebar on the signed-in view.

**Out of scope for Phase A:** Empty state, busy modal, mobile layout (Phase B). Invented features not in the backend (Top 5% badge, Quick match callout, stats row on pro detail, Notify me affordance) are skipped entirely.

---

## 1. Architecture & Routing

### Route changes

| Route | Before | After |
|---|---|---|
| `/` | Redirected logged-out → `/login` | Public directory for logged-out users |
| `/` (logged-in) | Full-bleed map | Signed-in directory + 380px map sidebar |
| `/pro/[id]` | Didn't exist | New pro detail page (protected) |
| `/login` | Centered card on `gray-50` | Split-screen layout |
| `/register` | Centered card on `gray-50` | Split-screen layout |
| `/jobs` | Simple list | Redesigned with filter chips |

### Middleware

`middleware.ts` is updated to:
- Allow `/` to be public (unauthenticated users see the public directory)
- Continue protecting `/pro/[id]` and `/jobs` — unauthenticated requests redirect to `/login`
- API routes remain unchanged

### Component additions

**New shared primitives** (`components/ui/`):
- `Avatar` — gradient circle, palette prop, initials from name
- `Rating` — amber star + bold score + muted count, tabular numerals
- `TradeChip` — pill with lucide-react icon + trade label
- `VerifiedBadge` — 18px filled blue circle with white Check

**New directory components** (`components/directory/`):
- `DirectoryList` — client component, handles trade filter state
- `DirectoryRow` — pro row card, uses shared primitives

**New pages:**
- `app/page.tsx` — public directory (server component)
- `app/pro/[id]/page.tsx` — pro detail (server component + `ProRequestForm` client component)

**Updated:**
- `components/ui/navbar.tsx` — two states (logged-out / logged-in)
- `components/map/map-view.tsx` — capsule pins replacing dot pins
- `components/panels/job-status-panel.tsx` — floating bottom-right sheet

### State management

No new global state. `activeJob` context survives navigation (providers wrap the whole app). After submitting a request from `/pro/[id]`, `router.push('/')` triggers the status sheet via existing context.

---

## 2. Design Tokens & Shared UI Primitives

### Tailwind config additions (`web/tailwind.config.ts`)

```ts
theme: {
  extend: {
    colors: {
      'warm-bg':     '#faf8f4',
      'warm-border': '#ece6d6',
      'warm-line':   '#f3eee2',
      'warm-muted':  '#fafaf7',
    },
    borderRadius: {
      'card':    '14px',
      'card-lg': '16px',
    },
  },
},
```

### Globals (`web/app/globals.css`)

- `.tabular-nums { font-variant-numeric: tabular-nums; }` utility class
- `@keyframes rfPulse` for waiting-state map pin:
  ```css
  @keyframes rfPulse {
    0%   { transform: translateX(-50%) scale(0.4); opacity: 0.5; }
    100% { transform: translateX(-50%) scale(1.6); opacity: 0; }
  }
  ```

### Shared primitives

**`Avatar`** — props: `name: string`, `size?: number` (default 36), `palette: 'blue'|'green'|'amber'|'rose'|'mint'|'violet'`. Renders initials (up to 2 words). Background: gradient per palette. Fully round.

**`Rating`** — props: `value: number`, `count: number`, `size?: number`. Amber filled Star icon + bold value + muted `(count)`. Tabular numerals.

**`TradeChip`** — props: `trade: string`. Maps trade key to label + lucide-react icon (Wrench→plumbing, Plug→electrical, Snowflake→hvac, Hammer→carpentry, Shield→locksmith, Zap→handyman). Warm border pill.

**`VerifiedBadge`** — no props. 18px blue circle with white Check icon.

---

## 3. Navbar

`components/ui/navbar.tsx` — accepts `isLoggedIn: boolean`, `user?: { displayName: string }`.

**Logged-out:**
- 60px, white, `warm-border` bottom
- Left: wordmark. Center: "Find a pro" (active) · "For pros" · "How it works". Right: "Sign in" ghost + "Get started" primary (→ `/register`)

**Logged-in:**
- Same shell
- Center: "Find a pro" · "My jobs" (→ `/jobs`)
- Right: 32px Avatar + first name + ChevronDown (no dropdown). Display name comes from the protected layout. If unavailable (session returns token only, no profile endpoint yet), Avatar shows "U" and name text is omitted.

Hover transitions: 150ms `transition-colors`. Primary `hover:bg-blue-700`. Ghost `hover:bg-slate-50`. Nav links `hover:text-slate-900`.

---

## 4. Auth Pages

Both `app/login/page.tsx` and `app/register/page.tsx` use a shared `AuthLayout` component. Existing server actions (`loginAction`, `registerAction`) are unchanged.

**Layout:** 50/50 horizontal split, full viewport height.

**Left panel (`#faf8f4`):**
- Header: wordmark top-left + switch link top-right
- Centered form (max-w-380): H1 30px/700, 14px subhead, field stack
- Login fields: Email, Password (+ "Forgot?" trailing link → `/forgot`, which 404s for now)
- Register fields: Name, Email, Password (no phone — not in backend schema)
- Primary CTA full-width (rounded-[10px], 10px padding)
- "or" divider with `warm-border` hairlines
- "Continue with Google" button — `opacity-50 cursor-not-allowed` (no Google SSO in backend)
- Register only: 11px terms line

**Right panel (`#0f172a`):**
- Static inline SVG map collage at 60% opacity (translated from `MapBase` prototype)
- Vertical gradient mask: `transparent → #0f172a` from 0% to 100%
- Four hardcoded floating pin cards (Sarah/$65 blue, Marcus/$90 amber, Diego/$75 rose, Priya/$55 mint) absolutely positioned
- Bottom copy: H2 "Six verified pros within a mile of you." + subhead + stat columns (12k+ pros · 11 min ETA · 0% fee)

**Field component:** label above (13px/500), input with 10px padding, 10px radius, `warm-border`, white bg.

---

## 5. Public Directory

`app/page.tsx` — server component, no auth.

**Data:** Fetches `api.nearbyContractors(DEFAULT_LAT, DEFAULT_LNG)` server-side. Renders up to 6 results.

**Layout (`#faf8f4`):**
- Logged-out Navbar
- Hero: H1 "N pros near **247 Lake Ave**" (address span `text-blue-600`), address chip + radius chip + sort ghost button
- Trade filter row: All/Plumbing/Electrical/HVAC/Carpentry/Locksmith/Handyman with count badges. Client-side filter only — `DirectoryList` is a client component.
- Two-column main:
  - Left (flex-1): `DirectoryList` with eyebrow header
  - Right (320px): Locked map promo card + "How Knect works" explainer

**Locked map promo:** Static SVG map (same as auth right panel) + frosted overlay (`rgba(248,250,252,0.65)`, `backdrop-blur-sm`) + "Sign in to view live map" pill + "Create free account" CTA → `/register`.

**`DirectoryRow` on public page:** "Request →" button → `/login` (not `/pro/[id]`).

---

## 6. Signed-in Directory + Map Pins

`app/(protected)/page.tsx` — rewritten. Full-bleed `MapView` replaced by sidebar. `ContractorPanel` removed from this page.

**Layout:**
- Logged-in Navbar
- Tighter hero: H2 "N pros near you" + address chip + radius chip + sort
- Trade filter row (client-side)
- Two-column main:
  - Left (flex-1): `DirectoryList` with live indicator (green dot + "Updated Ns ago")
  - Right (380px): `MapView` in 14px-radius card

**`DirectoryRow` on signed-in page:** "Request →" → `/pro/[id]`.

**`DirectoryList`:** Fetches `api.nearbyContractors()` on mount + every 30s (signed-in only). The public directory receives its data as a server-rendered prop — no client-side polling. WebSocket still updates map pin positions on the signed-in page.

**Map pin redesign (`components/map/map-view.tsx`):**

Capsule pins replace dot pins:
- White pill: 16px colored dot + `$rate` text
- Shadow: `0 4px 12px -2px rgba(15,23,42,0.18), 0 0 0 1px rgba(15,23,42,0.06)`
- CSS triangle tail below (5px borders)
- Available: blue dot `#2563eb`. Busy: gray dot `#9ca3af`
- Click → `router.push('/pro/[id]')` (replaces old `onContractorClick` panel open)

**User pin:** 16px `#0f172a` dot, 3px white border, `box-shadow: 0 0 0 6px rgba(15,23,42,0.12)`.

**Recenter button:** 36px white circle, bottom-right of map card, `MapPin` icon.

---

## 7. Pro Detail Route

`app/pro/[id]/page.tsx` — server component fetches profile, passes to client `ProRequestForm`.

**Breadcrumb:** "← Back to results" → `/`, then trade, then pro name. 14px `slate-500`.

**Left column (flex-1):**
- Header card (24px padding, 16px radius, `warm-border`):
  - 96px Avatar with 22px status dot (green=available, gray=busy)
  - Name H1 26px/700 + VerifiedBadge
  - TradeChip + Rating + distance (from `distance_meters / 1609`) + member-since (not in schema — omit)
  - Bio paragraph 14px, max-w-620
  - Right-aligned: rate 30px/700 tabular + unit label
- Recent reviews: up to 5 `profile.ratings` cards (32px Avatar with "A" initial, formatted date, 5-star display, review text). Cards with `review_text: null` are skipped.

**Right column (360px, sticky):**
- Mini-map: Static `MapBase` SVG + user location pin only. `PublicContractorProfile` has no lat/lng so no pro pin is shown. Distance overlay omitted.
- `ProRequestForm` (client component):
  - "What do you need help with?" textarea, 96px min-height, 10px radius, `warm-border`
  - ETA info row (only if contractor has ETA — not in `PublicContractorProfile` schema, omit)
  - "Send Request →" primary button full-width
  - On submit: `api.createJob({ contractor_id, description, location_lat, location_lng })` → `setActiveJob(...)` → `router.push('/')`
  - Inline error below button

---

## 8. Status Sheet Refactor

`components/panels/job-status-panel.tsx` — floating bottom-right sheet.

**Position:** `fixed bottom-8 right-8 w-[380px] z-30`. Shadow: `0 18px 40px -16px rgba(15,23,42,0.22), 0 4px 12px -4px rgba(15,23,42,0.1)`. `rounded-card-lg` (16px).

**Sheet header per status:**

| Status | Icon | Tint bg | Title |
|---|---|---|---|
| `pending` | Clock | `#fef3c7` | "Waiting for contractor…" |
| `accepted` | Check | `#dcfce7` | "On their way!" |
| `in_progress` | Wrench | `#eff6ff` | "Job in progress" |
| `completed` | Check | `#f1f5f9` | "Job complete" |

**Body per status:**
- `pending`: "Typically responds within 60 seconds." + red-outline Cancel button
- `accepted`: Contractor name + blue ETA card if available + Cancel button
- `in_progress`: Quote card (existing logic) + ghost "Mark as complete" (non-interactive — contractor-controlled)
- `completed`: Hands off to existing `RatingPanel` (unchanged)
- `denied` / `cancelled`: Existing dismiss dialog (unchanged)

---

## 9. Jobs History

`app/(protected)/jobs/page.tsx` — server component for data, client component for filter.

**Data:** Same `serverApi.listJobs()` call. Spent total = sum of `quote.custom_amount ?? quote.base_rate_snapshot` for completed jobs with quotes.

**Layout (max-w-1100, centered):**
- H1 "My jobs" 30px/700 + subhead "N jobs · $X spent in 2025" (dollar figure omitted if no quote data)
- Filter chips: All / Active / Completed / Cancelled with count badges. "Active" = `pending | accepted | in_progress`. Client-side only.

**`JobRow` card (14px radius, `warm-border`, 18px padding):**
- Left: 48px Avatar (initials from `contractor_display_name`, palette from `contractor_id` hash mod 6)
- Center: name 15px/600 + status pill + description (single line, truncated) + date + `#job-id` (12px `slate-400` tabular)
- Right: `$amount` 20px/700 tabular if completed with quote, "—" if cancelled, nothing if active. "Leave a rating" link if `completed && !has_rating` → `/?rate=${job.id}`. `Details →` → `/pro/[contractor_id]`

**Status pill colors:**
| Status | bg | fg |
|---|---|---|
| `in_progress` | `#eff6ff` | `#1d4ed8` |
| `completed` | `#f1f5f9` | `#475569` |
| `cancelled` | `#fef2f2` | `#b91c1c` |
| `pending` / `accepted` | `#fef3c7` | `#92400e` |
| `denied` | `#fef2f2` | `#b91c1c` |

---

## Implementation Order (Phase A)

1. Design tokens — `tailwind.config.ts` + `globals.css`
2. Shared UI primitives — `Avatar`, `Rating`, `TradeChip`, `VerifiedBadge`
3. Navbar — logged-out + logged-in states
4. Auth pages — `login` + `register` split-screen
5. Public directory — `app/page.tsx` + `DirectoryList` + `DirectoryRow`
6. Signed-in directory — rewrite `app/(protected)/page.tsx`
7. Map pin capsules — update `map-view.tsx`
8. Pro detail route — `app/pro/[id]/page.tsx` + `ProRequestForm`
9. Status sheet — refactor `job-status-panel.tsx`
10. Jobs history — rewrite `app/(protected)/jobs/page.tsx`

---

## Open Questions (deferred)

- Phase B screens: empty state, busy modal, mobile layout
- Google SSO: button rendered disabled; implementation deferred
- "Forgot password" route: links to `/forgot` which 404s; implementation deferred
- `NearbyContractor` does not include trade type — `TradeChip` on directory rows will need either a backend field addition or a client-side mapping from `bio`/existing data. **Confirm before implementing directory rows.**
- `CustomerJobListItem` does not include trade type — `TradeChip` on job rows omitted per design.
- Rating score not available in `CustomerJobListItem` — "has rated" shown as a checkmark indicator only, not a star score.
