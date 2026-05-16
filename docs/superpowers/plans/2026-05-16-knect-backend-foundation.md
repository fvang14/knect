# Knect Backend Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Rust/Axum API server with PostgreSQL+PostGIS, all database migrations, and working auth endpoints (register, login, refresh) with full integration test coverage.

**Architecture:** Single Axum server on Tokio. sqlx provides async database access with compile-time query checking. argon2 hashes passwords. jsonwebtoken issues short-lived access tokens (1h) and long-lived refresh tokens (30d). All shared state (DB pool + config) is passed via Axum's `State<AppState>` extractor. Integration tests use `#[sqlx::test]` which spins up an isolated database per test and tears it down automatically — no manual truncation needed.

**Tech Stack:** Rust (edition 2021), Axum 0.7, Tokio 1 (full), sqlx 0.7 (postgres + uuid + chrono + macros features), argon2 0.5, jsonwebtoken 9, serde 1, thiserror 1, dotenvy 0.15, tower 0.4, tower-http 0.5 (cors + trace), http-body-util 0.1, Docker Compose (postgis/postgis:16-3.4, redis:7-alpine)

**Note on scope:** This is Plan 1 of 4. Plan 2 covers the Core API (jobs, profiles, location, ratings). Plan 3 covers the Contractor Mobile App. Plan 4 covers the Customer Web App and Admin Console.

---

## File Map

```
backend/
├── Cargo.toml
├── .env.example
├── docker-compose.yml
├── migrations/
│   ├── 0001_create_extensions.sql
│   ├── 0002_create_enums.sql
│   ├── 0003_create_users.sql
│   ├── 0004_create_contractor_profiles.sql
│   ├── 0005_create_customer_profiles.sql
│   ├── 0006_create_trade_categories.sql
│   ├── 0007_create_contractor_trade_categories.sql
│   ├── 0008_create_jobs.sql
│   ├── 0009_create_quotes.sql
│   └── 0010_create_ratings.sql
└── src/
    ├── main.rs           — server startup, TcpListener, runs migrations
    ├── lib.rs            — AppState, create_router (pub so tests can import)
    ├── config.rs         — Config struct loaded from env vars
    ├── error.rs          — AppError enum → consistent JSON HTTP responses
    ├── models/
    │   ├── mod.rs
    │   ├── user.rs       — User, UserRole
    │   ├── contractor.rs — ContractorProfile, RateUnit
    │   ├── customer.rs   — CustomerProfile
    │   ├── job.rs        — Job, JobStatus
    │   └── quote.rs      — Quote
    └── auth/
        ├── mod.rs
        ├── tokens.rs     — JWT encode/decode, Claims struct
        ├── password.rs   — argon2 hash + verify
        ├── middleware.rs — AuthUser extractor (validates Bearer JWT)
        └── handlers.rs   — register, login, refresh HTTP handlers

tests/
├── common/
│   └── mod.rs            — test_config(), post_json() helper, get_json()
└── auth_test.rs          — integration tests for all auth endpoints
```

---

## Task 1: Project Bootstrap + Docker

**Files:**
- Create: `backend/docker-compose.yml`
- Create: `backend/.env.example`
- Create: `backend/Cargo.toml`
- Create: `backend/src/main.rs`
- Create: `backend/src/lib.rs`

- [ ] **Step 1: Install prerequisites**

```bash
# Install Rust if not installed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install sqlx-cli (needed to run migrations and prepare offline queries)
cargo install sqlx-cli --no-default-features --features postgres
```

- [ ] **Step 2: Create backend/docker-compose.yml**

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_USER: knect
      POSTGRES_PASSWORD: knect
      POSTGRES_DB: knect
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

- [ ] **Step 3: Create backend/.env.example**

```env
DATABASE_URL=postgres://knect:knect@localhost:5432/knect
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace_with_64_plus_char_random_string_use_openssl_rand_hex_32
JWT_REFRESH_SECRET=replace_with_different_64_plus_char_random_string
PORT=3000
```

Copy to `.env`:
```bash
cp backend/.env.example backend/.env
# Then fill in real secrets:
# openssl rand -hex 32  (run twice, use for JWT_SECRET and JWT_REFRESH_SECRET)
```

- [ ] **Step 4: Create backend/Cargo.toml**

```toml
[package]
name = "knect-api"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.7", features = ["postgres", "runtime-tokio-rustls", "uuid", "chrono", "macros"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
jsonwebtoken = "9"
argon2 = "0.5"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
dotenvy = "0.15"
tower = "0.4"
tower-http = { version = "0.5", features = ["cors", "trace"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
thiserror = "1"
anyhow = "1"

[dev-dependencies]
tower = { version = "0.4", features = ["util"] }
http-body-util = "0.1"
```

- [ ] **Step 5: Create backend/src/lib.rs (stub)**

```rust
pub mod auth;
pub mod config;
pub mod error;
pub mod models;

use axum::Router;
use sqlx::PgPool;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
}

pub fn create_router(state: AppState) -> Router {
    Router::new().with_state(state)
}
```

- [ ] **Step 6: Create backend/src/main.rs (stub)**

```rust
use knect_api::{config::Config, create_router, AppState};
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "knect_api=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env()?;
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    let state = AppState { db: pool, config: config.clone() };
    let app = create_router(state);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Listening on {addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
```

- [ ] **Step 7: Create stub modules so the project compiles**

Create `backend/src/config.rs`:
```rust
#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub redis_url: String,
    pub jwt_secret: String,
    pub jwt_refresh_secret: String,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Result<Self, anyhow::Error> {
        todo!()
    }
}
```

Create `backend/src/error.rs`:
```rust
// placeholder — implemented in Task 2
```

Create `backend/src/models/mod.rs`:
```rust
// placeholder — implemented in Task 4
```

Create `backend/src/auth/mod.rs`:
```rust
// placeholder — implemented in Task 5
```

- [ ] **Step 8: Start Docker services**

```bash
cd backend
docker compose up -d
docker compose ps
```

Expected: postgres and redis containers show status `running`.

- [ ] **Step 9: Verify the project compiles**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo check
```

Expected: compiles with possible warnings, no errors.

- [ ] **Step 10: Commit**

```bash
git add backend/
git commit -m "feat: bootstrap Rust backend project with Docker Compose"
```

---

## Task 2: Config and Error Modules

**Files:**
- Modify: `backend/src/config.rs`
- Modify: `backend/src/error.rs`

- [ ] **Step 1: Write unit test for Config (TDD — write test first)**

Add to `backend/src/config.rs` (replacing the todo stub):

```rust
#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub redis_url: String,
    pub jwt_secret: String,
    pub jwt_refresh_secret: String,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Result<Self, anyhow::Error> {
        todo!()  // implement in Step 3
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_env_errors_when_database_url_missing() {
        std::env::remove_var("DATABASE_URL");
        std::env::remove_var("REDIS_URL");
        std::env::remove_var("JWT_SECRET");
        std::env::remove_var("JWT_REFRESH_SECRET");
        assert!(Config::from_env().is_err());
    }
}
```

- [ ] **Step 2: Run the test to confirm it panics (todo! panics, not a clean error — that's expected)**

```bash
cd backend
cargo test config -- --nocapture 2>&1 | head -20
```

Expected: test panics with "not yet implemented" — confirms the test runs and catches the missing implementation.

- [ ] **Step 3: Implement Config::from_env**

Replace the `todo!()` in `from_env`:

```rust
pub fn from_env() -> Result<Self, anyhow::Error> {
    dotenvy::dotenv().ok();
    Ok(Config {
        database_url: std::env::var("DATABASE_URL")
            .map_err(|_| anyhow::anyhow!("DATABASE_URL not set"))?,
        redis_url: std::env::var("REDIS_URL")
            .map_err(|_| anyhow::anyhow!("REDIS_URL not set"))?,
        jwt_secret: std::env::var("JWT_SECRET")
            .map_err(|_| anyhow::anyhow!("JWT_SECRET not set"))?,
        jwt_refresh_secret: std::env::var("JWT_REFRESH_SECRET")
            .map_err(|_| anyhow::anyhow!("JWT_REFRESH_SECRET not set"))?,
        port: std::env::var("PORT")
            .unwrap_or_else(|_| "3000".to_string())
            .parse()
            .map_err(|_| anyhow::anyhow!("PORT must be a valid number"))?,
    })
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd backend
cargo test config
```

Expected: `test config::tests::from_env_errors_when_database_url_missing ... ok`

- [ ] **Step 5: Implement AppError in error.rs**

Replace `backend/src/error.rs` with:

```rust
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Unauthorized(String),
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    Conflict(String),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_code) = match &self {
            AppError::NotFound(_) => (StatusCode::NOT_FOUND, "not_found"),
            AppError::Unauthorized(_) => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, "bad_request"),
            AppError::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
            AppError::Database(_) | AppError::Internal(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "internal_error")
            }
        };

        let message = match &self {
            AppError::Database(_) | AppError::Internal(_) => {
                "An internal error occurred".to_string()
            }
            other => other.to_string(),
        };

        (
            status,
            Json(json!({
                "error": error_code,
                "message": message,
                "status": status.as_u16()
            })),
        )
            .into_response()
    }
}
```

- [ ] **Step 6: Verify compilation**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo check
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/config.rs backend/src/error.rs
git commit -m "feat: add Config and AppError with JSON error responses"
```

---

## Task 3: Database Migrations

**Files:**
- Create: `backend/migrations/0001_create_extensions.sql` through `0010_create_ratings.sql`

- [ ] **Step 1: Create 0001_create_extensions.sql**

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
```

- [ ] **Step 2: Create 0002_create_enums.sql**

```sql
CREATE TYPE user_role AS ENUM ('contractor', 'customer', 'admin');
CREATE TYPE job_status AS ENUM ('pending', 'accepted', 'denied', 'in_progress', 'completed', 'cancelled');
CREATE TYPE rate_unit AS ENUM ('per_hour', 'per_job');
```

- [ ] **Step 3: Create 0003_create_users.sql**

```sql
CREATE TABLE users (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       TEXT        NOT NULL UNIQUE,
    phone       TEXT,
    password_hash TEXT      NOT NULL,
    role        user_role   NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    suspended_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email);
```

- [ ] **Step 4: Create 0004_create_contractor_profiles.sql**

```sql
CREATE TABLE contractor_profiles (
    user_id              UUID            PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name         TEXT            NOT NULL,
    bio                  TEXT,
    base_rate            DOUBLE PRECISION,
    base_rate_unit       rate_unit,
    is_available         BOOLEAN         NOT NULL DEFAULT FALSE,
    is_busy              BOOLEAN         NOT NULL DEFAULT FALSE,
    current_lat          DOUBLE PRECISION,
    current_lng          DOUBLE PRECISION,
    location_updated_at  TIMESTAMPTZ,
    avg_rating           DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    rating_count         INTEGER          NOT NULL DEFAULT 0
);
```

- [ ] **Step 5: Create 0005_create_customer_profiles.sql**

```sql
CREATE TABLE customer_profiles (
    user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL
);
```

- [ ] **Step 6: Create 0006_create_trade_categories.sql**

```sql
CREATE TABLE trade_categories (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name      TEXT NOT NULL UNIQUE,
    icon_slug TEXT NOT NULL
);

INSERT INTO trade_categories (name, icon_slug) VALUES
    ('Plumbing', 'wrench'),
    ('Electrical', 'bolt'),
    ('Landscaping', 'tree'),
    ('Cleaning', 'sparkles'),
    ('Carpentry', 'hammer'),
    ('Painting', 'paint-bucket'),
    ('HVAC', 'thermometer'),
    ('General Handyman', 'tool');
```

- [ ] **Step 7: Create 0007_create_contractor_trade_categories.sql**

```sql
CREATE TABLE contractor_trade_categories (
    contractor_id UUID REFERENCES contractor_profiles(user_id) ON DELETE CASCADE,
    category_id   UUID REFERENCES trade_categories(id)         ON DELETE CASCADE,
    PRIMARY KEY (contractor_id, category_id)
);
```

- [ ] **Step 8: Create 0008_create_jobs.sql**

```sql
CREATE TABLE jobs (
    id               UUID       PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id      UUID       NOT NULL REFERENCES users(id),
    contractor_id    UUID       NOT NULL REFERENCES users(id),
    status           job_status NOT NULL DEFAULT 'pending',
    description      TEXT       NOT NULL,
    location_lat     DOUBLE PRECISION NOT NULL,
    location_lng     DOUBLE PRECISION NOT NULL,
    location_address TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_customer_id   ON jobs(customer_id);
CREATE INDEX idx_jobs_contractor_id ON jobs(contractor_id);
CREATE INDEX idx_jobs_status        ON jobs(status);
```

- [ ] **Step 9: Create 0009_create_quotes.sql**

```sql
CREATE TABLE quotes (
    id                 UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id             UUID            NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    contractor_id      UUID            NOT NULL REFERENCES users(id),
    base_rate_snapshot DOUBLE PRECISION,
    custom_amount      DOUBLE PRECISION,
    custom_note        TEXT,
    created_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 10: Create 0010_create_ratings.sql**

```sql
CREATE TABLE ratings (
    id            UUID     PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id        UUID     NOT NULL UNIQUE REFERENCES jobs(id),
    contractor_id UUID     NOT NULL REFERENCES users(id),
    customer_id   UUID     NOT NULL REFERENCES users(id),
    score         SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
    review_text   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ratings_contractor_id ON ratings(contractor_id);
```

- [ ] **Step 11: Run migrations**

```bash
cd backend
source .env
cargo sqlx migrate run
```

Expected output:
```
Applied 0001_create_extensions.sql
Applied 0002_create_enums.sql
...
Applied 0010_create_ratings.sql
```

- [ ] **Step 12: Verify schema**

```bash
psql postgres://knect:knect@localhost:5432/knect -c "\dt"
```

Expected: 10 tables listed (`users`, `contractor_profiles`, `customer_profiles`, `trade_categories`, `contractor_trade_categories`, `jobs`, `quotes`, `ratings`, plus `_sqlx_migrations` and `spatial_ref_sys` from PostGIS).

- [ ] **Step 13: Commit**

```bash
git add backend/migrations/
git commit -m "feat: add full database schema with PostGIS"
```

---

## Task 4: Data Models

**Files:**
- Modify: `backend/src/models/mod.rs`
- Create: `backend/src/models/user.rs`
- Create: `backend/src/models/contractor.rs`
- Create: `backend/src/models/customer.rs`
- Create: `backend/src/models/job.rs`
- Create: `backend/src/models/quote.rs`

- [ ] **Step 1: Implement models/mod.rs**

```rust
pub mod contractor;
pub mod customer;
pub mod job;
pub mod quote;
pub mod user;
```

- [ ] **Step 2: Create models/user.rs**

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "user_role", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum UserRole {
    Contractor,
    Customer,
    Admin,
}

#[derive(Debug, Serialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub phone: Option<String>,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub role: UserRole,
    pub created_at: DateTime<Utc>,
    pub suspended_at: Option<DateTime<Utc>>,
}
```

- [ ] **Step 3: Create models/contractor.rs**

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "rate_unit", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum RateUnit {
    PerHour,
    PerJob,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ContractorProfile {
    pub user_id: Uuid,
    pub display_name: String,
    pub bio: Option<String>,
    pub base_rate: Option<f64>,
    pub base_rate_unit: Option<RateUnit>,
    pub is_available: bool,
    pub is_busy: bool,
    pub current_lat: Option<f64>,
    pub current_lng: Option<f64>,
    pub location_updated_at: Option<DateTime<Utc>>,
    pub avg_rating: f64,
    pub rating_count: i32,
}
```

- [ ] **Step 4: Create models/customer.rs**

```rust
use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow)]
pub struct CustomerProfile {
    pub user_id: Uuid,
    pub display_name: String,
}
```

- [ ] **Step 5: Create models/job.rs**

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "job_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Pending,
    Accepted,
    Denied,
    InProgress,
    Completed,
    Cancelled,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Job {
    pub id: Uuid,
    pub customer_id: Uuid,
    pub contractor_id: Uuid,
    pub status: JobStatus,
    pub description: String,
    pub location_lat: f64,
    pub location_lng: f64,
    pub location_address: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

- [ ] **Step 6: Create models/quote.rs**

```rust
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow)]
pub struct Quote {
    pub id: Uuid,
    pub job_id: Uuid,
    pub contractor_id: Uuid,
    pub base_rate_snapshot: Option<f64>,
    pub custom_amount: Option<f64>,
    pub custom_note: Option<String>,
    pub created_at: DateTime<Utc>,
}
```

- [ ] **Step 7: Verify compilation**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo check
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/src/models/
git commit -m "feat: add data model structs for all entities"
```

---

## Task 5: Auth Utilities (Tokens + Password)

**Files:**
- Modify: `backend/src/auth/mod.rs`
- Create: `backend/src/auth/tokens.rs`
- Create: `backend/src/auth/password.rs`

- [ ] **Step 1: Write failing unit tests for password hashing**

Create `backend/src/auth/password.rs` with the test first:

```rust
pub fn hash_password(_password: &str) -> Result<String, crate::error::AppError> {
    todo!()
}

pub fn verify_password(_password: &str, _hash: &str) -> Result<bool, crate::error::AppError> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_produces_verifiable_output() {
        let hash = hash_password("mysecret").unwrap();
        assert!(verify_password("mysecret", &hash).unwrap());
    }

    #[test]
    fn wrong_password_does_not_verify() {
        let hash = hash_password("mysecret").unwrap();
        assert!(!verify_password("wrongpassword", &hash).unwrap());
    }
}
```

- [ ] **Step 2: Run tests to confirm they panic (todo! — expected)**

```bash
cd backend
cargo test password 2>&1 | tail -5
```

Expected: test panics with "not yet implemented".

- [ ] **Step 3: Implement hash_password and verify_password**

Replace the todo! stubs in `backend/src/auth/password.rs`:

```rust
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

use crate::error::AppError;

pub fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Password hashing failed: {e}")))
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, AppError> {
    let parsed = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Invalid hash format: {e}")))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_produces_verifiable_output() {
        let hash = hash_password("mysecret").unwrap();
        assert!(verify_password("mysecret", &hash).unwrap());
    }

    #[test]
    fn wrong_password_does_not_verify() {
        let hash = hash_password("mysecret").unwrap();
        assert!(!verify_password("wrongpassword", &hash).unwrap());
    }
}
```

- [ ] **Step 4: Run password tests to confirm they pass**

```bash
cd backend
cargo test password
```

Expected:
```
test auth::password::tests::hash_produces_verifiable_output ... ok
test auth::password::tests::wrong_password_does_not_verify ... ok
```

- [ ] **Step 5: Write failing unit tests for JWT tokens**

Create `backend/src/auth/tokens.rs` with tests first:

```rust
use crate::{error::AppError, models::user::UserRole};
use uuid::Uuid;

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct Claims {
    pub sub: Uuid,
    pub role: UserRole,
    pub exp: usize,
}

pub fn create_access_token(
    _user_id: Uuid,
    _role: UserRole,
    _secret: &str,
) -> Result<String, AppError> {
    todo!()
}

pub fn create_refresh_token(
    _user_id: Uuid,
    _role: UserRole,
    _secret: &str,
) -> Result<String, AppError> {
    todo!()
}

pub fn verify_token(token: &str, secret: &str) -> Result<Claims, AppError> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "test_secret_that_is_at_least_64_characters_long_for_hs256_algorithm_testing";

    #[test]
    fn access_token_round_trips() {
        let id = Uuid::new_v4();
        let token = create_access_token(id, UserRole::Contractor, SECRET).unwrap();
        let claims = verify_token(&token, SECRET).unwrap();
        assert_eq!(claims.sub, id);
        assert_eq!(claims.role, UserRole::Contractor);
    }

    #[test]
    fn wrong_secret_fails_verification() {
        let token = create_access_token(Uuid::new_v4(), UserRole::Customer, SECRET).unwrap();
        assert!(verify_token(&token, "wrong_secret").is_err());
    }

    #[test]
    fn refresh_token_round_trips() {
        let id = Uuid::new_v4();
        let token = create_refresh_token(id, UserRole::Customer, SECRET).unwrap();
        let claims = verify_token(&token, SECRET).unwrap();
        assert_eq!(claims.sub, id);
    }
}
```

- [ ] **Step 6: Run tests to confirm they panic (expected)**

```bash
cd backend
cargo test tokens 2>&1 | tail -5
```

Expected: panics with "not yet implemented".

- [ ] **Step 7: Implement token functions**

Replace todo! stubs in `backend/src/auth/tokens.rs`:

```rust
use crate::{error::AppError, models::user::UserRole};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use uuid::Uuid;

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct Claims {
    pub sub: Uuid,
    pub role: UserRole,
    pub exp: usize,
}

pub fn create_access_token(
    user_id: Uuid,
    role: UserRole,
    secret: &str,
) -> Result<String, AppError> {
    let exp = (Utc::now() + Duration::hours(1)).timestamp() as usize;
    let claims = Claims { sub: user_id, role, exp };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("Token creation failed: {e}")))
}

pub fn create_refresh_token(
    user_id: Uuid,
    role: UserRole,
    secret: &str,
) -> Result<String, AppError> {
    let exp = (Utc::now() + Duration::days(30)).timestamp() as usize;
    let claims = Claims { sub: user_id, role, exp };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("Refresh token creation failed: {e}")))
}

pub fn verify_token(token: &str, secret: &str) -> Result<Claims, AppError> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map(|data| data.claims)
    .map_err(|_| AppError::Unauthorized("Invalid or expired token".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "test_secret_that_is_at_least_64_characters_long_for_hs256_algorithm_testing";

    #[test]
    fn access_token_round_trips() {
        let id = Uuid::new_v4();
        let token = create_access_token(id, UserRole::Contractor, SECRET).unwrap();
        let claims = verify_token(&token, SECRET).unwrap();
        assert_eq!(claims.sub, id);
        assert_eq!(claims.role, UserRole::Contractor);
    }

    #[test]
    fn wrong_secret_fails_verification() {
        let token = create_access_token(Uuid::new_v4(), UserRole::Customer, SECRET).unwrap();
        assert!(verify_token(&token, "wrong_secret").is_err());
    }

    #[test]
    fn refresh_token_round_trips() {
        let id = Uuid::new_v4();
        let token = create_refresh_token(id, UserRole::Customer, SECRET).unwrap();
        let claims = verify_token(&token, SECRET).unwrap();
        assert_eq!(claims.sub, id);
    }
}
```

- [ ] **Step 8: Update auth/mod.rs**

```rust
pub mod handlers;
pub mod middleware;
pub mod password;
pub mod tokens;
```

Create stub `backend/src/auth/handlers.rs`:
```rust
// implemented in Task 7
```

Create stub `backend/src/auth/middleware.rs`:
```rust
// implemented in Task 9
```

- [ ] **Step 9: Run all unit tests**

```bash
cd backend
cargo test
```

Expected:
```
test auth::password::tests::hash_produces_verifiable_output ... ok
test auth::password::tests::wrong_password_does_not_verify ... ok
test auth::tokens::tests::access_token_round_trips ... ok
test auth::tokens::tests::refresh_token_round_trips ... ok
test auth::tokens::tests::wrong_secret_fails_verification ... ok
```

- [ ] **Step 10: Commit**

```bash
git add backend/src/auth/
git commit -m "feat: add JWT token creation/verification and argon2 password hashing"
```

---

## Task 6: Test Infrastructure

**Files:**
- Create: `backend/tests/common/mod.rs`
- Create: `backend/tests/auth_test.rs` (skeleton only)

- [ ] **Step 1: Create tests/common/mod.rs**

```rust
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use knect_api::{config::Config, create_router, AppState};
use sqlx::PgPool;
use tower::ServiceExt;

pub fn test_config() -> Config {
    Config {
        database_url: "unused_in_sqlx_test_macro".to_string(),
        redis_url: "redis://localhost:6379".to_string(),
        jwt_secret: "test_jwt_secret_must_be_64_or_more_characters_long_for_hs256_to_work_correctly!".to_string(),
        jwt_refresh_secret: "test_refresh_secret_must_be_64_or_more_chars_long_for_hs256_to_work!".to_string(),
        port: 3000,
    }
}

pub fn test_app(pool: PgPool) -> axum::Router {
    let state = AppState {
        db: pool,
        config: test_config(),
    };
    create_router(state)
}

pub async fn post_json(
    app: &axum::Router,
    path: &str,
    body: serde_json::Value,
) -> (StatusCode, serde_json::Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(path)
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, json)
}

pub async fn get_json(
    app: &axum::Router,
    path: &str,
    bearer_token: Option<&str>,
) -> (StatusCode, serde_json::Value) {
    let mut builder = Request::builder().method("GET").uri(path);
    if let Some(token) = bearer_token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    let response = app
        .clone()
        .oneshot(builder.body(Body::empty()).unwrap())
        .await
        .unwrap();

    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, json)
}
```

- [ ] **Step 2: Create tests/auth_test.rs skeleton**

```rust
mod common;

// Tests are added in Tasks 7, 8, and 10
```

- [ ] **Step 3: Verify test infrastructure compiles**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo test --test auth_test 2>&1 | head -10
```

Expected: compiles (0 tests run since skeleton is empty — that's fine).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/
git commit -m "test: add integration test infrastructure and helpers"
```

---

## Task 7: Register Endpoint (TDD)

**Files:**
- Modify: `backend/tests/auth_test.rs`
- Modify: `backend/src/auth/handlers.rs`
- Modify: `backend/src/lib.rs`

- [ ] **Step 1: Write failing integration tests for register**

Add to `backend/tests/auth_test.rs`:

```rust
mod common;

#[sqlx::test(migrations = "./migrations")]
async fn register_contractor_returns_tokens(pool: sqlx::PgPool) {
    let app = common::test_app(pool);

    let (status, body) = common::post_json(
        &app,
        "/auth/register",
        serde_json::json!({
            "email": "contractor@example.com",
            "password": "password123",
            "role": "contractor",
            "display_name": "Alice Builder"
        }),
    )
    .await;

    assert_eq!(status, 200);
    assert!(body["access_token"].is_string(), "access_token missing");
    assert!(body["refresh_token"].is_string(), "refresh_token missing");
}

#[sqlx::test(migrations = "./migrations")]
async fn register_customer_returns_tokens(pool: sqlx::PgPool) {
    let app = common::test_app(pool);

    let (status, body) = common::post_json(
        &app,
        "/auth/register",
        serde_json::json!({
            "email": "customer@example.com",
            "password": "password123",
            "role": "customer",
            "display_name": "Bob Smith"
        }),
    )
    .await;

    assert_eq!(status, 200);
    assert!(body["access_token"].is_string());
}

#[sqlx::test(migrations = "./migrations")]
async fn register_duplicate_email_returns_409(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let payload = serde_json::json!({
        "email": "dup@example.com",
        "password": "password123",
        "role": "customer",
        "display_name": "Dup User"
    });

    common::post_json(&app, "/auth/register", payload.clone()).await;
    let (status, body) = common::post_json(&app, "/auth/register", payload).await;

    assert_eq!(status, 409);
    assert_eq!(body["error"], "conflict");
}

#[sqlx::test(migrations = "./migrations")]
async fn register_as_admin_returns_400(pool: sqlx::PgPool) {
    let app = common::test_app(pool);

    let (status, body) = common::post_json(
        &app,
        "/auth/register",
        serde_json::json!({
            "email": "admin@example.com",
            "password": "password123",
            "role": "admin",
            "display_name": "Admin"
        }),
    )
    .await;

    assert_eq!(status, 400);
    assert_eq!(body["error"], "bad_request");
}
```

- [ ] **Step 2: Run tests to confirm they fail (route not yet wired)**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo test --test auth_test 2>&1 | grep -E "FAILED|ok|error"
```

Expected: tests fail with 404 or compilation error since the handler and route don't exist yet.

- [ ] **Step 3: Implement the register handler**

Replace `backend/src/auth/handlers.rs` stub with:

```rust
use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::{
        password::hash_password,
        tokens::{create_access_token, create_refresh_token, verify_token},
    },
    error::AppError,
    models::user::UserRole,
    AppState,
};

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub phone: Option<String>,
    pub role: UserRole,
    pub display_name: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
}

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<AuthResponse>), AppError> {
    if req.role == UserRole::Admin {
        return Err(AppError::BadRequest("Cannot register as admin".to_string()));
    }

    let existing = sqlx::query!("SELECT id FROM users WHERE email = $1", req.email)
        .fetch_optional(&state.db)
        .await?;

    if existing.is_some() {
        return Err(AppError::Conflict("Email already registered".to_string()));
    }

    let password_hash = hash_password(&req.password)?;
    let user_id = Uuid::new_v4();

    sqlx::query!(
        "INSERT INTO users (id, email, phone, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
        user_id,
        req.email,
        req.phone,
        password_hash,
        req.role as UserRole,
    )
    .execute(&state.db)
    .await?;

    match req.role {
        UserRole::Contractor => {
            sqlx::query!(
                "INSERT INTO contractor_profiles (user_id, display_name) VALUES ($1, $2)",
                user_id,
                req.display_name,
            )
            .execute(&state.db)
            .await?;
        }
        UserRole::Customer => {
            sqlx::query!(
                "INSERT INTO customer_profiles (user_id, display_name) VALUES ($1, $2)",
                user_id,
                req.display_name,
            )
            .execute(&state.db)
            .await?;
        }
        UserRole::Admin => unreachable!(),
    }

    let access_token =
        create_access_token(user_id, req.role.clone(), &state.config.jwt_secret)?;
    let refresh_token =
        create_refresh_token(user_id, req.role, &state.config.jwt_refresh_secret)?;

    Ok((StatusCode::OK, Json(AuthResponse { access_token, refresh_token })))
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

pub async fn login(
    State(_state): State<AppState>,
    Json(_req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    todo!()  // implemented in Task 8
}

#[derive(Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

pub async fn refresh(
    State(_state): State<AppState>,
    Json(_req): Json<RefreshRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    todo!()  // implemented in Task 10
}
```

- [ ] **Step 4: Wire up routes in lib.rs**

Replace `backend/src/lib.rs`:

```rust
pub mod auth;
pub mod config;
pub mod error;
pub mod models;

use axum::{
    routing::post,
    Router,
};
use sqlx::PgPool;
use tower_http::trace::TraceLayer;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/auth/register", post(auth::handlers::register))
        .route("/auth/login", post(auth::handlers::login))
        .route("/auth/refresh", post(auth::handlers::refresh))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
```

- [ ] **Step 5: Prepare sqlx offline query data (needed for compile-time checking)**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo sqlx prepare
```

Expected: generates `sqlx-data.json` in the backend directory.

- [ ] **Step 6: Run register tests to confirm they pass**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo test --test auth_test register
```

Expected:
```
test register_contractor_returns_tokens ... ok
test register_customer_returns_tokens ... ok
test register_duplicate_email_returns_409 ... ok
test register_as_admin_returns_400 ... ok
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/ backend/tests/ backend/sqlx-data.json
git commit -m "feat: implement register endpoint with integration tests"
```

---

## Task 8: Login Endpoint (TDD)

**Files:**
- Modify: `backend/tests/auth_test.rs`
- Modify: `backend/src/auth/handlers.rs`

- [ ] **Step 1: Write failing tests for login**

Add to `backend/tests/auth_test.rs`:

```rust
#[sqlx::test(migrations = "./migrations")]
async fn login_with_correct_credentials_returns_tokens(pool: sqlx::PgPool) {
    let app = common::test_app(pool);

    // Register first
    common::post_json(
        &app,
        "/auth/register",
        serde_json::json!({
            "email": "login_user@example.com",
            "password": "correctpassword",
            "role": "customer",
            "display_name": "Login User"
        }),
    )
    .await;

    let (status, body) = common::post_json(
        &app,
        "/auth/login",
        serde_json::json!({
            "email": "login_user@example.com",
            "password": "correctpassword"
        }),
    )
    .await;

    assert_eq!(status, 200);
    assert!(body["access_token"].is_string());
    assert!(body["refresh_token"].is_string());
}

#[sqlx::test(migrations = "./migrations")]
async fn login_wrong_password_returns_401(pool: sqlx::PgPool) {
    let app = common::test_app(pool);

    common::post_json(
        &app,
        "/auth/register",
        serde_json::json!({
            "email": "user2@example.com",
            "password": "realpassword",
            "role": "contractor",
            "display_name": "User Two"
        }),
    )
    .await;

    let (status, body) = common::post_json(
        &app,
        "/auth/login",
        serde_json::json!({
            "email": "user2@example.com",
            "password": "wrongpassword"
        }),
    )
    .await;

    assert_eq!(status, 401);
    assert_eq!(body["error"], "unauthorized");
}

#[sqlx::test(migrations = "./migrations")]
async fn login_unknown_email_returns_401(pool: sqlx::PgPool) {
    let app = common::test_app(pool);

    let (status, body) = common::post_json(
        &app,
        "/auth/login",
        serde_json::json!({
            "email": "nobody@example.com",
            "password": "password"
        }),
    )
    .await;

    assert_eq!(status, 401);
    assert_eq!(body["error"], "unauthorized");
}

#[sqlx::test(migrations = "./migrations")]
async fn login_suspended_account_returns_401(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());

    common::post_json(
        &app,
        "/auth/register",
        serde_json::json!({
            "email": "suspended@example.com",
            "password": "password",
            "role": "customer",
            "display_name": "Suspended"
        }),
    )
    .await;

    // Manually suspend the user in the DB
    sqlx::query!(
        "UPDATE users SET suspended_at = NOW() WHERE email = $1",
        "suspended@example.com"
    )
    .execute(&pool)
    .await
    .unwrap();

    let (status, body) = common::post_json(
        &app,
        "/auth/login",
        serde_json::json!({
            "email": "suspended@example.com",
            "password": "password"
        }),
    )
    .await;

    assert_eq!(status, 401);
    assert_eq!(body["error"], "unauthorized");
}
```

- [ ] **Step 2: Run to confirm login tests fail (todo! panics)**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo test --test auth_test login 2>&1 | grep -E "FAILED|ok|panicked"
```

Expected: tests panic with "not yet implemented".

- [ ] **Step 3: Implement the login handler**

Replace the `login` todo! in `backend/src/auth/handlers.rs`:

```rust
pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let row = sqlx::query!(
        r#"SELECT id, password_hash, role as "role: UserRole", suspended_at
           FROM users WHERE email = $1"#,
        req.email
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("Invalid email or password".to_string()))?;

    if row.suspended_at.is_some() {
        return Err(AppError::Unauthorized("Account suspended".to_string()));
    }

    if !crate::auth::password::verify_password(&req.password, &row.password_hash)? {
        return Err(AppError::Unauthorized("Invalid email or password".to_string()));
    }

    let access_token = create_access_token(row.id, row.role.clone(), &state.config.jwt_secret)?;
    let refresh_token =
        create_refresh_token(row.id, row.role, &state.config.jwt_refresh_secret)?;

    Ok(Json(AuthResponse { access_token, refresh_token }))
}
```

Note: also add `use crate::auth::tokens::verify_token;` to the imports at the top (needed for Task 10).

- [ ] **Step 4: Regenerate sqlx offline data**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo sqlx prepare
```

- [ ] **Step 5: Run login tests to confirm they pass**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo test --test auth_test login
```

Expected: all 4 login tests pass.

- [ ] **Step 6: Run full test suite to confirm no regressions**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/auth/handlers.rs backend/tests/auth_test.rs backend/sqlx-data.json
git commit -m "feat: implement login endpoint with integration tests"
```

---

## Task 9: JWT Middleware

**Files:**
- Modify: `backend/src/auth/middleware.rs`
- Modify: `backend/tests/auth_test.rs`
- Modify: `backend/src/lib.rs`

- [ ] **Step 1: Write a failing test for a protected route**

Add to `backend/tests/auth_test.rs`:

```rust
#[sqlx::test(migrations = "./migrations")]
async fn request_without_token_to_protected_route_returns_401(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    // /auth/me is a simple protected route we'll add to verify the middleware
    let (status, body) = common::get_json(&app, "/auth/me", None).await;
    assert_eq!(status, 401);
    assert_eq!(body["error"], "unauthorized");
}

#[sqlx::test(migrations = "./migrations")]
async fn request_with_valid_token_to_protected_route_returns_200(pool: sqlx::PgPool) {
    let app = common::test_app(pool);

    let (_, reg_body) = common::post_json(
        &app,
        "/auth/register",
        serde_json::json!({
            "email": "me@example.com",
            "password": "password",
            "role": "customer",
            "display_name": "Me"
        }),
    )
    .await;

    let token = reg_body["access_token"].as_str().unwrap();
    let (status, body) = common::get_json(&app, "/auth/me", Some(token)).await;

    assert_eq!(status, 200);
    assert_eq!(body["email"], "me@example.com");
}
```

- [ ] **Step 2: Run to confirm tests fail (route doesn't exist)**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo test --test auth_test me 2>&1 | grep -E "FAILED|ok"
```

Expected: tests fail with 404 or compile error.

- [ ] **Step 3: Implement AuthUser extractor in middleware.rs**

```rust
use axum::{async_trait, extract::FromRequestParts, http::request::Parts};

use crate::{auth::tokens::{verify_token, Claims}, error::AppError, AppState};

pub struct AuthUser(pub Claims);

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or_else(|| AppError::Unauthorized("Missing authorization header".to_string()))?;

        let claims = verify_token(token, &state.config.jwt_secret)?;
        Ok(AuthUser(claims))
    }
}
```

- [ ] **Step 4: Add /auth/me handler to handlers.rs**

Add to the bottom of `backend/src/auth/handlers.rs`:

```rust
use crate::auth::middleware::AuthUser;

pub async fn me(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query!(
        "SELECT email, phone FROM users WHERE id = $1",
        claims.sub
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    Ok(Json(serde_json::json!({
        "id": claims.sub,
        "email": row.email,
        "phone": row.phone,
        "role": claims.role,
    })))
}
```

- [ ] **Step 5: Wire /auth/me route in lib.rs**

Add to `create_router` in `backend/src/lib.rs`:

```rust
use axum::routing::{get, post};

// In create_router:
.route("/auth/me", get(auth::handlers::me))
```

- [ ] **Step 6: Regenerate sqlx offline data**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo sqlx prepare
```

- [ ] **Step 7: Run middleware tests to confirm they pass**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo test --test auth_test me
```

Expected: both middleware tests pass.

- [ ] **Step 8: Run full test suite**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add backend/src/auth/ backend/tests/auth_test.rs backend/src/lib.rs backend/sqlx-data.json
git commit -m "feat: add JWT middleware AuthUser extractor and /auth/me endpoint"
```

---

## Task 10: Refresh Endpoint (TDD)

**Files:**
- Modify: `backend/tests/auth_test.rs`
- Modify: `backend/src/auth/handlers.rs`

- [ ] **Step 1: Write failing tests for token refresh**

Add to `backend/tests/auth_test.rs`:

```rust
#[sqlx::test(migrations = "./migrations")]
async fn refresh_with_valid_token_returns_new_tokens(pool: sqlx::PgPool) {
    let app = common::test_app(pool);

    let (_, reg_body) = common::post_json(
        &app,
        "/auth/register",
        serde_json::json!({
            "email": "refresh@example.com",
            "password": "password",
            "role": "contractor",
            "display_name": "Refresh User"
        }),
    )
    .await;

    let refresh_token = reg_body["refresh_token"].as_str().unwrap();

    let (status, body) = common::post_json(
        &app,
        "/auth/refresh",
        serde_json::json!({ "refresh_token": refresh_token }),
    )
    .await;

    assert_eq!(status, 200);
    assert!(body["access_token"].is_string());
    assert!(body["refresh_token"].is_string());
    // New tokens should differ from originals
    assert_ne!(body["access_token"].as_str().unwrap(), reg_body["access_token"].as_str().unwrap());
}

#[sqlx::test(migrations = "./migrations")]
async fn refresh_with_invalid_token_returns_401(pool: sqlx::PgPool) {
    let app = common::test_app(pool);

    let (status, body) = common::post_json(
        &app,
        "/auth/refresh",
        serde_json::json!({ "refresh_token": "not.a.valid.token" }),
    )
    .await;

    assert_eq!(status, 401);
    assert_eq!(body["error"], "unauthorized");
}

#[sqlx::test(migrations = "./migrations")]
async fn refresh_for_suspended_account_returns_401(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());

    let (_, reg_body) = common::post_json(
        &app,
        "/auth/register",
        serde_json::json!({
            "email": "susp_refresh@example.com",
            "password": "password",
            "role": "customer",
            "display_name": "Suspended"
        }),
    )
    .await;

    sqlx::query!(
        "UPDATE users SET suspended_at = NOW() WHERE email = $1",
        "susp_refresh@example.com"
    )
    .execute(&pool)
    .await
    .unwrap();

    let refresh_token = reg_body["refresh_token"].as_str().unwrap();
    let (status, body) = common::post_json(
        &app,
        "/auth/refresh",
        serde_json::json!({ "refresh_token": refresh_token }),
    )
    .await;

    assert_eq!(status, 401);
    assert_eq!(body["error"], "unauthorized");
}
```

- [ ] **Step 2: Run to confirm tests fail (todo! panics)**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo test --test auth_test refresh 2>&1 | grep -E "FAILED|ok|panicked"
```

Expected: tests panic with "not yet implemented".

- [ ] **Step 3: Implement the refresh handler**

Replace the `refresh` todo! in `backend/src/auth/handlers.rs`:

```rust
pub async fn refresh(
    State(state): State<AppState>,
    Json(req): Json<RefreshRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let claims = verify_token(&req.refresh_token, &state.config.jwt_refresh_secret)?;

    let row = sqlx::query!(
        "SELECT id, suspended_at FROM users WHERE id = $1",
        claims.sub
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("User not found".to_string()))?;

    if row.suspended_at.is_some() {
        return Err(AppError::Unauthorized("Account suspended".to_string()));
    }

    let access_token =
        create_access_token(claims.sub, claims.role.clone(), &state.config.jwt_secret)?;
    let refresh_token =
        create_refresh_token(claims.sub, claims.role, &state.config.jwt_refresh_secret)?;

    Ok(Json(AuthResponse { access_token, refresh_token }))
}
```

- [ ] **Step 4: Regenerate sqlx offline data**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo sqlx prepare
```

- [ ] **Step 5: Run refresh tests to confirm they pass**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo test --test auth_test refresh
```

Expected: all 3 refresh tests pass.

- [ ] **Step 6: Run full test suite**

```bash
cd backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo test
```

Expected: all tests pass — unit tests for password and tokens, integration tests for register, login, middleware, and refresh.

- [ ] **Step 7: Commit**

```bash
git add backend/src/auth/handlers.rs backend/tests/auth_test.rs backend/sqlx-data.json
git commit -m "feat: implement refresh endpoint with integration tests"
```

---

## Self-Review Checklist

- [x] Spec coverage: auth endpoints (register ✓, login ✓, refresh ✓), error envelope ✓, JWT roles ✓, full schema ✓, PostGIS ✓, Redis (deferred to Plan 2), WebSockets (deferred to Plan 2/3)
- [x] No TBD/TODO/placeholder steps
- [x] Type consistency: `UserRole`, `JobStatus`, `RateUnit` defined once in models, referenced consistently throughout handlers and tokens
- [x] `DOUBLE PRECISION` used throughout migrations and `f64` in models — no NUMERIC/rust_decimal complexity
- [x] `#[sqlx::test]` provides database isolation — no manual truncation needed
- [x] sqlx-data.json regenerated after each handler addition for offline compile-time checking
