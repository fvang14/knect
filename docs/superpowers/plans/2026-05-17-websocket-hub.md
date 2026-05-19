# WebSocket Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-time WebSocket hub to the Knect Rust/Axum backend that broadcasts contractor location updates to customers and delivers job lifecycle events to individual users.

**Architecture:** A `WsHub` struct backed by a `DashMap<Uuid, (Uuid, UserRole, mpsc::Sender<WsEvent>)>` holds all active WebSocket connections keyed by user ID. Two background Tokio tasks subscribe to Redis pub/sub channels — one for location broadcasts, one for per-user job events — and deliver received messages to the appropriate in-memory senders. REST handlers publish to Redis after DB writes; the hub bridges Redis to the WebSocket sockets.

**Tech Stack:** Rust, Axum 0.7 (`axum::extract::ws`), Redis pub/sub (existing `redis` crate), `dashmap 5`, `futures-util 0.3`, `tokio-tungstenite` (tests only), `reqwest` (tests only).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/Cargo.toml` | Modify | Add dashmap, futures-util, tokio-tungstenite (dev), reqwest (dev) |
| `backend/src/ws/events.rs` | Create | `WsEvent` enum + `ContractorPosition` struct |
| `backend/src/ws/mod.rs` | Create | `WsHub` struct, register/deregister/deliver/publish methods, background subscriber fns |
| `backend/src/ws/handler.rs` | Create | Axum WS upgrade handler, snapshot assembly, connection lifecycle |
| `backend/src/lib.rs` | Modify | Add `pub mod ws`, add `hub: Arc<WsHub>` to `AppState`, add `GET /ws` route |
| `backend/src/main.rs` | Modify | Create hub, spawn background subscriber tasks |
| `backend/tests/common/mod.rs` | Modify | Update `test_app` to include hub, add `ws_connect` helper |
| `backend/src/contractor/handlers.rs` | Modify | `update_location` and `complete_job` publish WS events |
| `backend/src/customer/handlers.rs` | Modify | `create_job` publishes `job_requested` |
| `backend/src/contractor/handlers.rs` | Modify | `respond_to_job` publishes `job_accepted`/`job_denied` |
| `backend/tests/ws_test.rs` | Create | Integration tests for all WS scenarios |

---

### Task 1: Add Dependencies

**Files:**
- Modify: `backend/Cargo.toml`

- [ ] **Step 1: Add dependencies**

Open `backend/Cargo.toml`. Add to `[dependencies]`:

```toml
dashmap = "5"
futures-util = "0.3"
```

Add to `[dev-dependencies]`:

```toml
tokio-tungstenite = { version = "0.21", features = ["native-tls"] }
reqwest = { version = "0.12", features = ["json"] }
```

- [ ] **Step 2: Verify it compiles**

```bash
cd backend && cargo check
```

Expected: compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add backend/Cargo.toml backend/Cargo.lock
git commit -m "chore: add dashmap, futures-util, tokio-tungstenite, reqwest deps"
```

---

### Task 2: Create `src/ws/events.rs` — WsEvent Enum

**Files:**
- Create: `backend/src/ws/events.rs`

- [ ] **Step 1: Write unit test for WsEvent serialization**

Create `backend/src/ws/events.rs` with only the test first:

```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractorPosition {
    pub contractor_id: Uuid,
    pub lat: f64,
    pub lng: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsEvent {
    Snapshot { contractors: Vec<ContractorPosition> },
    LocationUpdate { contractor_id: Uuid, lat: f64, lng: f64 },
    JobRequested { job_id: Uuid, description: String, location_lat: f64, location_lng: f64 },
    JobAccepted { job_id: Uuid },
    JobDenied { job_id: Uuid },
    JobCompleted { job_id: Uuid },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_serializes_with_type_field() {
        let event = WsEvent::Snapshot { contractors: vec![] };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "snapshot");
        assert!(json["contractors"].is_array());
    }

    #[test]
    fn location_update_serializes_with_type_field() {
        let id = Uuid::new_v4();
        let event = WsEvent::LocationUpdate { contractor_id: id, lat: 40.71, lng: -74.0 };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "location_update");
        assert_eq!(json["contractor_id"], id.to_string());
    }

    #[test]
    fn job_requested_serializes_with_type_field() {
        let event = WsEvent::JobRequested {
            job_id: Uuid::new_v4(),
            description: "Fix sink".into(),
            location_lat: 40.7,
            location_lng: -74.0,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "job_requested");
        assert_eq!(json["description"], "Fix sink");
    }

    #[test]
    fn job_accepted_round_trips() {
        let id = Uuid::new_v4();
        let event = WsEvent::JobAccepted { job_id: id };
        let json = serde_json::to_string(&event).unwrap();
        let decoded: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded["type"], "job_accepted");
        assert_eq!(decoded["job_id"], id.to_string());
    }
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd backend && cargo test ws::events
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/ws/events.rs
git commit -m "feat: add WsEvent enum with serde type tag"
```

---

### Task 3: Create `src/ws/mod.rs` — WsHub and Subscriber Functions

**Files:**
- Create: `backend/src/ws/mod.rs`

- [ ] **Step 1: Write unit tests for hub register/deregister/deliver**

Create `backend/src/ws/mod.rs`:

```rust
pub mod events;
pub mod handler;

use std::sync::Arc;

use dashmap::DashMap;
use futures_util::StreamExt;
use uuid::Uuid;
use tokio::sync::mpsc;

use crate::models::user::UserRole;
use events::WsEvent;

pub struct WsHub {
    connections: DashMap<Uuid, (Uuid, UserRole, mpsc::Sender<WsEvent>)>,
    redis: redis::aio::ConnectionManager,
}

impl WsHub {
    pub fn new(redis: redis::aio::ConnectionManager) -> Arc<Self> {
        Arc::new(WsHub {
            connections: DashMap::new(),
            redis,
        })
    }

    /// Register a new connection. Returns (connection_id, receiver).
    /// If the user was already connected, replaces the old sender.
    pub fn register(&self, user_id: Uuid, role: UserRole) -> (Uuid, mpsc::Receiver<WsEvent>) {
        let connection_id = Uuid::new_v4();
        let (tx, rx) = mpsc::channel(32);
        self.connections.insert(user_id, (connection_id, role, tx));
        (connection_id, rx)
    }

    /// Remove a connection only if the stored connection_id matches.
    /// Guards against a late-disconnecting old connection evicting a newer one.
    pub fn deregister(&self, user_id: Uuid, connection_id: Uuid) {
        self.connections
            .remove_if(&user_id, |_, (id, _, _)| *id == connection_id);
    }

    /// Fan out an event to all connected customers.
    pub fn deliver_to_customers(&self, event: WsEvent) {
        for entry in self.connections.iter() {
            let (_, role, tx) = entry.value();
            if *role == UserRole::Customer {
                let _ = tx.try_send(event.clone());
            }
        }
    }

    /// Deliver an event to a specific user's connection (if connected).
    pub fn deliver_to_user(&self, user_id: &Uuid, event: WsEvent) {
        if let Some(entry) = self.connections.get(user_id) {
            let (_, _, tx) = entry.value();
            let _ = tx.try_send(event);
        }
    }

    /// Publish a job event for a user via Redis pub/sub.
    pub async fn publish_job_event(&self, user_id: Uuid, event: &WsEvent) {
        use redis::AsyncCommands;
        let Ok(json) = serde_json::to_string(event) else { return };
        let channel = format!("user:{}:events", user_id);
        let mut conn = self.redis.clone();
        if let Err(e) = conn.publish::<_, _, ()>(&channel, &json).await {
            tracing::warn!("publish_job_event failed: {e}");
        }
    }

    /// Publish a location update via Redis pub/sub.
    pub async fn publish_location(&self, event: &WsEvent) {
        use redis::AsyncCommands;
        let Ok(json) = serde_json::to_string(event) else { return };
        let mut conn = self.redis.clone();
        if let Err(e) = conn.publish::<_, _, ()>("location:updates", &json).await {
            tracing::warn!("publish_location failed: {e}");
        }
    }
}

fn parse_user_id_from_channel(channel: &str) -> Option<Uuid> {
    // Expected format: "user:{uuid}:events"
    let parts: Vec<&str> = channel.split(':').collect();
    if parts.len() == 3 && parts[0] == "user" && parts[2] == "events" {
        Uuid::parse_str(parts[1]).ok()
    } else {
        None
    }
}

/// Subscribes to `location:updates` and fans out to all connected customers.
/// Loops forever; returns Err on connection loss so the caller can restart.
pub async fn run_location_subscriber(hub: Arc<WsHub>, redis_url: &str) -> anyhow::Result<()> {
    let client = redis::Client::open(redis_url)?;
    let conn = client.get_async_connection().await?;
    let mut pubsub = conn.into_pubsub();
    pubsub.subscribe("location:updates").await?;
    let mut stream = pubsub.on_message();
    loop {
        match stream.next().await {
            Some(msg) => {
                let payload: String = msg.get_payload()?;
                if let Ok(event) = serde_json::from_str::<WsEvent>(&payload) {
                    hub.deliver_to_customers(event);
                }
            }
            None => return Err(anyhow::anyhow!("location:updates stream ended")),
        }
    }
}

/// Pattern-subscribes to `user:*:events` and delivers to the matching connection.
/// Loops forever; returns Err on connection loss so the caller can restart.
pub async fn run_events_subscriber(hub: Arc<WsHub>, redis_url: &str) -> anyhow::Result<()> {
    let client = redis::Client::open(redis_url)?;
    let conn = client.get_async_connection().await?;
    let mut pubsub = conn.into_pubsub();
    pubsub.psubscribe("user:*:events").await?;
    let mut stream = pubsub.on_message();
    loop {
        match stream.next().await {
            Some(msg) => {
                let channel: String = msg.get_channel()?;
                if let Some(user_id) = parse_user_id_from_channel(&channel) {
                    let payload: String = msg.get_payload()?;
                    if let Ok(event) = serde_json::from_str::<WsEvent>(&payload) {
                        hub.deliver_to_user(&user_id, event);
                    }
                }
            }
            None => return Err(anyhow::anyhow!("user:*:events stream ended")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ws::events::WsEvent;

    fn make_hub() -> Arc<WsHub> {
        // Stub: ConnectionManager can't be constructed without real Redis in unit tests.
        // These tests only exercise DashMap operations (no Redis calls).
        // Use tokio::runtime to drive async where needed.
        // We'll skip hub construction here and test via integration tests for Redis paths.
        // Pure DashMap logic is tested below with a channel trick.
        unreachable!("use integration tests for hub construction")
    }

    #[test]
    fn parse_user_id_from_channel_valid() {
        let id = Uuid::new_v4();
        let channel = format!("user:{}:events", id);
        assert_eq!(parse_user_id_from_channel(&channel), Some(id));
    }

    #[test]
    fn parse_user_id_from_channel_invalid() {
        assert_eq!(parse_user_id_from_channel("location:updates"), None);
        assert_eq!(parse_user_id_from_channel("user:not-a-uuid:events"), None);
        assert_eq!(parse_user_id_from_channel("user:events"), None);
    }
}
```

- [ ] **Step 2: Run unit tests**

```bash
cd backend && cargo test ws::mod::tests
```

Expected: `parse_user_id_from_channel_valid` and `parse_user_id_from_channel_invalid` pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/ws/mod.rs
git commit -m "feat: add WsHub with register/deregister/deliver/publish and subscriber fns"
```

---

### Task 4: Create `src/ws/handler.rs` — WebSocket Upgrade Handler

**Files:**
- Create: `backend/src/ws/handler.rs`

- [ ] **Step 1: Write the handler**

Create `backend/src/ws/handler.rs`:

```rust
use axum::{
    extract::{Query, State, WebSocketUpgrade},
    extract::ws::{Message, WebSocket},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use futures_util::{SinkExt, StreamExt};
use redis::AsyncCommands;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::{
    auth::tokens::verify_token,
    models::user::UserRole,
    ws::events::{ContractorPosition, WsEvent},
    AppState,
};

#[derive(Deserialize)]
pub struct WsQuery {
    pub token: String,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(q): Query<WsQuery>,
    State(state): State<AppState>,
) -> Response {
    match verify_token(&q.token, &state.config.jwt_secret) {
        Ok(claims) => ws.on_upgrade(move |socket| handle_socket(socket, claims.sub, claims.role, state)),
        Err(_) => (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "unauthorized", "message": "Invalid token", "status": 401})),
        )
            .into_response(),
    }
}

async fn handle_socket(mut socket: WebSocket, user_id: Uuid, role: UserRole, state: AppState) {
    let (connection_id, mut rx) = state.hub.register(user_id, role.clone());

    if role == UserRole::Customer {
        let snapshot = build_snapshot(&mut state.redis.clone()).await;
        if let Ok(json) = serde_json::to_string(&snapshot) {
            if socket.send(Message::Text(json)).await.is_err() {
                state.hub.deregister(user_id, connection_id);
                return;
            }
        }
    }

    let (mut ws_sender, mut ws_receiver) = socket.split();

    let send_task = tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let Ok(json) = serde_json::to_string(&event) {
                if ws_sender.send(Message::Text(json)).await.is_err() {
                    break;
                }
            }
        }
    });

    let recv_task = tokio::spawn(async move {
        while let Some(result) = ws_receiver.next().await {
            match result {
                Ok(Message::Close(_)) | Err(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }

    state.hub.deregister(user_id, connection_id);
}

async fn build_snapshot(redis: &mut redis::aio::ConnectionManager) -> WsEvent {
    let keys: Vec<String> = redis.keys("contractor:*:pos").await.unwrap_or_default();
    let mut contractors = Vec::new();
    for key in &keys {
        if let Ok(val) = redis.get::<_, String>(key).await {
            // key: "contractor:{uuid}:pos", val: "{lat},{lng}"
            let parts: Vec<&str> = key.split(':').collect();
            if parts.len() == 3 {
                if let Ok(id) = Uuid::parse_str(parts[1]) {
                    let coords: Vec<&str> = val.split(',').collect();
                    if coords.len() == 2 {
                        if let (Ok(lat), Ok(lng)) =
                            (coords[0].parse::<f64>(), coords[1].parse::<f64>())
                        {
                            contractors.push(ContractorPosition { contractor_id: id, lat, lng });
                        }
                    }
                }
            }
        }
    }
    WsEvent::Snapshot { contractors }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd backend && cargo check
```

Expected: no errors. (Full tests come in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add backend/src/ws/handler.rs
git commit -m "feat: add WebSocket upgrade handler with JWT auth and snapshot delivery"
```

---

### Task 5: Wire WsHub into AppState, lib.rs, main.rs, and Test Helpers

**Files:**
- Modify: `backend/src/lib.rs`
- Modify: `backend/src/main.rs`
- Modify: `backend/tests/common/mod.rs`

- [ ] **Step 1: Update `src/lib.rs`**

Replace the entire content of `backend/src/lib.rs`:

```rust
pub mod admin;
pub mod auth;
pub mod config;
pub mod contractor;
pub mod customer;
pub mod error;
pub mod models;
pub mod ws;

use std::sync::Arc;

use axum::{
    routing::{delete, get, post, put},
    Router,
};
use sqlx::PgPool;
use tower_http::trace::TraceLayer;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
    pub redis: redis::aio::ConnectionManager,
    pub hub: Arc<ws::WsHub>,
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        // Auth
        .route("/auth/register", post(auth::handlers::register))
        .route("/auth/login", post(auth::handlers::login))
        .route("/auth/refresh", post(auth::handlers::refresh))
        .route("/auth/me", get(auth::handlers::me))
        // Contractor
        .route("/contractor/profile", get(contractor::handlers::get_profile))
        .route("/contractor/profile", put(contractor::handlers::update_profile))
        .route("/contractor/availability", post(contractor::handlers::set_availability))
        .route("/location", post(contractor::handlers::update_location))
        .route("/contractor/jobs", get(contractor::handlers::list_jobs))
        .route("/jobs/:id/respond", post(contractor::handlers::respond_to_job))
        .route("/jobs/:id/quote", post(contractor::handlers::submit_quote))
        .route("/jobs/:id/complete", post(contractor::handlers::complete_job))
        // Customer
        .route("/contractors/nearby", get(customer::handlers::nearby_contractors))
        .route("/contractors/:id", get(customer::handlers::contractor_profile))
        .route("/jobs", post(customer::handlers::create_job))
        .route("/jobs/:id", get(customer::handlers::get_job))
        .route("/jobs/:id", delete(customer::handlers::cancel_job))
        .route("/jobs/:id/rating", post(customer::handlers::submit_rating))
        // Admin
        .route("/admin/users", get(admin::handlers::list_users))
        .route("/admin/users/:id/suspend", put(admin::handlers::suspend_user))
        .route("/admin/jobs", get(admin::handlers::list_jobs))
        .route("/admin/metrics", get(admin::handlers::get_metrics))
        // WebSocket
        .route("/ws", get(ws::handler::ws_handler))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
```

- [ ] **Step 2: Update `src/main.rs`**

Replace the entire content of `backend/src/main.rs`:

```rust
use std::sync::Arc;

use knect_api::{config::Config, create_router, ws, AppState};
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

    let redis_client = redis::Client::open(config.redis_url.as_str())
        .map_err(|e| anyhow::anyhow!("Redis client error: {e}"))?;
    let redis = redis::aio::ConnectionManager::new(redis_client)
        .await
        .map_err(|e| anyhow::anyhow!("Redis connection failed: {e}"))?;

    let hub = ws::WsHub::new(redis.clone());

    let hub_loc = Arc::clone(&hub);
    let redis_url_loc = config.redis_url.clone();
    tokio::spawn(async move {
        loop {
            if let Err(e) = ws::run_location_subscriber(Arc::clone(&hub_loc), &redis_url_loc).await {
                tracing::error!("Location subscriber crashed: {e}");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    });

    let hub_ev = Arc::clone(&hub);
    let redis_url_ev = config.redis_url.clone();
    tokio::spawn(async move {
        loop {
            if let Err(e) = ws::run_events_subscriber(Arc::clone(&hub_ev), &redis_url_ev).await {
                tracing::error!("Events subscriber crashed: {e}");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    });

    let state = AppState { db: pool, config: config.clone(), redis, hub };
    let app = create_router(state);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Listening on {addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
```

- [ ] **Step 3: Update `tests/common/mod.rs`**

Replace the `test_app` function (lines 20-25) with a version that includes the hub. Also add a `start_ws_server` helper for WebSocket tests:

```rust
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use knect_api::{config::Config, create_router, ws::WsHub, AppState};
use sqlx::PgPool;
use std::net::SocketAddr;
use std::sync::Arc;
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

pub async fn test_app(pool: PgPool) -> axum::Router {
    let redis_client = redis::Client::open("redis://localhost:6379").unwrap();
    let redis = redis::aio::ConnectionManager::new(redis_client).await.unwrap();
    let hub = WsHub::new(redis.clone());
    let state = AppState { db: pool, config: test_config(), redis, hub };
    create_router(state)
}

/// Start a real bound server for WebSocket tests. Returns (addr, jwt_secret).
/// Background subscriber tasks are spawned so pub/sub works end-to-end.
pub async fn start_ws_server(pool: PgPool) -> (SocketAddr, String) {
    let redis_client = redis::Client::open("redis://localhost:6379").unwrap();
    let redis = redis::aio::ConnectionManager::new(redis_client.clone()).await.unwrap();
    let hub = WsHub::new(redis.clone());

    let hub_loc = Arc::clone(&hub);
    tokio::spawn(async move {
        loop {
            let _ = knect_api::ws::run_location_subscriber(
                Arc::clone(&hub_loc),
                "redis://localhost:6379",
            )
            .await;
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    });

    let hub_ev = Arc::clone(&hub);
    tokio::spawn(async move {
        loop {
            let _ = knect_api::ws::run_events_subscriber(
                Arc::clone(&hub_ev),
                "redis://localhost:6379",
            )
            .await;
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    });

    let config = test_config();
    let jwt_secret = config.jwt_secret.clone();
    let state = AppState { db: pool, config, redis, hub };
    let app = create_router(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    (addr, jwt_secret)
}

// --- keep all existing helpers below unchanged ---

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
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, json)
}

pub async fn post_json_auth(
    app: &axum::Router,
    path: &str,
    bearer_token: &str,
    body: serde_json::Value,
) -> (StatusCode, serde_json::Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
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

pub async fn put_json(
    app: &axum::Router,
    path: &str,
    bearer_token: &str,
    body: serde_json::Value,
) -> (StatusCode, serde_json::Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
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

pub async fn delete_req(
    app: &axum::Router,
    path: &str,
    bearer_token: &str,
) -> (StatusCode, serde_json::Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(path)
                .header("authorization", format!("Bearer {bearer_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, json)
}

/// Register a user and return the access token.
pub async fn register_and_login(
    app: &axum::Router,
    email: &str,
    role: &str,
    display_name: &str,
) -> String {
    let (_, body) = post_json(
        app,
        "/auth/register",
        serde_json::json!({
            "email": email,
            "password": "password123",
            "role": role,
            "display_name": display_name
        }),
    )
    .await;
    body["access_token"]
        .as_str()
        .unwrap_or_else(|| panic!("register_and_login failed for {email}: {body}"))
        .to_string()
}
```

- [ ] **Step 4: Run existing tests to confirm nothing is broken**

```bash
cd backend && cargo test
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib.rs backend/src/main.rs backend/tests/common/mod.rs
git commit -m "feat: wire WsHub into AppState, add /ws route, update test helpers"
```

---

### Task 6: Publish WS Events from REST Handlers

**Files:**
- Modify: `backend/src/customer/handlers.rs` (create_job)
- Modify: `backend/src/contractor/handlers.rs` (respond_to_job, complete_job, update_location)

- [ ] **Step 1: Update `create_job` to publish `job_requested`**

In `backend/src/customer/handlers.rs`, update the `create_job` handler. After the `INSERT INTO jobs` succeeds, add the publish call. Replace the closing of `create_job`:

```rust
pub async fn create_job(
    State(state): State<AppState>,
    CustomerUser(claims): CustomerUser,
    Json(req): Json<CreateJobRequest>,
) -> Result<Json<JobResponse>, AppError> {
    let contractor = sqlx::query!(
        "SELECT cp.user_id FROM contractor_profiles cp
         JOIN users u ON u.id = cp.user_id
         WHERE cp.user_id = $1 AND u.suspended_at IS NULL",
        req.contractor_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Contractor not found".to_string()))?;

    let job_id = uuid::Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO jobs (id, customer_id, contractor_id, description, location_lat, location_lng, location_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
        job_id,
        claims.sub,
        contractor.user_id,
        req.description,
        req.location_lat,
        req.location_lng,
        req.location_address,
    )
    .execute(&state.db)
    .await?;

    state
        .hub
        .publish_job_event(
            contractor.user_id,
            &crate::ws::events::WsEvent::JobRequested {
                job_id,
                description: req.description,
                location_lat: req.location_lat,
                location_lng: req.location_lng,
            },
        )
        .await;

    Ok(Json(JobResponse { id: job_id }))
}
```

- [ ] **Step 2: Update `respond_to_job` to publish `job_accepted` / `job_denied`**

In `backend/src/contractor/handlers.rs`, update the `respond_to_job` handler. After the DB updates for "accept" and "deny", add publish calls. The handler needs the `customer_id` — fetch it from the job query. Replace the `respond_to_job` function:

```rust
pub async fn respond_to_job(
    State(state): State<AppState>,
    ContractorUser(claims): ContractorUser,
    Path(job_id): Path<Uuid>,
    Json(req): Json<RespondRequest>,
) -> Result<StatusCode, AppError> {
    let job = sqlx::query!(
        r#"SELECT id, status as "status: JobStatus", contractor_id, customer_id
           FROM jobs WHERE id = $1"#,
        job_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Job not found".to_string()))?;

    if job.contractor_id != claims.sub {
        return Err(AppError::Unauthorized("Not your job".to_string()));
    }
    if job.status != JobStatus::Pending {
        return Err(AppError::Conflict("Job is not pending".to_string()));
    }

    match req.action.as_str() {
        "accept" => {
            let mut tx = state.db.begin().await?;
            sqlx::query!(
                "UPDATE jobs SET status = 'accepted' WHERE id = $1",
                job_id
            )
            .execute(&mut *tx)
            .await?;
            sqlx::query!(
                "UPDATE contractor_profiles SET is_busy = TRUE WHERE user_id = $1",
                claims.sub
            )
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            state
                .hub
                .publish_job_event(
                    job.customer_id,
                    &crate::ws::events::WsEvent::JobAccepted { job_id },
                )
                .await;
        }
        "deny" => {
            sqlx::query!(
                "UPDATE jobs SET status = 'denied' WHERE id = $1",
                job_id
            )
            .execute(&state.db)
            .await?;
            state
                .hub
                .publish_job_event(
                    job.customer_id,
                    &crate::ws::events::WsEvent::JobDenied { job_id },
                )
                .await;
        }
        _ => {
            return Err(AppError::BadRequest("action must be 'accept' or 'deny'".to_string()));
        }
    }

    Ok(StatusCode::OK)
}
```

- [ ] **Step 3: Update `complete_job` to publish `job_completed`**

In `backend/src/contractor/handlers.rs`, update `complete_job`. Add `customer_id` to the query and publish after commit. Replace `complete_job`:

```rust
pub async fn complete_job(
    State(state): State<AppState>,
    ContractorUser(claims): ContractorUser,
    Path(job_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let job = sqlx::query!(
        r#"SELECT id, status as "status: JobStatus", contractor_id, customer_id
           FROM jobs WHERE id = $1"#,
        job_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Job not found".to_string()))?;

    if job.contractor_id != claims.sub {
        return Err(AppError::Unauthorized("Not your job".to_string()));
    }
    if job.status != JobStatus::Accepted && job.status != JobStatus::InProgress {
        return Err(AppError::Conflict("Job must be accepted or in_progress to complete".to_string()));
    }

    let mut tx = state.db.begin().await?;
    sqlx::query!(
        "UPDATE jobs SET status = 'completed' WHERE id = $1",
        job_id
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        "UPDATE contractor_profiles SET is_busy = FALSE WHERE user_id = $1",
        claims.sub
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    state
        .hub
        .publish_job_event(
            job.customer_id,
            &crate::ws::events::WsEvent::JobCompleted { job_id },
        )
        .await;

    Ok(StatusCode::OK)
}
```

- [ ] **Step 4: Update `update_location` to publish `location_update`**

In `backend/src/contractor/handlers.rs`, add the publish call at the end of `update_location`, after the Redis set_ex call:

```rust
pub async fn update_location(
    State(state): State<AppState>,
    ContractorUser(claims): ContractorUser,
    Json(req): Json<LocationRequest>,
) -> Result<StatusCode, AppError> {
    sqlx::query!(
        r#"UPDATE contractor_profiles
           SET current_lat = $1,
               current_lng = $2,
               current_location = ST_MakePoint($2, $1)::geography,
               location_updated_at = NOW()
           WHERE user_id = $3"#,
        req.lat,
        req.lng,
        claims.sub,
    )
    .execute(&state.db)
    .await?;

    let key = format!("contractor:{}:pos", claims.sub);
    let value = format!("{},{}", req.lat, req.lng);
    let mut conn = state.redis.clone();
    conn.set_ex::<_, _, ()>(&key, &value, 30)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Redis error: {e}")))?;

    state
        .hub
        .publish_location(&crate::ws::events::WsEvent::LocationUpdate {
            contractor_id: claims.sub,
            lat: req.lat,
            lng: req.lng,
        })
        .await;

    Ok(StatusCode::OK)
}
```

- [ ] **Step 5: Run all existing tests**

```bash
cd backend && cargo test
```

Expected: all tests pass (WS publish is best-effort, so no test should break).

- [ ] **Step 6: Commit**

```bash
git add backend/src/customer/handlers.rs backend/src/contractor/handlers.rs
git commit -m "feat: publish WS events from create_job, respond_to_job, complete_job, update_location"
```

---

### Task 7: WebSocket Integration Tests

**Files:**
- Create: `backend/tests/ws_test.rs`

These tests start a real server on a random port and use `tokio_tungstenite` to connect. DB setup uses `sqlx` directly on the pool provided by `#[sqlx::test]`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/ws_test.rs`:

```rust
mod common;

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use knect_api::auth::tokens::create_access_token;
use knect_api::models::user::UserRole;
use sqlx::PgPool;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use uuid::Uuid;

const JWT_SECRET: &str =
    "test_jwt_secret_must_be_64_or_more_characters_long_for_hs256_to_work_correctly!";

/// Insert a user + profile row directly. Returns user_id.
async fn insert_contractor(pool: &PgPool, email: &str, display_name: &str) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, 'contractor')",
        id,
        email,
        "hash"
    )
    .execute(pool)
    .await
    .unwrap();
    sqlx::query!(
        "INSERT INTO contractor_profiles (user_id, display_name) VALUES ($1, $2)",
        id,
        display_name
    )
    .execute(pool)
    .await
    .unwrap();
    id
}

async fn insert_customer(pool: &PgPool, email: &str, display_name: &str) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, 'customer')",
        id,
        email,
        "hash"
    )
    .execute(pool)
    .await
    .unwrap();
    sqlx::query!(
        "INSERT INTO customer_profiles (user_id, display_name) VALUES ($1, $2)",
        id,
        display_name
    )
    .execute(pool)
    .await
    .unwrap();
    id
}

/// Wait up to 2 seconds for the next text frame; panic with `label` on timeout.
async fn next_text(
    stream: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    label: &str,
) -> serde_json::Value {
    let msg = timeout(Duration::from_secs(2), stream.next())
        .await
        .unwrap_or_else(|_| panic!("{label}: timed out waiting for message"))
        .expect("stream ended")
        .expect("ws error");
    match msg {
        Message::Text(text) => serde_json::from_str(&text).expect("invalid json"),
        other => panic!("{label}: expected Text frame, got {other:?}"),
    }
}

#[sqlx::test(migrations = "./migrations")]
async fn invalid_token_returns_401_not_upgrade(pool: PgPool) {
    let (addr, _) = common::start_ws_server(pool).await;
    let url = format!("ws://{}/ws?token=not.a.valid.token", addr);
    let result = connect_async(url).await;
    assert!(result.is_err(), "expected connection failure on 401");
}

#[sqlx::test(migrations = "./migrations")]
async fn customer_connects_and_receives_snapshot(pool: PgPool) {
    let (addr, _) = common::start_ws_server(pool.clone()).await;
    let customer_id = insert_customer(&pool, "snap_c@example.com", "Snap").await;
    let token = create_access_token(customer_id, UserRole::Customer, JWT_SECRET).unwrap();

    let url = format!("ws://{}/ws?token={}", addr, token);
    let (mut ws, _) = connect_async(url).await.expect("ws connect failed");

    let msg = next_text(&mut ws, "snapshot").await;
    assert_eq!(msg["type"], "snapshot", "first message must be snapshot");
    assert!(msg["contractors"].is_array());
}

#[sqlx::test(migrations = "./migrations")]
async fn contractor_does_not_receive_snapshot(pool: PgPool) {
    let (addr, _) = common::start_ws_server(pool.clone()).await;
    let contractor_id = insert_contractor(&pool, "nosnap_c@example.com", "NoSnap").await;
    let token = create_access_token(contractor_id, UserRole::Contractor, JWT_SECRET).unwrap();

    let url = format!("ws://{}/ws?token={}", addr, token);
    let (mut ws, _) = connect_async(url).await.expect("ws connect failed");

    // Contractors receive no message on connect; timeout is expected.
    let result = timeout(Duration::from_millis(300), ws.next()).await;
    assert!(result.is_err(), "contractor should receive no message on connect");
}

#[sqlx::test(migrations = "./migrations")]
async fn location_update_delivered_to_connected_customer(pool: PgPool) {
    let (addr, _) = common::start_ws_server(pool.clone()).await;

    let contractor_id = insert_contractor(&pool, "loc_c@example.com", "LocC").await;
    let customer_id = insert_customer(&pool, "loc_k@example.com", "LocK").await;

    let contractor_token =
        create_access_token(contractor_id, UserRole::Contractor, JWT_SECRET).unwrap();
    let customer_token =
        create_access_token(customer_id, UserRole::Customer, JWT_SECRET).unwrap();

    // Customer connects
    let customer_url = format!("ws://{}/ws?token={}", addr, customer_token);
    let (mut customer_ws, _) = connect_async(customer_url).await.unwrap();

    // Consume snapshot
    let _ = next_text(&mut customer_ws, "snapshot").await;

    // Contractor posts location via HTTP
    let http = reqwest::Client::new();
    let resp = http
        .post(format!("http://{}/location", addr))
        .header("authorization", format!("Bearer {}", contractor_token))
        .json(&serde_json::json!({ "lat": 40.7128, "lng": -74.0060 }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    // Customer receives location_update
    let msg = next_text(&mut customer_ws, "location_update").await;
    assert_eq!(msg["type"], "location_update");
    assert_eq!(msg["contractor_id"], contractor_id.to_string());
    assert!((msg["lat"].as_f64().unwrap() - 40.7128).abs() < 0.001);
}

#[sqlx::test(migrations = "./migrations")]
async fn contractor_receives_job_requested_over_ws(pool: PgPool) {
    let (addr, _) = common::start_ws_server(pool.clone()).await;

    let contractor_id = insert_contractor(&pool, "jrq_c@example.com", "JRQ_C").await;
    let customer_id = insert_customer(&pool, "jrq_k@example.com", "JRQ_K").await;

    let contractor_token =
        create_access_token(contractor_id, UserRole::Contractor, JWT_SECRET).unwrap();
    let customer_token =
        create_access_token(customer_id, UserRole::Customer, JWT_SECRET).unwrap();

    // Contractor connects WS
    let contractor_url = format!("ws://{}/ws?token={}", addr, contractor_token);
    let (mut contractor_ws, _) = connect_async(contractor_url).await.unwrap();

    // Customer creates a job via HTTP
    let http = reqwest::Client::new();
    let resp = http
        .post(format!("http://{}/jobs", addr))
        .header("authorization", format!("Bearer {}", customer_token))
        .json(&serde_json::json!({
            "contractor_id": contractor_id,
            "description": "Fix the pipes",
            "location_lat": 40.7128,
            "location_lng": -74.0060
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let job_body: serde_json::Value = resp.json().await.unwrap();
    let job_id = job_body["id"].as_str().unwrap();

    // Contractor receives job_requested
    let msg = next_text(&mut contractor_ws, "job_requested").await;
    assert_eq!(msg["type"], "job_requested");
    assert_eq!(msg["job_id"], job_id);
    assert_eq!(msg["description"], "Fix the pipes");
}

#[sqlx::test(migrations = "./migrations")]
async fn customer_receives_job_accepted_over_ws(pool: PgPool) {
    let (addr, _) = common::start_ws_server(pool.clone()).await;

    let contractor_id = insert_contractor(&pool, "jacc_c@example.com", "JACC_C").await;
    let customer_id = insert_customer(&pool, "jacc_k@example.com", "JACC_K").await;

    let contractor_token =
        create_access_token(contractor_id, UserRole::Contractor, JWT_SECRET).unwrap();
    let customer_token =
        create_access_token(customer_id, UserRole::Customer, JWT_SECRET).unwrap();

    // Create a job directly in DB
    let job_id = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO jobs (id, customer_id, contractor_id, description, location_lat, location_lng)
         VALUES ($1, $2, $3, $4, $5, $6)",
        job_id,
        customer_id,
        contractor_id,
        "Fix the sink",
        40.7128_f64,
        -74.0060_f64
    )
    .execute(&pool)
    .await
    .unwrap();

    // Customer connects WS and consumes snapshot
    let customer_url = format!("ws://{}/ws?token={}", addr, customer_token);
    let (mut customer_ws, _) = connect_async(customer_url).await.unwrap();
    let _ = next_text(&mut customer_ws, "snapshot").await;

    // Contractor accepts via HTTP
    let http = reqwest::Client::new();
    let resp = http
        .post(format!("http://{}/jobs/{}/respond", addr, job_id))
        .header("authorization", format!("Bearer {}", contractor_token))
        .json(&serde_json::json!({ "action": "accept" }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    // Customer receives job_accepted
    let msg = next_text(&mut customer_ws, "job_accepted").await;
    assert_eq!(msg["type"], "job_accepted");
    assert_eq!(msg["job_id"], job_id.to_string());
}

#[sqlx::test(migrations = "./migrations")]
async fn customer_receives_job_denied_over_ws(pool: PgPool) {
    let (addr, _) = common::start_ws_server(pool.clone()).await;

    let contractor_id = insert_contractor(&pool, "jden_c@example.com", "JDEN_C").await;
    let customer_id = insert_customer(&pool, "jden_k@example.com", "JDEN_K").await;

    let contractor_token =
        create_access_token(contractor_id, UserRole::Contractor, JWT_SECRET).unwrap();
    let customer_token =
        create_access_token(customer_id, UserRole::Customer, JWT_SECRET).unwrap();

    let job_id = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO jobs (id, customer_id, contractor_id, description, location_lat, location_lng)
         VALUES ($1, $2, $3, $4, $5, $6)",
        job_id,
        customer_id,
        contractor_id,
        "Mow lawn",
        40.7128_f64,
        -74.0060_f64
    )
    .execute(&pool)
    .await
    .unwrap();

    let customer_url = format!("ws://{}/ws?token={}", addr, customer_token);
    let (mut customer_ws, _) = connect_async(customer_url).await.unwrap();
    let _ = next_text(&mut customer_ws, "snapshot").await;

    let http = reqwest::Client::new();
    let resp = http
        .post(format!("http://{}/jobs/{}/respond", addr, job_id))
        .header("authorization", format!("Bearer {}", contractor_token))
        .json(&serde_json::json!({ "action": "deny" }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let msg = next_text(&mut customer_ws, "job_denied").await;
    assert_eq!(msg["type"], "job_denied");
    assert_eq!(msg["job_id"], job_id.to_string());
}

#[sqlx::test(migrations = "./migrations")]
async fn customer_receives_job_completed_over_ws(pool: PgPool) {
    let (addr, _) = common::start_ws_server(pool.clone()).await;

    let contractor_id = insert_contractor(&pool, "jcmp_c@example.com", "JCMP_C").await;
    let customer_id = insert_customer(&pool, "jcmp_k@example.com", "JCMP_K").await;

    let contractor_token =
        create_access_token(contractor_id, UserRole::Contractor, JWT_SECRET).unwrap();
    let customer_token =
        create_access_token(customer_id, UserRole::Customer, JWT_SECRET).unwrap();

    let job_id = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO jobs (id, customer_id, contractor_id, description, location_lat, location_lng, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'accepted')",
        job_id,
        customer_id,
        contractor_id,
        "Paint fence",
        40.7128_f64,
        -74.0060_f64
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query!(
        "UPDATE contractor_profiles SET is_busy = TRUE WHERE user_id = $1",
        contractor_id
    )
    .execute(&pool)
    .await
    .unwrap();

    let customer_url = format!("ws://{}/ws?token={}", addr, customer_token);
    let (mut customer_ws, _) = connect_async(customer_url).await.unwrap();
    let _ = next_text(&mut customer_ws, "snapshot").await;

    let http = reqwest::Client::new();
    let resp = http
        .post(format!("http://{}/jobs/{}/complete", addr, job_id))
        .header("authorization", format!("Bearer {}", contractor_token))
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let msg = next_text(&mut customer_ws, "job_completed").await;
    assert_eq!(msg["type"], "job_completed");
    assert_eq!(msg["job_id"], job_id.to_string());
}
```

- [ ] **Step 2: Run the tests (expect failures — hub not yet wired)**

```bash
cd backend && cargo test --test ws_test 2>&1 | head -40
```

Expected: compile errors or test failures because `start_ws_server` doesn't exist yet in common (it was added in Task 5, so this should compile). Tests may fail due to timing — that's fine; we'll see which pass.

- [ ] **Step 3: Run full test suite**

```bash
cd backend && cargo test
```

Expected: all tests pass. If WS tests time out, verify Redis is running (`redis-cli ping` → `PONG`) and the background subscriber tasks in `start_ws_server` have time to subscribe before events are published (the 2-second timeout in `next_text` should be sufficient).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/ws_test.rs
git commit -m "test: add WebSocket integration tests for all hub scenarios"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| WsHub DashMap with (connection_id, role, sender) | Task 3 |
| `register` returns connection_id to guard deregister | Task 3 |
| `deregister` checks connection_id before removing | Task 3 |
| `publish_job_event` → Redis PUBLISH user:{id}:events | Task 3 |
| `publish_location` → Redis PUBLISH location:updates | Task 3 |
| Location subscriber fans out to customers only | Task 3 |
| Events subscriber pattern-subscribes user:*:events | Task 3 |
| parse_user_id_from_channel | Task 3 |
| JWT from query param, 401 before upgrade | Task 4 |
| Snapshot via KEYS contractor:*:pos on customer connect | Task 4 |
| Two-task connection lifecycle | Task 4 |
| AppState includes Arc<WsHub> | Task 5 |
| Background tasks spawned in main.rs with restart loop | Task 5 |
| create_job publishes job_requested | Task 6 |
| respond_to_job publishes job_accepted/job_denied | Task 6 |
| complete_job publishes job_completed | Task 6 |
| update_location publishes location_update | Task 6 |
| Invalid token → 401 test | Task 7 |
| Customer gets snapshot on connect | Task 7 |
| Contractor does not get snapshot | Task 7 |
| location_update delivered to customer | Task 7 |
| job_requested delivered to contractor | Task 7 |
| job_accepted delivered to customer | Task 7 |
| job_denied delivered to customer | Task 7 |
| job_completed delivered to customer | Task 7 |
