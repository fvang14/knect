# Knect WebSocket Hub — Design Specification
**Date:** 2026-05-17
**Status:** Approved

## Overview

Add a WebSocket hub to the Knect Rust/Axum backend to enable real-time location broadcasting and job event delivery. All clients connect to a single endpoint and receive typed JSON messages routed by user role and identity.

---

## Module Structure

```
src/ws/
  mod.rs     — WsHub struct, DashMap registry, background Redis subscriber tasks
  handler.rs — Axum WS upgrade handler, connection lifecycle
  events.rs  — WsEvent enum (serializable message types)
```

`WsHub` is added to `AppState` wrapped in `Arc<WsHub>`. Two long-running Tokio background tasks are spawned at server startup — one per Redis channel type.

---

## Message Types

All WebSocket messages are JSON with a `type` discriminant. `WsEvent` uses `#[serde(tag = "type", rename_all = "snake_case")]`.

**Server → client messages:**

```json
{ "type": "snapshot",      "contractors": [{ "contractor_id": "uuid", "lat": 0.0, "lng": 0.0 }] }
{ "type": "location_update", "contractor_id": "uuid", "lat": 0.0, "lng": 0.0 }
{ "type": "job_requested", "job_id": "uuid", "description": "...", "location_lat": 0.0, "location_lng": 0.0 }
{ "type": "job_accepted",  "job_id": "uuid" }
{ "type": "job_denied",    "job_id": "uuid" }
{ "type": "job_completed", "job_id": "uuid" }
```

**Who receives what:**
- **Customers:** `snapshot` on connect, then `location_update` as contractors move, plus `job_accepted` / `job_denied` / `job_completed` for their own jobs
- **Contractors:** `job_requested` when a customer sends them a job

---

## Redis Channel Schema

| Channel | Publisher | Subscriber |
|---|---|---|
| `location:updates` | `POST /location` handler | Hub location task — fans out to all customer senders |
| `user:{uuid}:events` | Job REST handlers (respond, complete, create) | Hub events task via pattern subscribe `user:*:events` — routes to specific user sender |

**Snapshot key discovery:** On connect, the hub uses Redis `KEYS contractor:*:pos` to discover live contractor positions. Only keys that still exist (i.e., within their 30s TTL) are included. No separate tracking Set is needed — stale entries naturally disappear when the TTL expires.

---

## Hub Architecture

```rust
pub struct WsHub {
    // user_id → (connection_id, role, sender)
    connections: DashMap<Uuid, (Uuid, UserRole, mpsc::Sender<WsEvent>)>,
    redis: redis::aio::ConnectionManager,
}
```

**DashMap value stores `(connection_id, UserRole, Sender)`** so the hub can filter location updates by role server-side and handle duplicate-connect cleanup correctly (see Connection Lifecycle).

**Background tasks (spawned at startup):**

1. **Location subscriber** — subscribes to `location:updates`, deserializes into `WsEvent::LocationUpdate`, fans out to all senders where `role == customer`.

2. **Events subscriber** — pattern subscribes to `user:*:events`, parses UUID from channel name, looks up sender in DashMap, delivers to that specific connection only.

**Hub methods:**
- `hub.register(user_id, role) -> (Uuid, mpsc::Receiver<WsEvent>)` — inserts sender, returns `(connection_id, receiver)`
- `hub.deregister(user_id, connection_id)` — removes entry only if stored `connection_id` matches; prevents a late-disconnecting old connection from evicting a newer one
- `hub.publish_job_event(user_id, event)` — calls Redis `PUBLISH user:{id}:events <json>`
- `hub.publish_location(event)` — calls Redis `PUBLISH location:updates <json>`

---

## Connection Lifecycle

**Connect:**
1. Client upgrades at `GET /ws?token=<jwt>`
2. JWT validated from query param before handshake completes — invalid token returns HTTP 401
3. `hub.register(user_id, role)` called — returns `(connection_id, receiver)`; if user was already connected, the old sender is replaced and the old connection drains and closes naturally
4. If role is `customer`: run Redis `KEYS contractor:*:pos`, read each key, send `WsEvent::Snapshot`
5. Two tasks spawned: receiver task (mpsc receiver → WS socket), reader task (WS socket → ping/pong, close detection)

**Disconnect:**
1. Either task exits (client close, network drop, send error)
2. `hub.deregister(user_id, connection_id)` called — only removes the entry if `connection_id` still matches; a concurrent re-connect that already replaced the entry is left untouched
3. Dropped sender causes in-flight hub deliveries to silently fail (no panic)

---

## Integration with REST Handlers

REST handlers that change job state receive `Arc<WsHub>` from `AppState` and call `hub.publish_job_event(...)` after the DB write succeeds:

| Handler | Publishes to |
|---|---|
| `POST /jobs` (create) | `user:{contractor_id}:events` → `job_requested` |
| `POST /jobs/:id/respond` accept | `user:{customer_id}:events` → `job_accepted` |
| `POST /jobs/:id/respond` deny | `user:{customer_id}:events` → `job_denied` |
| `POST /jobs/:id/complete` | `user:{customer_id}:events` → `job_completed` |
| `POST /location` | `location:updates` → `location_update` |

WS publish is best-effort: if Redis publish fails, log the error and continue — the REST operation has already committed.

---

## Error Handling

| Scenario | Handling |
|---|---|
| Invalid/missing JWT on WS upgrade | HTTP 401 before handshake — no WS connection opened |
| Redis publish fails in REST handler | Log error, return 200 — REST op succeeded, WS is best-effort |
| mpsc channel full or closed | Silently drop — client is gone or lagging, will reconnect |
| Redis subscriber task crashes | Loop with short backoff restarts the subscriber — connected clients miss events during gap, recover on reconnect |
| Contractor pos key missing at snapshot (expired TTL) | Key is not returned by KEYS scan — contractor simply omitted from snapshot, appears on first `location_update` |

---

## Testing

Tests live in `tests/ws_test.rs` using Axum's built-in WebSocket test client and the existing `common::test_app` helper.

**Test cases:**
- Customer connects with valid token → receives `snapshot` response
- Customer connects with invalid token → HTTP 401, no WS upgrade
- Contractor POSTs location → connected customer receives `location_update`
- Customer creates job → contractor receives `job_requested` over WS
- Contractor accepts job → customer receives `job_accepted` over WS
- Contractor denies job → customer receives `job_denied` over WS
- Contractor completes job → customer receives `job_completed` over WS
- Contractor connects → does NOT receive location updates (role-filtered)
- Second connect from same user replaces old connection

---

## Dependencies

No new crates required. Axum 0.7 includes `axum::extract::ws`. DashMap needs to be added to `Cargo.toml`:

```toml
dashmap = "5"
```

Redis pattern subscribe uses the existing `redis` crate with `tokio-comp` feature already enabled.
