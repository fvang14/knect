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
