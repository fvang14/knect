# Profile Settings & Locked Map Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a signed-in user profile/settings page (display name, email, password, avatar, sign out, delete account) and replace the SVG "locked map" on the public home with a real Mapbox Static Images preview.

**Architecture:** Backend adds a `/me` module (handlers under `backend/src/me/`) plus a `user_avatars` table for bytea storage. Frontend adds `/settings` (under the existing `(protected)` group) with Next.js Server Actions, threads a `meUser` prop from the root layout to the Navbar, and swaps the SVG locked map for a single `<img>` Mapbox Static call. All mutations go directly to backend endpoints via the existing iron-session token.

**Tech Stack:** Rust (Axum 0.7, sqlx/Postgres), Next.js 14 (App Router, Server Actions), iron-session, TypeScript, Jest + React Testing Library, Playwright. Mapbox Static Images API (no SDK on the public page).

**Spec:** `docs/superpowers/specs/2026-05-22-profile-settings-and-locked-map-design.md`

---

## File map

**Backend — create:**
- `backend/migrations/0013_user_avatars_and_cascades.sql`
- `backend/src/me/mod.rs`
- `backend/src/me/handlers.rs`
- `backend/tests/me_test.rs`

**Backend — modify:**
- `backend/Cargo.toml` (add `multipart` feature to axum)
- `backend/src/lib.rs` (register `me` module + routes)

**Frontend — create:**
- `web/app/(protected)/settings/page.tsx`
- `web/app/(protected)/settings/actions.ts`
- `web/app/(protected)/settings/delete-dialog.tsx`
- `web/app/(protected)/settings/profile-section.tsx`
- `web/app/(protected)/settings/account-section.tsx`
- `web/app/(protected)/settings/danger-section.tsx`
- `web/components/map/locked-map-preview.tsx`
- `web/lib/me.ts` (typed `MeUser` + server-side `fetchMe()`)
- `web/__tests__/locked-map-preview.test.tsx`
- `web/__tests__/settings-actions.test.ts`
- `web/__tests__/navbar-meuser.test.tsx`
- `web/e2e/settings.spec.ts`

**Frontend — modify:**
- `web/app/layout.tsx` (root: fetch session + `meUser`, pass via React context provider)
- `web/components/providers/providers.tsx` (add `MeUserProvider`)
- `web/components/ui/navbar.tsx` (consume `meUser`, add dropdown menu)
- `web/app/page.tsx` (use `meUser` from context instead of inline session read)
- `web/components/directory/public-directory.tsx` (use new `LockedMapPreview`)
- `web/lib/api-client.ts` (optional: no changes — confirm)

---

## Task 1 — Backend migration: user_avatars table + cascade fixes

**Files:**
- Create: `backend/migrations/0013_user_avatars_and_cascades.sql`

**Why cascade fixes are in scope:** the spec's cascade audit (§1.2) caught that `jobs`, `quotes`, `ratings` all reference profile tables *without* `ON DELETE CASCADE`. Without this fix, `DELETE /me` will fail at FK enforcement once a user has any job history.

- [ ] **Step 1: Write the migration**

Create `backend/migrations/0013_user_avatars_and_cascades.sql`:

```sql
-- Avatar storage
CREATE TABLE user_avatars (
    user_id      UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bytes        BYTEA       NOT NULL,
    content_type TEXT        NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cascade fixes so DELETE /me works end-to-end.

-- jobs.customer_id → customer_profiles(user_id)
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_customer_id_fkey;
ALTER TABLE jobs
    ADD CONSTRAINT jobs_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customer_profiles(user_id) ON DELETE CASCADE;

-- jobs.contractor_id → contractor_profiles(user_id)
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_contractor_id_fkey;
ALTER TABLE jobs
    ADD CONSTRAINT jobs_contractor_id_fkey
    FOREIGN KEY (contractor_id) REFERENCES contractor_profiles(user_id) ON DELETE CASCADE;

-- quotes.contractor_id → contractor_profiles(user_id)
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_contractor_id_fkey;
ALTER TABLE quotes
    ADD CONSTRAINT quotes_contractor_id_fkey
    FOREIGN KEY (contractor_id) REFERENCES contractor_profiles(user_id) ON DELETE CASCADE;

-- ratings.job_id → jobs(id)
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_job_id_fkey;
ALTER TABLE ratings
    ADD CONSTRAINT ratings_job_id_fkey
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

-- ratings.contractor_id → contractor_profiles(user_id)
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_contractor_id_fkey;
ALTER TABLE ratings
    ADD CONSTRAINT ratings_contractor_id_fkey
    FOREIGN KEY (contractor_id) REFERENCES contractor_profiles(user_id) ON DELETE CASCADE;

-- ratings.customer_id → customer_profiles(user_id)
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_customer_id_fkey;
ALTER TABLE ratings
    ADD CONSTRAINT ratings_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customer_profiles(user_id) ON DELETE CASCADE;
```

- [ ] **Step 2: Apply against a scratch DB to confirm syntax**

Run: `cd backend && sqlx migrate run` (requires `DATABASE_URL` set to a local Postgres).
Expected: migration applies cleanly, no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/0013_user_avatars_and_cascades.sql
git commit -m "feat(db): add user_avatars table and cascade FKs for account deletion"
```

---

## Task 2 — Enable axum multipart, scaffold `me` module

**Files:**
- Modify: `backend/Cargo.toml`
- Create: `backend/src/me/mod.rs`
- Create: `backend/src/me/handlers.rs`
- Modify: `backend/src/lib.rs`

- [ ] **Step 1: Enable axum multipart feature**

In `backend/Cargo.toml`, change the axum line to:

```toml
axum = { version = "0.7", features = ["ws", "multipart"] }
```

- [ ] **Step 2: Create `backend/src/me/mod.rs`**

```rust
pub mod handlers;
```

- [ ] **Step 3: Create `backend/src/me/handlers.rs` with placeholders**

```rust
use axum::{extract::{Path, State}, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::{middleware::AuthUser, password::{hash_password, verify_password}},
    error::AppError,
    models::user::UserRole,
    AppState,
};

#[derive(Serialize)]
pub struct MeResponse {
    pub id: Uuid,
    pub email: String,
    pub role: UserRole,
    pub display_name: String,
    pub has_avatar: bool,
    pub avatar_updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn get_me(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> Result<Json<MeResponse>, AppError> {
    // SELECT email + display_name (from role-appropriate profile) + avatar metadata
    let display_name = match claims.role {
        UserRole::Customer => sqlx::query_scalar!(
            "SELECT display_name FROM customer_profiles WHERE user_id = $1",
            claims.sub
        )
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Profile not found".to_string()))?,
        UserRole::Contractor => sqlx::query_scalar!(
            "SELECT display_name FROM contractor_profiles WHERE user_id = $1",
            claims.sub
        )
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Profile not found".to_string()))?,
        UserRole::Admin => {
            return Err(AppError::Unauthorized("Admin cannot use /me".to_string()))
        }
    };

    let email: String =
        sqlx::query_scalar!("SELECT email FROM users WHERE id = $1", claims.sub)
            .fetch_one(&state.db)
            .await?;

    let avatar = sqlx::query!(
        "SELECT updated_at FROM user_avatars WHERE user_id = $1",
        claims.sub
    )
    .fetch_optional(&state.db)
    .await?;

    Ok(Json(MeResponse {
        id: claims.sub,
        email,
        role: claims.role,
        display_name,
        has_avatar: avatar.is_some(),
        avatar_updated_at: avatar.map(|a| a.updated_at),
    }))
}
```

- [ ] **Step 4: Register module + `GET /me` route in `backend/src/lib.rs`**

After `pub mod models;` line add:

```rust
pub mod me;
```

In `create_router`, after the `/auth/me` line add:

```rust
        .route("/me", get(me::handlers::get_me))
```

- [ ] **Step 5: Verify it compiles**

Run: `cd backend && cargo check`
Expected: clean compile.

- [ ] **Step 6: Commit**

```bash
git add backend/Cargo.toml backend/src/me/ backend/src/lib.rs
git commit -m "feat(api): scaffold /me module with GET /me"
```

---

## Task 3 — Test: GET /me returns profile + avatar metadata

**Files:**
- Create: `backend/tests/me_test.rs`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/me_test.rs`:

```rust
mod common;

use sqlx::PgPool;

#[sqlx::test(migrations = "./migrations")]
async fn get_me_returns_profile_for_customer(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "c1@example.com", "customer", "Cathy One").await;

    let (status, body) = common::get_json(&app, "/me", Some(&token)).await;
    assert_eq!(status, 200);
    assert_eq!(body["email"], "c1@example.com");
    assert_eq!(body["role"], "customer");
    assert_eq!(body["display_name"], "Cathy One");
    assert_eq!(body["has_avatar"], false);
    assert!(body["avatar_updated_at"].is_null());
}

#[sqlx::test(migrations = "./migrations")]
async fn get_me_returns_profile_for_contractor(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "c2@example.com", "contractor", "Carl Two").await;

    let (status, body) = common::get_json(&app, "/me", Some(&token)).await;
    assert_eq!(status, 200);
    assert_eq!(body["display_name"], "Carl Two");
}

#[sqlx::test(migrations = "./migrations")]
async fn get_me_requires_auth(pool: PgPool) {
    let app = common::test_app(pool).await;
    let (status, _) = common::get_json(&app, "/me", None).await;
    assert_eq!(status, 401);
}
```

- [ ] **Step 2: Run tests to verify they pass (Task 2 already implemented `get_me`)**

Run: `cd backend && cargo test --test me_test`
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/me_test.rs
git commit -m "test(api): cover GET /me"
```

---

## Task 4 — PATCH /me (display_name, email)

**Files:**
- Modify: `backend/src/me/handlers.rs`
- Modify: `backend/src/lib.rs`
- Modify: `backend/tests/me_test.rs`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/me_test.rs`:

```rust
#[sqlx::test(migrations = "./migrations")]
async fn patch_me_updates_display_name(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "p1@example.com", "customer", "Pat One").await;

    let (status, _) = common::patch_json(
        &app,
        "/me",
        &token,
        serde_json::json!({ "display_name": "Patricia One" }),
    )
    .await;
    assert_eq!(status, 200);

    let (_, body) = common::get_json(&app, "/me", Some(&token)).await;
    assert_eq!(body["display_name"], "Patricia One");
}

#[sqlx::test(migrations = "./migrations")]
async fn patch_me_updates_email(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "old@example.com", "customer", "User").await;

    let (status, _) = common::patch_json(
        &app,
        "/me",
        &token,
        serde_json::json!({ "email": "new@example.com" }),
    )
    .await;
    assert_eq!(status, 200);

    let (_, body) = common::get_json(&app, "/me", Some(&token)).await;
    assert_eq!(body["email"], "new@example.com");
}

#[sqlx::test(migrations = "./migrations")]
async fn patch_me_email_conflict_returns_409(pool: PgPool) {
    let app = common::test_app(pool).await;
    common::register_and_login(&app, "taken@example.com", "customer", "Taken").await;
    let token = common::register_and_login(&app, "u@example.com", "customer", "User").await;

    let (status, _) = common::patch_json(
        &app,
        "/me",
        &token,
        serde_json::json!({ "email": "taken@example.com" }),
    )
    .await;
    assert_eq!(status, 409);
}

#[sqlx::test(migrations = "./migrations")]
async fn patch_me_rejects_empty_display_name(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "e@example.com", "customer", "User").await;

    let (status, _) = common::patch_json(
        &app,
        "/me",
        &token,
        serde_json::json!({ "display_name": "" }),
    )
    .await;
    assert_eq!(status, 400);
}
```

- [ ] **Step 2: Add `patch_json` helper to `backend/tests/common/mod.rs`**

Append after `put_json`:

```rust
pub async fn patch_json(
    app: &axum::Router,
    path: &str,
    bearer_token: &str,
    body: serde_json::Value,
) -> (StatusCode, serde_json::Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(path)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {bearer_token}"))
                .body(Body::from(serde_json::to_string(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, json)
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && cargo test --test me_test patch_me`
Expected: 4 FAIL (route not registered).

- [ ] **Step 4: Implement `patch_me` in `backend/src/me/handlers.rs`**

Append:

```rust
#[derive(Deserialize)]
pub struct PatchMeRequest {
    pub display_name: Option<String>,
    pub email: Option<String>,
}

pub async fn patch_me(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<PatchMeRequest>,
) -> Result<StatusCode, AppError> {
    if let Some(ref name) = req.display_name {
        if name.trim().is_empty() || name.len() > 80 {
            return Err(AppError::BadRequest("Invalid display name".to_string()));
        }
    }

    let mut tx = state.db.begin().await?;

    if let Some(ref email) = req.email {
        let exists = sqlx::query_scalar!(
            "SELECT id FROM users WHERE email = $1 AND id <> $2",
            email,
            claims.sub
        )
        .fetch_optional(&mut *tx)
        .await?;
        if exists.is_some() {
            return Err(AppError::Conflict("Email already registered".to_string()));
        }
        sqlx::query!("UPDATE users SET email = $1 WHERE id = $2", email, claims.sub)
            .execute(&mut *tx)
            .await?;
    }

    if let Some(ref name) = req.display_name {
        match claims.role {
            UserRole::Customer => {
                sqlx::query!(
                    "UPDATE customer_profiles SET display_name = $1 WHERE user_id = $2",
                    name,
                    claims.sub
                )
                .execute(&mut *tx)
                .await?;
            }
            UserRole::Contractor => {
                sqlx::query!(
                    "UPDATE contractor_profiles SET display_name = $1 WHERE user_id = $2",
                    name,
                    claims.sub
                )
                .execute(&mut *tx)
                .await?;
            }
            UserRole::Admin => {
                return Err(AppError::Unauthorized("Admin cannot use /me".to_string()))
            }
        }
    }

    tx.commit().await?;
    Ok(StatusCode::OK)
}
```

- [ ] **Step 5: Register route in `backend/src/lib.rs`**

After the `GET /me` route line, add:

```rust
        .route("/me", get(me::handlers::get_me).patch(me::handlers::patch_me))
```

Replace the existing single `.route("/me", get(...))` from Task 2 with this combined line.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && cargo test --test me_test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/me/handlers.rs backend/src/lib.rs backend/tests/me_test.rs backend/tests/common/mod.rs
git commit -m "feat(api): PATCH /me for display name and email"
```

---

## Task 5 — POST /me/password

**Files:**
- Modify: `backend/src/me/handlers.rs`
- Modify: `backend/src/lib.rs`
- Modify: `backend/tests/me_test.rs`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/me_test.rs`:

```rust
#[sqlx::test(migrations = "./migrations")]
async fn post_password_changes_password(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "pw@example.com", "customer", "User").await;

    let (status, _) = common::post_json_auth(
        &app,
        "/me/password",
        &token,
        serde_json::json!({ "current": "password123", "new": "newpassword456" }),
    )
    .await;
    assert_eq!(status, 200);

    // Re-login with new password
    let (login_status, _) = common::post_json(
        &app,
        "/auth/login",
        serde_json::json!({ "email": "pw@example.com", "password": "newpassword456" }),
    )
    .await;
    assert_eq!(login_status, 200);
}

#[sqlx::test(migrations = "./migrations")]
async fn post_password_wrong_current_returns_401(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "pw2@example.com", "customer", "User").await;

    let (status, _) = common::post_json_auth(
        &app,
        "/me/password",
        &token,
        serde_json::json!({ "current": "wrong", "new": "newpassword456" }),
    )
    .await;
    assert_eq!(status, 401);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && cargo test --test me_test post_password`
Expected: 2 FAIL.

- [ ] **Step 3: Implement `post_password` in `backend/src/me/handlers.rs`**

Append:

```rust
#[derive(Deserialize)]
pub struct PasswordChangeRequest {
    pub current: String,
    pub new: String,
}

pub async fn post_password(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<PasswordChangeRequest>,
) -> Result<StatusCode, AppError> {
    if req.new.len() < 8 {
        return Err(AppError::BadRequest("Password too short".to_string()));
    }

    let row = sqlx::query!(
        "SELECT password_hash FROM users WHERE id = $1",
        claims.sub
    )
    .fetch_one(&state.db)
    .await?;

    if !verify_password(&req.current, &row.password_hash)? {
        return Err(AppError::Unauthorized("Current password incorrect".to_string()));
    }

    let new_hash = hash_password(&req.new)?;
    sqlx::query!(
        "UPDATE users SET password_hash = $1 WHERE id = $2",
        new_hash,
        claims.sub
    )
    .execute(&state.db)
    .await?;

    Ok(StatusCode::OK)
}
```

- [ ] **Step 4: Register route**

In `backend/src/lib.rs`, after the `/me` line, add:

```rust
        .route("/me/password", post(me::handlers::post_password))
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && cargo test --test me_test post_password`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/me/handlers.rs backend/src/lib.rs backend/tests/me_test.rs
git commit -m "feat(api): POST /me/password for password change"
```

---

## Task 6 — Avatar upload, delete, public read

**Files:**
- Modify: `backend/src/me/handlers.rs`
- Modify: `backend/src/lib.rs`
- Modify: `backend/tests/me_test.rs`
- Modify: `backend/tests/common/mod.rs`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/me_test.rs`:

```rust
const PNG_1X1: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
];

#[sqlx::test(migrations = "./migrations")]
async fn avatar_upload_round_trip(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "a@example.com", "customer", "Ava").await;

    let (status, _) = common::post_multipart(
        &app,
        "/me/avatar",
        &token,
        "image/png",
        "tiny.png",
        PNG_1X1,
    )
    .await;
    assert_eq!(status, 200);

    let (me_status, me_body) = common::get_json(&app, "/me", Some(&token)).await;
    assert_eq!(me_status, 200);
    assert_eq!(me_body["has_avatar"], true);

    let user_id = me_body["id"].as_str().unwrap();
    let (avatar_status, _, ct, bytes) =
        common::get_bytes(&app, &format!("/users/{}/avatar", user_id)).await;
    assert_eq!(avatar_status, 200);
    assert_eq!(ct, "image/png");
    assert_eq!(bytes, PNG_1X1);
}

#[sqlx::test(migrations = "./migrations")]
async fn avatar_upload_rejects_oversize(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "big@example.com", "customer", "Big").await;

    let big = vec![0u8; 2 * 1024 * 1024 + 1]; // 2MB + 1 byte
    let (status, _) = common::post_multipart(&app, "/me/avatar", &token, "image/png", "big.png", &big).await;
    assert_eq!(status, 413);
}

#[sqlx::test(migrations = "./migrations")]
async fn avatar_upload_rejects_bad_content_type(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "bad@example.com", "customer", "Bad").await;

    let (status, _) =
        common::post_multipart(&app, "/me/avatar", &token, "application/pdf", "x.pdf", PNG_1X1).await;
    assert_eq!(status, 415);
}

#[sqlx::test(migrations = "./migrations")]
async fn avatar_delete_removes_row(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "d@example.com", "customer", "Del").await;

    common::post_multipart(&app, "/me/avatar", &token, "image/png", "x.png", PNG_1X1).await;
    let (status, _) = common::delete_req(&app, "/me/avatar", &token).await;
    assert_eq!(status, 200);

    let (_, body) = common::get_json(&app, "/me", Some(&token)).await;
    assert_eq!(body["has_avatar"], false);
}

#[sqlx::test(migrations = "./migrations")]
async fn avatar_public_read_404_when_missing(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "n@example.com", "customer", "None").await;
    let (_, body) = common::get_json(&app, "/me", Some(&token)).await;
    let user_id = body["id"].as_str().unwrap();

    let (status, _, _, _) =
        common::get_bytes(&app, &format!("/users/{}/avatar", user_id)).await;
    assert_eq!(status, 404);
}
```

- [ ] **Step 2: Add multipart + bytes helpers to `backend/tests/common/mod.rs`**

Append:

```rust
pub async fn post_multipart(
    app: &axum::Router,
    path: &str,
    bearer_token: &str,
    content_type: &str,
    filename: &str,
    bytes: &[u8],
) -> (StatusCode, serde_json::Value) {
    let boundary = "----testboundary";
    let mut body: Vec<u8> = Vec::new();
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        format!(
            "Content-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(format!("Content-Type: {content_type}\r\n\r\n").as_bytes());
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(path)
                .header("authorization", format!("Bearer {bearer_token}"))
                .header(
                    "content-type",
                    format!("multipart/form-data; boundary={boundary}"),
                )
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, json)
}

pub async fn get_bytes(
    app: &axum::Router,
    path: &str,
) -> (StatusCode, std::collections::HashMap<String, String>, String, Vec<u8>) {
    let response = app
        .clone()
        .oneshot(Request::builder().method("GET").uri(path).body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let mut headers = std::collections::HashMap::new();
    let mut ct = String::new();
    for (k, v) in response.headers().iter() {
        let v = v.to_str().unwrap_or("").to_string();
        if k.as_str() == "content-type" {
            ct = v.clone();
        }
        headers.insert(k.as_str().to_string(), v);
    }
    let bytes = response.into_body().collect().await.unwrap().to_bytes().to_vec();
    (status, headers, ct, bytes)
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && cargo test --test me_test avatar`
Expected: FAIL (no routes).

- [ ] **Step 4: Implement avatar handlers**

Append to `backend/src/me/handlers.rs`:

```rust
use axum::{
    body::Bytes,
    extract::{Multipart, DefaultBodyLimit},
    http::header,
};

const AVATAR_MAX_BYTES: usize = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES: &[&str] = &["image/jpeg", "image/png", "image/webp"];

pub async fn post_avatar(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    mut multipart: Multipart,
) -> Result<StatusCode, AppError> {
    let field = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("multipart error: {e}")))?
        .ok_or_else(|| AppError::BadRequest("missing file field".to_string()))?;

    let content_type = field
        .content_type()
        .map(|s| s.to_string())
        .unwrap_or_default();

    if !ALLOWED_AVATAR_TYPES.contains(&content_type.as_str()) {
        return Err(AppError::UnsupportedMediaType(
            "Only image/jpeg, image/png, image/webp allowed".to_string(),
        ));
    }

    let bytes = field
        .bytes()
        .await
        .map_err(|e| AppError::BadRequest(format!("read error: {e}")))?;

    if bytes.len() > AVATAR_MAX_BYTES {
        return Err(AppError::PayloadTooLarge(
            "Avatar exceeds 2 MB limit".to_string(),
        ));
    }

    sqlx::query!(
        r#"
        INSERT INTO user_avatars (user_id, bytes, content_type, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET bytes = EXCLUDED.bytes,
            content_type = EXCLUDED.content_type,
            updated_at = NOW()
        "#,
        claims.sub,
        bytes.as_ref(),
        content_type,
    )
    .execute(&state.db)
    .await?;

    Ok(StatusCode::OK)
}

pub async fn delete_avatar(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> Result<StatusCode, AppError> {
    sqlx::query!("DELETE FROM user_avatars WHERE user_id = $1", claims.sub)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::OK)
}

pub async fn get_user_avatar(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let row = sqlx::query!(
        "SELECT bytes, content_type FROM user_avatars WHERE user_id = $1",
        user_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Avatar not found".to_string()))?;

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, row.content_type),
            (header::CACHE_CONTROL, "public, max-age=86400".to_string()),
        ],
        Bytes::from(row.bytes),
    ))
}
```

- [ ] **Step 5: Add `UnsupportedMediaType` and `PayloadTooLarge` variants to `backend/src/error.rs`**

Open `backend/src/error.rs` and confirm both variants exist. If they don't, add them following the existing pattern (each variant carries a `String`, maps to its HTTP status). If `error.rs` uses a different variant set, replace `AppError::UnsupportedMediaType(...)` and `AppError::PayloadTooLarge(...)` in Task 6 Step 4 with whatever pattern produces 415 and 413 in this codebase (e.g. a generic `AppError::Status(StatusCode, String)`). The test assertions on `status == 413` / `status == 415` are the contract.

- [ ] **Step 6: Register routes in `backend/src/lib.rs`**

After the `/me/password` line, add:

```rust
        .route(
            "/me/avatar",
            post(me::handlers::post_avatar).delete(me::handlers::delete_avatar),
        )
        .route("/users/:id/avatar", get(me::handlers::get_user_avatar))
        .layer(DefaultBodyLimit::max(3 * 1024 * 1024))
```

Note: the body-limit layer applies to the whole router; if that's too broad, scope it to just the `/me/avatar` route by splitting it into a sub-router. Confirm no other endpoint expects bodies >3 MB before merging.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && cargo test --test me_test avatar`
Expected: 5 PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/me/handlers.rs backend/src/lib.rs backend/src/error.rs backend/tests/me_test.rs backend/tests/common/mod.rs
git commit -m "feat(api): avatar upload, delete, and public read"
```

---

## Task 7 — DELETE /me (with active-job check)

**Files:**
- Modify: `backend/src/me/handlers.rs`
- Modify: `backend/src/lib.rs`
- Modify: `backend/tests/me_test.rs`

**Active-job definition:** any row in `jobs` where `customer_id = me` or `contractor_id = me` with `status NOT IN ('completed', 'cancelled')`. (Confirm exact terminal-status enum values against `backend/migrations/0002_create_enums.sql` before implementing; adjust the SQL `WHERE` clause if naming differs.)

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/me_test.rs`:

```rust
#[sqlx::test(migrations = "./migrations")]
async fn delete_me_clean_account(pool: PgPool) {
    let app = common::test_app(pool.clone()).await;
    let token = common::register_and_login(&app, "del@example.com", "customer", "Del").await;

    let (status, _) = common::delete_req(&app, "/me", &token).await;
    assert_eq!(status, 200);

    // user row gone
    let remaining = sqlx::query_scalar!(
        "SELECT id FROM users WHERE email = 'del@example.com'"
    )
    .fetch_optional(&pool)
    .await
    .unwrap();
    assert!(remaining.is_none());
}

#[sqlx::test(migrations = "./migrations")]
async fn delete_me_cascades_avatar(pool: PgPool) {
    let app = common::test_app(pool.clone()).await;
    let token = common::register_and_login(&app, "da@example.com", "customer", "DA").await;
    common::post_multipart(&app, "/me/avatar", &token, "image/png", "x.png", PNG_1X1).await;

    let (status, _) = common::delete_req(&app, "/me", &token).await;
    assert_eq!(status, 200);

    let count: i64 = sqlx::query_scalar!("SELECT COUNT(*) FROM user_avatars")
        .fetch_one(&pool)
        .await
        .unwrap()
        .unwrap_or(0);
    assert_eq!(count, 0);
}

#[sqlx::test(migrations = "./migrations")]
async fn delete_me_rejected_with_active_job(pool: PgPool) {
    let app = common::test_app(pool.clone()).await;
    let cust_token = common::register_and_login(&app, "cu@example.com", "customer", "Cu").await;
    let con_token = common::register_and_login(&app, "co@example.com", "contractor", "Co").await;

    // contractor needs to be available so the customer can create a job for them
    common::post_json_auth(
        &app,
        "/contractor/availability",
        &con_token,
        serde_json::json!({ "is_available": true }),
    )
    .await;

    // discover contractor id via /me
    let (_, con_body) = common::get_json(&app, "/me", Some(&con_token)).await;
    let contractor_id = con_body["id"].as_str().unwrap().to_string();

    let (job_status, _) = common::post_json_auth(
        &app,
        "/jobs",
        &cust_token,
        serde_json::json!({
            "contractor_id": contractor_id,
            "description": "fix sink",
            "location_lat": 40.7,
            "location_lng": -74.0
        }),
    )
    .await;
    assert_eq!(job_status, 200);

    let (status, _) = common::delete_req(&app, "/me", &cust_token).await;
    assert_eq!(status, 409);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && cargo test --test me_test delete_me`
Expected: FAIL.

- [ ] **Step 3: Implement `delete_me`**

Append to `backend/src/me/handlers.rs`:

```rust
pub async fn delete_me(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> Result<StatusCode, AppError> {
    // Check for active jobs (any non-terminal status involving the user)
    let active = sqlx::query_scalar!(
        r#"
        SELECT COUNT(*) FROM jobs
        WHERE (customer_id = $1 OR contractor_id = $1)
          AND status NOT IN ('completed', 'cancelled')
        "#,
        claims.sub
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(0);

    if active > 0 {
        return Err(AppError::Conflict(
            "Cancel active jobs before deleting your account".to_string(),
        ));
    }

    sqlx::query!("DELETE FROM users WHERE id = $1", claims.sub)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::OK)
}
```

- [ ] **Step 4: Register route in `backend/src/lib.rs`**

Change the `/me` route from Task 4 to:

```rust
        .route(
            "/me",
            get(me::handlers::get_me)
                .patch(me::handlers::patch_me)
                .delete(me::handlers::delete_me),
        )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && cargo test --test me_test`
Expected: all me_test tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/me/handlers.rs backend/src/lib.rs backend/tests/me_test.rs
git commit -m "feat(api): DELETE /me with active-job check and cascade cleanup"
```

---

## Task 8 — Frontend `me` library + root-layout session plumbing

**Files:**
- Create: `web/lib/me.ts`
- Modify: `web/components/providers/providers.tsx`
- Modify: `web/app/layout.tsx`
- Modify: `web/app/page.tsx`
- Modify: `web/components/ui/navbar.tsx`

- [ ] **Step 1: Create `web/lib/me.ts`**

```typescript
import { getSession, isTokenExpired } from "./session";

export interface MeUser {
  id: string;
  email: string;
  role: "customer" | "contractor" | "admin";
  display_name: string;
  has_avatar: boolean;
  avatar_updated_at: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export async function fetchMe(): Promise<MeUser | null> {
  const session = await getSession();
  if (!session.access_token || isTokenExpired(session.access_token)) return null;
  const res = await fetch(`${API_URL}/me`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as MeUser;
}

export function avatarUrl(user: MeUser): string | null {
  if (!user.has_avatar) return null;
  const v = encodeURIComponent(user.avatar_updated_at ?? "");
  return `${API_URL}/users/${user.id}/avatar?v=${v}`;
}
```

- [ ] **Step 2: Add `MeUserContext` to `web/components/providers/providers.tsx`**

Open the file and add (alongside the existing providers):

```tsx
"use client";
import { createContext, useContext } from "react";
import type { MeUser } from "@/lib/me";

const MeUserContext = createContext<MeUser | null>(null);

export function MeUserProvider({
  value,
  children,
}: {
  value: MeUser | null;
  children: React.ReactNode;
}) {
  return <MeUserContext.Provider value={value}>{children}</MeUserContext.Provider>;
}

export function useMeUser(): MeUser | null {
  return useContext(MeUserContext);
}
```

If the file's existing `Providers` component takes children, accept an optional `meUser` prop and wrap the tree:

```tsx
export function Providers({
  children,
  meUser,
}: {
  children: React.ReactNode;
  meUser?: MeUser | null;
}) {
  return (
    <MeUserProvider value={meUser ?? null}>
      {/* existing providers unchanged */}
      {children}
    </MeUserProvider>
  );
}
```

- [ ] **Step 3: Wire root layout to fetch `meUser`**

Modify `web/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers/providers";
import { ReconnectingBanner } from "@/components/ui/reconnecting-banner";
import { fetchMe } from "@/lib/me";

export const metadata: Metadata = { title: "Knect" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const meUser = await fetchMe();
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-warm-bg text-gray-900 antialiased">
        <Providers meUser={meUser}>
          <ReconnectingBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Simplify `web/app/page.tsx` to use the new `meUser`**

Replace the existing body of `HomePage`:

```tsx
import { getSession, isTokenExpired } from "@/lib/session";
import { serverApi } from "@/lib/api-server";
import { Navbar } from "@/components/ui/navbar";
import { PublicDirectory } from "@/components/directory/public-directory";
import { SignedInDirectory } from "@/components/directory/signed-in-directory";

const DEFAULT_LAT = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? "40.7128");
const DEFAULT_LNG = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? "-74.006");

export default async function HomePage() {
  const session = await getSession();
  const isLoggedIn =
    !!session.access_token && !isTokenExpired(session.access_token);

  // Only fetch contractors when logged in; logged-out users see the locked preview.
  const contractors = isLoggedIn
    ? await serverApi.nearbyContractors(DEFAULT_LAT, DEFAULT_LNG)
    : [];

  return (
    <>
      <Navbar />
      <div className="pt-[60px] h-full flex flex-col">
        {isLoggedIn ? (
          <SignedInDirectory initialContractors={contractors} />
        ) : (
          <PublicDirectory contractors={[]} />
        )}
      </div>
    </>
  );
}
```

Note the API change: `Navbar` no longer takes `isLoggedIn` — it reads from context.

- [ ] **Step 5: Update `web/components/ui/navbar.tsx`**

```tsx
"use client";
import Link from "next/link";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Avatar } from "@/components/ui/avatar";
import { useMeUser } from "@/components/providers/providers";
import { avatarUrl } from "@/lib/me";

export function Navbar() {
  const me = useMeUser();
  const isLoggedIn = me !== null;

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-[60px] bg-white border-b border-warm-border flex items-center px-10 gap-6">
      <Link href="/" className="font-bold text-blue-600 text-xl tracking-tight">
        Knect
      </Link>

      {isLoggedIn && me ? (
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
          <UserMenu me={me} />
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
          <Link href="/login" className="px-4 py-[7px] rounded-lg border border-warm-border text-slate-900 text-sm font-medium hover:bg-slate-50 transition-colors">
            Sign in
          </Link>
          <Link href="/register" className="px-4 py-[7px] rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            Get started
          </Link>
        </>
      )}
    </header>
  );
}

function UserMenu({ me }: { me: import("@/lib/me").MeUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const url = avatarUrl(me);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-transparent border-none cursor-pointer p-1"
      >
        {url ? (
          <img src={url} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <Avatar name={me.display_name} size={32} palette="green" />
        )}
        <span className="text-sm font-medium text-slate-900">
          {me.display_name.split(" ")[0]}
        </span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-white border border-warm-border rounded-lg shadow-lg py-1.5 z-50">
          <Link
            href="/settings"
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-900 hover:bg-slate-50"
          >
            <Settings size={14} /> Settings
          </Link>
          <a
            href="/api/logout"
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-900 hover:bg-slate-50"
          >
            <LogOut size={14} /> Sign out
          </a>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Check other callers of `<Navbar>`**

```bash
grep -rn "<Navbar" web/app web/components
```

For each call site that passes `isLoggedIn` or `user` props, remove those props — the new Navbar reads from context.

- [ ] **Step 7: Type check**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add web/lib/me.ts web/components/providers/providers.tsx web/app/layout.tsx web/app/page.tsx web/components/ui/navbar.tsx
git commit -m "feat(web): plumb meUser through layout and add navbar user menu"
```

---

## Task 9 — Navbar test for `meUser` context

**Files:**
- Create: `web/__tests__/navbar-meuser.test.tsx`

- [ ] **Step 1: Write tests**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { Navbar } from "@/components/ui/navbar";
import { MeUserProvider } from "@/components/providers/providers";
import type { MeUser } from "@/lib/me";

jest.mock("next/link", () => {
  const MockLink = ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  );
  MockLink.displayName = "Link";
  return MockLink;
});

const me: MeUser = {
  id: "u1",
  email: "u1@example.com",
  role: "customer",
  display_name: "Jess Lim",
  has_avatar: false,
  avatar_updated_at: null,
};

test("logged-in: renders first name and chevron", () => {
  render(
    <MeUserProvider value={me}>
      <Navbar />
    </MeUserProvider>
  );
  expect(screen.getByText("Jess")).toBeInTheDocument();
});

test("logged-in: clicking the avatar button opens Settings + Sign out", () => {
  render(
    <MeUserProvider value={me}>
      <Navbar />
    </MeUserProvider>
  );
  fireEvent.click(screen.getByText("Jess"));
  expect(screen.getByText("Settings")).toBeInTheDocument();
  expect(screen.getByText("Sign out")).toBeInTheDocument();
});

test("logged-out: shows Sign in and Get started", () => {
  render(
    <MeUserProvider value={null}>
      <Navbar />
    </MeUserProvider>
  );
  expect(screen.getByText("Sign in")).toBeInTheDocument();
  expect(screen.getByText("Get started")).toBeInTheDocument();
});
```

- [ ] **Step 2: Update or delete the old `web/__tests__/navbar.test.tsx`**

The old test passes `isLoggedIn` as a prop, which is gone. Delete the old file:

```bash
git rm web/__tests__/navbar.test.tsx
```

- [ ] **Step 3: Run tests**

Run: `cd web && npm test -- navbar-meuser`
Expected: 3 PASS.

- [ ] **Step 4: Commit**

```bash
git add web/__tests__/navbar-meuser.test.tsx
git commit -m "test(web): cover Navbar with meUser context"
```

---

## Task 10 — Settings page scaffolding + GET /me read

**Files:**
- Create: `web/app/(protected)/settings/page.tsx`
- Create: `web/app/(protected)/settings/actions.ts`

- [ ] **Step 1: Create `actions.ts` shell**

```typescript
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

async function authHeader(): Promise<string> {
  const session = await getSession();
  if (!session.access_token) throw new Error("Not authenticated");
  return `Bearer ${session.access_token}`;
}

export async function updateProfileAction(formData: FormData): Promise<void> {
  const display_name = (formData.get("display_name") as string | null)?.trim();
  if (!display_name) {
    redirect("/settings?error=Display+name+required");
  }
  const res = await fetch(`${API_URL}/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: await authHeader() },
    body: JSON.stringify({ display_name }),
  });
  if (!res.ok) redirect(`/settings?error=Could+not+save+profile`);
  revalidatePath("/settings");
  redirect("/settings?ok=Profile+saved");
}

export async function updateEmailAction(formData: FormData): Promise<void> {
  const email = (formData.get("email") as string | null)?.trim();
  if (!email) redirect("/settings?error=Email+required");
  const res = await fetch(`${API_URL}/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: await authHeader() },
    body: JSON.stringify({ email }),
  });
  if (res.status === 409) redirect("/settings?error=Email+already+taken");
  if (!res.ok) redirect("/settings?error=Could+not+save+email");
  revalidatePath("/settings");
  redirect("/settings?ok=Email+updated");
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  const current = formData.get("current") as string;
  const next = formData.get("new") as string;
  const confirm = formData.get("confirm") as string;
  if (!current || !next) redirect("/settings?error=Fill+all+password+fields");
  if (next.length < 8) redirect("/settings?error=Password+must+be+8%2B+characters");
  if (next !== confirm) redirect("/settings?error=Passwords+do+not+match");

  const res = await fetch(`${API_URL}/me/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: await authHeader() },
    body: JSON.stringify({ current, new: next }),
  });
  if (res.status === 401) redirect("/settings?error=Current+password+incorrect");
  if (!res.ok) redirect("/settings?error=Could+not+change+password");
  redirect("/settings?ok=Password+changed");
}

export async function uploadAvatarAction(formData: FormData): Promise<void> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/settings?error=Pick+an+image");
  }
  if (file.size > 2 * 1024 * 1024) {
    redirect("/settings?error=Image+exceeds+2MB");
  }
  const fwd = new FormData();
  fwd.append("file", file, file.name);

  const res = await fetch(`${API_URL}/me/avatar`, {
    method: "POST",
    headers: { Authorization: await authHeader() },
    body: fwd,
  });
  if (res.status === 413) redirect("/settings?error=Image+exceeds+2MB");
  if (res.status === 415) redirect("/settings?error=Only+JPEG%2C+PNG%2C+or+WebP");
  if (!res.ok) redirect("/settings?error=Upload+failed");
  revalidatePath("/settings");
  redirect("/settings?ok=Avatar+updated");
}

export async function removeAvatarAction(): Promise<void> {
  await fetch(`${API_URL}/me/avatar`, {
    method: "DELETE",
    headers: { Authorization: await authHeader() },
  });
  revalidatePath("/settings");
  redirect("/settings?ok=Avatar+removed");
}

export async function signOutAction(): Promise<void> {
  const session = await getSession();
  await session.destroy();
  redirect("/");
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  const confirmEmail = (formData.get("confirm_email") as string | null)?.trim();
  // We don't know the email here without another fetch; the page passes it via hidden field.
  const expected = formData.get("expected_email") as string | null;
  if (!confirmEmail || confirmEmail !== expected) {
    redirect("/settings?error=Confirmation+email+does+not+match");
  }

  const res = await fetch(`${API_URL}/me`, {
    method: "DELETE",
    headers: { Authorization: await authHeader() },
  });
  if (res.status === 409) redirect("/settings?error=Cancel+active+jobs+first");
  if (!res.ok) redirect("/settings?error=Delete+failed");

  const session = await getSession();
  await session.destroy();
  redirect("/?deleted=1");
}
```

- [ ] **Step 2: Create `page.tsx` shell that fetches /me and renders the three sections (added in Tasks 11–13)**

```tsx
import { fetchMe } from "@/lib/me";
import { redirect } from "next/navigation";
import { ProfileSection } from "./profile-section";
import { AccountSection } from "./account-section";
import { DangerSection } from "./danger-section";

interface PageProps {
  searchParams: { error?: string; ok?: string };
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const me = await fetchMe();
  if (!me) redirect("/login");

  return (
    <main className="max-w-[640px] mx-auto px-6 pt-24 pb-16 flex flex-col gap-8">
      <header>
        <h1 className="text-[26px] font-bold text-slate-900 tracking-[-0.01em] m-0">
          Settings
        </h1>
      </header>

      {searchParams.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {searchParams.error}
        </div>
      )}
      {searchParams.ok && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
          {searchParams.ok}
        </div>
      )}

      <ProfileSection me={me} />
      <AccountSection me={me} />
      <DangerSection me={me} />
    </main>
  );
}
```

- [ ] **Step 3: Verify route compiles by visiting it**

Run: `cd web && npm run dev` and open http://localhost:3000/settings while logged in.
Expected: page errors because `ProfileSection` etc. don't exist yet — that's fine, we add them in Tasks 11–13. Skip the run for now if the dev server isn't trivially available.

- [ ] **Step 4: Commit**

```bash
git add 'web/app/(protected)/settings/page.tsx' 'web/app/(protected)/settings/actions.ts'
git commit -m "feat(web): settings page shell + server actions"
```

---

## Task 11 — Profile section (display name + avatar)

**Files:**
- Create: `web/app/(protected)/settings/profile-section.tsx`

- [ ] **Step 1: Write the section**

```tsx
import { updateProfileAction, uploadAvatarAction, removeAvatarAction } from "./actions";
import { avatarUrl, type MeUser } from "@/lib/me";
import { Avatar } from "@/components/ui/avatar";

export function ProfileSection({ me }: { me: MeUser }) {
  const url = avatarUrl(me);

  return (
    <section className="bg-white border border-warm-border rounded-card p-5 flex flex-col gap-5">
      <h2 className="text-base font-semibold text-slate-900 m-0">Profile</h2>

      <div className="flex items-center gap-4">
        {url ? (
          <img src={url} alt="" className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <Avatar name={me.display_name} size={64} palette="green" />
        )}

        <div className="flex gap-2">
          <form action={uploadAvatarAction}>
            <label className="px-3 py-1.5 rounded-md border border-warm-border bg-white text-sm font-medium text-slate-900 cursor-pointer hover:bg-slate-50">
              Upload
              <input
                type="file"
                name="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              />
            </label>
          </form>
          {me.has_avatar && (
            <form action={removeAvatarAction}>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-md border border-warm-border bg-white text-sm font-medium text-slate-900 hover:bg-slate-50"
              >
                Remove
              </button>
            </form>
          )}
        </div>
      </div>

      <form action={updateProfileAction} className="flex flex-col gap-2.5">
        <label className="text-[13px] font-medium text-slate-900">Display name</label>
        <input
          name="display_name"
          defaultValue={me.display_name}
          required
          maxLength={80}
          className="px-3 py-[10px] border border-warm-border rounded-[10px] bg-white text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="submit"
          className="self-start mt-1 px-4 py-[8px] rounded-[10px] bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          Save profile
        </button>
      </form>
    </section>
  );
}
```

- [ ] **Step 2: Type check**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add 'web/app/(protected)/settings/profile-section.tsx'
git commit -m "feat(web): settings profile section (name + avatar)"
```

---

## Task 12 — Account section (email + password)

**Files:**
- Create: `web/app/(protected)/settings/account-section.tsx`

- [ ] **Step 1: Write the section**

```tsx
import { updateEmailAction, changePasswordAction } from "./actions";
import type { MeUser } from "@/lib/me";

export function AccountSection({ me }: { me: MeUser }) {
  return (
    <section className="bg-white border border-warm-border rounded-card p-5 flex flex-col gap-6">
      <h2 className="text-base font-semibold text-slate-900 m-0">Account</h2>

      <form action={updateEmailAction} className="flex flex-col gap-2.5">
        <label className="text-[13px] font-medium text-slate-900">Email</label>
        <input
          name="email"
          type="email"
          defaultValue={me.email}
          required
          className="px-3 py-[10px] border border-warm-border rounded-[10px] bg-white text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="submit"
          className="self-start mt-1 px-4 py-[8px] rounded-[10px] bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          Update email
        </button>
      </form>

      <div className="h-px bg-warm-border" />

      <form action={changePasswordAction} className="flex flex-col gap-2.5">
        <h3 className="text-sm font-semibold text-slate-900 m-0">Change password</h3>
        <PwField label="Current password" name="current" />
        <PwField label="New password" name="new" />
        <PwField label="Confirm new password" name="confirm" />
        <button
          type="submit"
          className="self-start mt-1 px-4 py-[8px] rounded-[10px] bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          Change password
        </button>
      </form>
    </section>
  );
}

function PwField({ label, name }: { label: string; name: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-slate-900">{label}</span>
      <input
        type="password"
        name={name}
        required
        className="px-3 py-[10px] border border-warm-border rounded-[10px] bg-white text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </label>
  );
}
```

- [ ] **Step 2: Type check**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add 'web/app/(protected)/settings/account-section.tsx'
git commit -m "feat(web): settings account section (email + password)"
```

---

## Task 13 — Danger section (sign out + delete dialog)

**Files:**
- Create: `web/app/(protected)/settings/delete-dialog.tsx`
- Create: `web/app/(protected)/settings/danger-section.tsx`

- [ ] **Step 1: Write the type-to-confirm dialog**

`delete-dialog.tsx`:

```tsx
"use client";
import { useState } from "react";
import { deleteAccountAction } from "./actions";

export function DeleteDialog({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed === email;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start px-4 py-[8px] rounded-[10px] border border-red-200 bg-white text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Delete account
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
      <div className="bg-white rounded-card w-full max-w-[420px] p-5 flex flex-col gap-4">
        <h3 className="text-base font-semibold text-slate-900 m-0">
          Delete your account?
        </h3>
        <p className="text-sm text-slate-600 leading-relaxed m-0">
          This is permanent. All your jobs, ratings, and profile will be removed.
          Type <span className="font-semibold text-slate-900">{email}</span> to confirm.
        </p>
        <form action={deleteAccountAction} className="flex flex-col gap-3">
          <input type="hidden" name="expected_email" value={email} />
          <input
            name="confirm_email"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={email}
            className="px-3 py-[10px] border border-warm-border rounded-[10px] bg-white text-sm text-slate-900 outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setOpen(false); setTyped(""); }}
              className="px-4 py-[8px] rounded-[10px] border border-warm-border bg-white text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!matches}
              className="px-4 py-[8px] rounded-[10px] bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Delete account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the danger section**

`danger-section.tsx`:

```tsx
import { signOutAction } from "./actions";
import { DeleteDialog } from "./delete-dialog";
import type { MeUser } from "@/lib/me";

export function DangerSection({ me }: { me: MeUser }) {
  return (
    <section className="bg-white border border-warm-border rounded-card p-5 flex flex-col gap-4">
      <h2 className="text-base font-semibold text-slate-900 m-0">Danger zone</h2>

      <form action={signOutAction}>
        <button
          type="submit"
          className="px-4 py-[8px] rounded-[10px] border border-warm-border bg-white text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Sign out
        </button>
      </form>

      <div className="h-px bg-warm-border" />

      <p className="text-sm text-slate-600 leading-relaxed m-0">
        Permanently delete your account and all associated data.
      </p>
      <DeleteDialog email={me.email} />
    </section>
  );
}
```

- [ ] **Step 3: Type check + smoke test**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add 'web/app/(protected)/settings/delete-dialog.tsx' 'web/app/(protected)/settings/danger-section.tsx'
git commit -m "feat(web): settings danger zone with type-to-confirm delete"
```

---

## Task 14 — Server-action tests

**Files:**
- Create: `web/__tests__/settings-actions.test.ts`

These tests mock `fetch` and `getSession` and assert that each action calls the right endpoint with the right body, and redirects to the right URL on each error code.

- [ ] **Step 1: Write tests**

```typescript
/**
 * @jest-environment node
 */
import {
  updateProfileAction,
  updateEmailAction,
  changePasswordAction,
  deleteAccountAction,
} from "@/app/(protected)/settings/actions";

// next/navigation.redirect throws a special signal; capture it for assertions
jest.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error(`REDIRECT:${url}`);
    (err as any).digest = "NEXT_REDIRECT";
    throw err;
  },
}));

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

jest.mock("@/lib/session", () => ({
  getSession: jest.fn(async () => ({
    access_token: "tok",
    destroy: jest.fn(),
  })),
}));

const origFetch = global.fetch;
afterEach(() => { global.fetch = origFetch; });

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.append(k, v);
  return f;
}

async function expectRedirect(fn: () => Promise<unknown>, expected: string) {
  try {
    await fn();
    throw new Error("expected redirect");
  } catch (e: any) {
    expect(e.message).toBe(`REDIRECT:${expected}`);
  }
}

test("updateProfileAction patches and redirects ok", async () => {
  global.fetch = jest.fn(async () => new Response(null, { status: 200 })) as any;
  await expectRedirect(
    () => updateProfileAction(fd({ display_name: "Jess Lim" })),
    "/settings?ok=Profile+saved"
  );
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/me"),
    expect.objectContaining({ method: "PATCH" })
  );
});

test("updateEmailAction surfaces 409 as 'Email already taken'", async () => {
  global.fetch = jest.fn(async () => new Response(null, { status: 409 })) as any;
  await expectRedirect(
    () => updateEmailAction(fd({ email: "x@y.com" })),
    "/settings?error=Email+already+taken"
  );
});

test("changePasswordAction surfaces 401 as 'Current password incorrect'", async () => {
  global.fetch = jest.fn(async () => new Response(null, { status: 401 })) as any;
  await expectRedirect(
    () => changePasswordAction(fd({ current: "x", new: "longenough", confirm: "longenough" })),
    "/settings?error=Current+password+incorrect"
  );
});

test("changePasswordAction blocks mismatched confirm before calling backend", async () => {
  global.fetch = jest.fn() as any;
  await expectRedirect(
    () => changePasswordAction(fd({ current: "x", new: "longenough", confirm: "different1" })),
    "/settings?error=Passwords+do+not+match"
  );
  expect(global.fetch).not.toHaveBeenCalled();
});

test("deleteAccountAction blocks when confirmation does not match", async () => {
  global.fetch = jest.fn() as any;
  await expectRedirect(
    () => deleteAccountAction(fd({ confirm_email: "wrong@x.com", expected_email: "right@x.com" })),
    "/settings?error=Confirmation+email+does+not+match"
  );
  expect(global.fetch).not.toHaveBeenCalled();
});

test("deleteAccountAction surfaces 409 as 'Cancel active jobs first'", async () => {
  global.fetch = jest.fn(async () => new Response(null, { status: 409 })) as any;
  await expectRedirect(
    () => deleteAccountAction(fd({ confirm_email: "u@x.com", expected_email: "u@x.com" })),
    "/settings?error=Cancel+active+jobs+first"
  );
});
```

- [ ] **Step 2: Run tests**

Run: `cd web && npm test -- settings-actions`
Expected: 6 PASS.

- [ ] **Step 3: Commit**

```bash
git add web/__tests__/settings-actions.test.ts
git commit -m "test(web): cover settings server actions"
```

---

## Task 15 — Locked map preview component

**Files:**
- Create: `web/components/map/locked-map-preview.tsx`
- Modify: `web/components/directory/public-directory.tsx`
- Create: `web/__tests__/locked-map-preview.test.tsx`

- [ ] **Step 1: Write a failing test for the preview**

`web/__tests__/locked-map-preview.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { LockedMapPreview } from "@/components/map/locked-map-preview";

const ORIG_ENV = { ...process.env };
beforeAll(() => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.test";
  process.env.NEXT_PUBLIC_DEFAULT_LAT = "40.7";
  process.env.NEXT_PUBLIC_DEFAULT_LNG = "-74.0";
});
afterAll(() => {
  process.env = ORIG_ENV;
});

test("renders an img pointing at the Mapbox Static API with token and coords", () => {
  render(<LockedMapPreview />);
  const img = screen.getByRole("img") as HTMLImageElement;
  expect(img.src).toContain("api.mapbox.com/styles/v1/mapbox/streets-v12/static/");
  expect(img.src).toContain("-74,40.7,13"); // lng,lat,zoom (truncated)
  expect(img.src).toContain("access_token=pk.test");
  expect(img.loading).toBe("lazy");
});

test("renders the 'Sign in to view live map' overlay", () => {
  render(<LockedMapPreview />);
  expect(screen.getByText(/Sign in to view live map/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- locked-map-preview`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `LockedMapPreview`**

`web/components/map/locked-map-preview.tsx`:

```tsx
const DEFAULT_LAT = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? "40.7128");
const DEFAULT_LNG = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? "-74.006");
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export function LockedMapPreview() {
  const src =
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/` +
    `${DEFAULT_LNG},${DEFAULT_LAT},13,0/640x320@2x` +
    `?access_token=${TOKEN}`;

  return (
    <div className="relative h-[160px] rounded-[10px] overflow-hidden mb-3.5">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
      />
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ background: "rgba(248,250,252,0.45)", backdropFilter: "blur(4px)" }}
      >
        <div
          className="bg-white rounded-full px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900"
          style={{ boxShadow: "0 6px 18px -4px rgba(15,23,42,0.18)" }}
        >
          🔒 Sign in to view live map
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- locked-map-preview`
Expected: 2 PASS.

- [ ] **Step 5: Wire into `public-directory.tsx`**

Open `web/components/directory/public-directory.tsx` and replace the `LockedMapPromo` component's preview SVG block with the new component. Find:

```tsx
function LockedMapPromo() {
  return (
    <div className="bg-white border border-warm-border rounded-card p-4">
      {/* Static map preview */}
      <div className="relative h-[160px] rounded-[10px] overflow-hidden mb-3.5">
        <svg ...>...</svg>
        {/* Pin dots */}
        ...
        {/* Frosted overlay */}
        <div ...>...</div>
      </div>
      ...
```

Replace the entire `<div className="relative h-[160px] ...">...</div>` block (the SVG + pin dots + frosted overlay) with a single line:

```tsx
<LockedMapPreview />
```

Add the import at the top of the file:

```tsx
import { LockedMapPreview } from "@/components/map/locked-map-preview";
```

Keep the surrounding `<h3>`, `<p>`, and "Create free account" link in `LockedMapPromo` unchanged.

- [ ] **Step 6: Confirm Mapbox SDK is not imported anywhere public**

Run:
```bash
grep -rn "from \"mapbox-gl\"" web/components web/app
```
Expected: only matches in `web/components/map/map-view.tsx`. If anything else imports it, fix before merging.

- [ ] **Step 7: Type check**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add web/components/map/locked-map-preview.tsx 'web/components/directory/public-directory.tsx' web/__tests__/locked-map-preview.test.tsx
git commit -m "feat(web): replace SVG locked map with Mapbox Static preview"
```

---

## Task 16 — Playwright e2e: full settings flow

**Files:**
- Create: `web/e2e/settings.spec.ts`

- [ ] **Step 1: Write the e2e**

```typescript
import { test, expect } from "@playwright/test";

test("user can update display name, upload avatar, sign out, see locked map", async ({
  page,
}, testInfo) => {
  const ts = Date.now();
  const email = `e2e_${ts}@example.com`;
  const password = "password123";

  // Register
  await page.goto("/register");
  await page.fill('input[name="display_name"]', "E2E Tester");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/");

  // Open settings via avatar menu
  await page.getByRole("button", { name: /E2E/i }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForURL("**/settings");

  // Update display name
  await page.fill('input[name="display_name"]', "E2E Updated");
  await page.click('button:has-text("Save profile")');
  await expect(page.getByText("Profile saved")).toBeVisible();

  // Upload avatar (1x1 png shipped as a fixture)
  const filePath = testInfo.outputPath("tiny.png");
  const fs = await import("node:fs/promises");
  // Buffer literal omitted for brevity; reuse a small PNG fixture in repo.
  const png = Buffer.from(
    "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C620001000005000101D52DB40000000049454E44AE426082",
    "hex"
  );
  await fs.writeFile(filePath, png);
  await page.setInputFiles('input[type="file"]', filePath);
  await expect(page.getByText("Avatar updated")).toBeVisible();

  // Sign out via danger zone
  await page.click('button:has-text("Sign out")');
  await page.waitForURL("**/");

  // Logged-out home shows the locked map preview
  await expect(page.getByText(/Sign in to view live map/i)).toBeVisible();
});
```

- [ ] **Step 2: Run e2e**

Run: `cd web && npx playwright install --with-deps && npm run test:e2e -- settings`
Expected: PASS (requires backend running locally; if not available, document and skip in CI).

- [ ] **Step 3: Commit**

```bash
git add web/e2e/settings.spec.ts
git commit -m "test(web): e2e for settings flow + locked map after sign out"
```

---

## Task 17 — Verification & cleanup

**Files:**
- N/A (verification only)

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && cargo test`
Expected: all tests pass, including pre-existing.

- [ ] **Step 2: Run all frontend Jest tests**

Run: `cd web && npm test`
Expected: all tests pass, including pre-existing.

- [ ] **Step 3: Type check**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual smoke test**

Run backend (`cargo run -p knect-api`) and frontend (`cd web && npm run dev`). Walk through:

1. Logged-out home → confirm the Mapbox Static image renders behind the blur.
2. Register → land on home with a live map.
3. Open avatar menu → Settings → change name, upload avatar, change password, change email.
4. Try uploading a 3 MB file → see "Image exceeds 2MB" inline.
5. Try changing password with wrong current → see "Current password incorrect".
6. Open Danger zone → type wrong email → Delete button stays disabled.
7. Type correct email → confirm deletion → land on `/?deleted=1` with empty session.
8. Re-register the same email → succeeds (the user row was fully cleaned).

- [ ] **Step 5: Final commit (if anything cleaned up)**

```bash
git status
# if anything is left
git add -A
git commit -m "chore: cleanup after profile settings + locked map work"
```

---

## Self-review notes (already applied)

- Spec coverage: every requirement in the spec (§1–§7) maps to at least one task. Backend §1.1 → Task 1; §1.2 cascade audit → Task 1 (FK fixes); §1.3 endpoints → Tasks 3, 4, 5, 6, 7; §1.5 tests → spread across Tasks 3–7; §2 frontend → Tasks 10–14; §3 navigation → Tasks 8, 9; §4 locked map → Task 15; §5 edge cases → covered in Tasks 4–7 and 14; §6 test summary → covered in 3–7, 14, 16; §7 rollout → matches task order.
- Type consistency: `MeUser` (`web/lib/me.ts`) and `MeResponse` (`backend/src/me/handlers.rs`) use snake_case field names matching the JSON wire format. Server actions reference exactly those fields.
- Placeholders: none. Each step shows complete code or exact commands.
- Known caveat documented: deleting a customer cascades their `ratings`, which leaves contractor `avg_rating`/`rating_count` snapshots stale. Out of scope for this spec; recompute can be added in a follow-up.
