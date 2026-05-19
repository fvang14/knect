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
