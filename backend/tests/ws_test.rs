mod common;

use std::time::Duration;

use futures_util::StreamExt;
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

/// Wait up to 5 seconds for the next text frame; panic with `label` on timeout.
async fn next_text(
    stream: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    label: &str,
) -> serde_json::Value {
    let msg = timeout(Duration::from_secs(5), stream.next())
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
    let result = timeout(Duration::from_millis(500), ws.next()).await;
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
    let snap = next_text(&mut customer_ws, "snapshot").await;
    assert_eq!(snap["type"], "snapshot");

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
    let snap = next_text(&mut customer_ws, "snapshot").await;
    assert_eq!(snap["type"], "snapshot");

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
    let snap = next_text(&mut customer_ws, "snapshot").await;
    assert_eq!(snap["type"], "snapshot");

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
    let snap = next_text(&mut customer_ws, "snapshot").await;
    assert_eq!(snap["type"], "snapshot");

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
