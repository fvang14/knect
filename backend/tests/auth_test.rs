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
