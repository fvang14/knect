# Profile Settings & Locked Map Preview — Design

**Date:** 2026-05-22
**Status:** Approved (pending review)
**Scope:** `web/` (Next.js customer app) and `backend/` (Rust/Axum)

## Goal

Add a signed-in user profile/settings page and replace the static SVG "locked map" on the public home page with a lightweight real-map preview. Login and signup already exist and are out of scope for this spec.

## Non-goals

- Google OAuth, forgot/reset password, email verification.
- Phone number editing.
- 2FA, session/device management.
- Contractor-specific profile fields (bio, trades, hourly rate) — those live in the admin app.

## Architecture

Two largely independent workstreams in one spec because they share user-state plumbing in the Navbar:

1. **Profile/settings** — new backend `/me` module, new `/settings` route in `web/`, new `user_avatars` table.
2. **Locked map preview** — frontend-only swap of the SVG mock for a Mapbox Static Images `<img>`.

---

## 1. Backend changes

### 1.1 Migration `0013_create_user_avatars.sql`

```sql
CREATE TABLE user_avatars (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bytes BYTEA NOT NULL,
  content_type TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

A dedicated table keeps bytea data out of profile tables that are read on every nearby-contractor request.

### 1.2 Cascade audit

Before merging, verify that deleting a `users` row cascades through every dependent table: `customer_profiles`, `contractor_profiles`, `jobs`, `quotes`, `ratings`, `user_avatars`. If any FK is missing `ON DELETE CASCADE`, add it in this migration.

### 1.3 New module `backend/src/me/`

Mount under `/me`. All routes require `AuthUser` except `GET /users/:id/avatar`, which is public.

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/me` | Returns `{ id, email, role, display_name, has_avatar, avatar_updated_at }`. Joins `customer_profiles` or `contractor_profiles` based on role. |
| `PATCH` | `/me` | Body: `{ display_name?, email? }`. Validates name length 1–80. Email conflict → 409. |
| `POST` | `/me/password` | Body: `{ current, new }`. Verifies current password; 401 on mismatch. Hashes new and writes. |
| `POST` | `/me/avatar` | `multipart/form-data`. Allowlist: `image/jpeg`, `image/png`, `image/webp`. Max 2 MB → 413 on oversize. Upserts into `user_avatars`. |
| `DELETE` | `/me/avatar` | Idempotent removal. |
| `DELETE` | `/me` | Rejects (409) if the user has an active (non-terminal) job; otherwise deletes the user row, cascade cleans the rest. |
| `GET` | `/users/:id/avatar` | Public. Returns bytes with the stored `Content-Type` and `Cache-Control: public, max-age=86400`. 404 if missing. |

### 1.4 `/auth/me` left in place

The existing `GET /auth/me` returns only `{ id, email, phone, role }` and is currently unused by the `web/` client. Leave it as-is; the new `/me` endpoint supersedes it for richer data but we don't need to delete or migrate anything in this change.

### 1.5 Backend tests

Integration tests under `backend/tests/` per handler:

- `GET /me` returns joined display name and avatar metadata for both roles.
- `PATCH /me` rejects 409 on email collision; rejects empty name.
- `POST /me/password` rejects 401 on wrong current password.
- `POST /me/avatar` rejects 413 over 2 MB and 415 on disallowed content type; round-trips through `GET /users/:id/avatar`.
- `DELETE /me` rejects 409 with an active job; succeeds otherwise and cascades through profile/avatar/jobs/quotes/ratings.

---

## 2. Frontend — settings page

### 2.1 File layout

```
web/app/(protected)/settings/
  page.tsx           # server component, fetches GET /me
  actions.ts         # server actions for each mutation
  delete-dialog.tsx  # client component for the type-to-confirm modal
```

Placement under `(protected)` lets the existing middleware enforce auth.

### 2.2 Page structure

Single column, ~640px max-width, L1 design tokens. Three sections, each its own `<form>` with an isolated Save button:

1. **Profile** — Avatar (current image + Upload/Remove) and Display name.
2. **Account** — Email and a "Change password" subsection (current, new, confirm).
3. **Danger zone** — Sign out button and Delete account button (opens type-to-confirm modal).

After a successful save, the server action calls `revalidatePath('/settings')` so the page re-renders with fresh data.

### 2.3 Server actions (`actions.ts`)

| Action | Calls | Notes |
|---|---|---|
| `updateProfileAction` | `PATCH /me` | Validates name length; surfaces 409 as "Email already taken". |
| `changePasswordAction` | `POST /me/password` | Surfaces 401 as "Current password incorrect". |
| `uploadAvatarAction` | `POST /me/avatar` | Reads `File` from FormData, forwards as multipart; client-side rejects >2 MB before submit. |
| `removeAvatarAction` | `DELETE /me/avatar` | Idempotent. |
| `signOutAction` | `POST /api/logout` (existing) | Clears session, redirects to `/`. |
| `deleteAccountAction` | `DELETE /me` | Requires typed email confirmation. Clears session, redirects to `/?deleted=1`. Surfaces 409 ("Cancel active jobs first") inline. |

Validation is server-side only — return `{ error: "…" }` to `searchParams` (the pattern login/register already use). No client-side validation libraries.

### 2.4 Avatar rendering

`<img src="/users/{id}/avatar?v={avatar_updated_at}" />` — the version query param busts the browser cache when the user uploads a new avatar. When `has_avatar` is false, render the existing initial-letter `Avatar` component.

### 2.5 Frontend tests

Jest tests under `web/__tests__/` for each server action: happy path plus the documented error branch (oversize avatar, wrong current password, email collision, missing delete confirmation, delete-with-active-job).

---

## 3. Navigation & session plumbing

### 3.1 Root layout fetches `/me`

Move the session read into `app/layout.tsx`: when the session has a valid token, call `GET /me` server-side and pass a `meUser` prop down. Every page that today renders `<Navbar isLoggedIn={...} />` (home, login, register, protected pages) receives the same `meUser` through layout context (or by accepting it as a prop). Replaces today's bare `isLoggedIn` boolean. Logged-out pages render the Navbar's logged-out state as before.

### 3.2 Navbar avatar menu

Extend the existing logged-in Navbar with an avatar button on the right that opens a dropdown menu:

- "Settings" → `/settings`
- "Sign out" → submits to `app/api/logout`

The avatar uses `meUser.id` + `avatar_updated_at` (or the initial-letter fallback). Logged-out state is unchanged.

### 3.3 Delete-account modal

Client component (`delete-dialog.tsx`): user types their email, the Delete button enables, server action runs. On success the user lands on `/?deleted=1` and a one-time toast renders.

---

## 4. Locked map preview (logged-out users)

### 4.1 Mapbox Static Images

Replace the SVG inside `LockedMapPromo` (in `components/directory/public-directory.tsx`) with a single Mapbox Static Images request:

```
https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/
  {DEFAULT_LNG},{DEFAULT_LAT},13,0/640x320@2x
  ?access_token={NEXT_PUBLIC_MAPBOX_TOKEN}
```

- Rendered via `<img loading="lazy" decoding="async" />`. One PNG GET, browser-cached, no SDK bundle.
- Keep the existing frosted overlay + "🔒 Sign in to view live map" pill. Bump blur from 2 px to 4 px so the photoreal underlay still reads as locked.
- Coordinates from the existing `NEXT_PUBLIC_DEFAULT_LAT/LNG` env vars.

### 4.2 New component

`components/map/locked-map-preview.tsx` — extracts the preview so it's testable. `LockedMapPromo` becomes a thin wrapper that renders `<LockedMapPreview />` plus the existing CTA copy and "Create free account" button.

### 4.3 No SDK in the public path

Confirm that `mapbox-gl` is only imported from `components/map/map-view.tsx`, which is only mounted inside `SignedInDirectory`. The locked preview must not import `mapbox-gl`.

---

## 5. Edge cases

- Email change collides → 409 → inline field error, no partial write.
- Current password wrong → 401 → "Current password incorrect" inline.
- Avatar over 2 MB or wrong type → rejected client-side first, then server enforces.
- Session expires mid-edit → existing 401 → `/login` redirect in `api-client.ts` handles this.
- Delete with active job → backend 409 → "Cancel active jobs first" inline; user is not signed out.

---

## 6. Testing summary

- **Backend** — integration tests per handler (auth required, 401/409/413/415 paths, cascade-on-delete, avatar round-trip).
- **Frontend Jest** — server action tests for happy paths and documented error branches.
- **Playwright e2e** — one flow: log in → change display name → upload avatar → sign out → verify locked map preview renders on `/`.

---

## 7. Rollout

Single PR, single migration. Order of work in the implementation plan:

1. Migration + cascade audit.
2. Backend `/me` module + tests.
3. Frontend `/settings` page + server actions + tests.
4. Navbar wiring (`meUser` prop, avatar menu).
5. Locked map preview swap.
6. Playwright e2e.
