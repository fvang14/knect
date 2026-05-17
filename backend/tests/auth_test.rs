mod common;

#[sqlx::test(migrations = "./migrations")]
async fn register_contractor_returns_tokens(pool: sqlx::PgPool) {
    let app = common::test_app(pool).await;

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
    let app = common::test_app(pool).await;

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
    let app = common::test_app(pool).await;
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
    let app = common::test_app(pool).await;

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

#[sqlx::test(migrations = "./migrations")]
async fn login_with_correct_credentials_returns_tokens(pool: sqlx::PgPool) {
    let app = common::test_app(pool).await;

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
    let app = common::test_app(pool).await;

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
    let app = common::test_app(pool).await;

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
    let app = common::test_app(pool.clone()).await;

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

#[sqlx::test(migrations = "./migrations")]
async fn request_without_token_to_protected_route_returns_401(pool: sqlx::PgPool) {
    let app = common::test_app(pool).await;
    // /auth/me is a simple protected route we'll add to verify the middleware
    let (status, body) = common::get_json(&app, "/auth/me", None).await;
    assert_eq!(status, 401);
    assert_eq!(body["error"], "unauthorized");
}

#[sqlx::test(migrations = "./migrations")]
async fn request_with_valid_token_to_protected_route_returns_200(pool: sqlx::PgPool) {
    let app = common::test_app(pool).await;

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

#[sqlx::test(migrations = "./migrations")]
async fn refresh_with_valid_token_returns_new_tokens(pool: sqlx::PgPool) {
    let app = common::test_app(pool).await;

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
}

#[sqlx::test(migrations = "./migrations")]
async fn refresh_with_invalid_token_returns_401(pool: sqlx::PgPool) {
    let app = common::test_app(pool).await;

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
    let app = common::test_app(pool.clone()).await;

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
