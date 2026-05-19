mod common;

use sqlx::PgPool;
use uuid::Uuid;

/// Create an admin user directly in the DB and return a JWT for them.
async fn create_admin_token(pool: &PgPool) -> String {
    let admin_id = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, 'admin')",
        admin_id,
        format!("admin_{}@example.com", admin_id),
        "$argon2id$v=19$m=19456,t=2,p=1$fake_hash_for_tests_only"
    )
    .execute(pool)
    .await
    .unwrap();

    knect_api::auth::tokens::create_access_token(
        admin_id,
        knect_api::models::user::UserRole::Admin,
        "test_jwt_secret_must_be_64_or_more_characters_long_for_hs256_to_work_correctly!",
    )
    .unwrap()
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_can_list_users(pool: PgPool) {
    let app = common::test_app(pool.clone()).await;
    let admin_token = create_admin_token(&pool).await;

    common::register_and_login(&app, "u1@example.com", "contractor", "U1").await;
    common::register_and_login(&app, "u2@example.com", "customer", "U2").await;

    let (status, body) = common::get_json(&app, "/admin/users", Some(&admin_token)).await;
    assert_eq!(status, 200);
    let users = body.as_array().unwrap();
    // admin + u1 + u2
    assert!(users.len() >= 3);
}

#[sqlx::test(migrations = "./migrations")]
async fn non_admin_cannot_access_admin_endpoints(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "nonadmin@example.com", "customer", "NonAdmin").await;

    let (status, body) = common::get_json(&app, "/admin/users", Some(&token)).await;
    assert_eq!(status, 401);
    assert_eq!(body["error"], "unauthorized");
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_can_suspend_user(pool: PgPool) {
    let app = common::test_app(pool.clone()).await;
    let admin_token = create_admin_token(&pool).await;

    common::register_and_login(&app, "tosuspend@example.com", "customer", "ToSuspend").await;

    let (_, users_body) = common::get_json(&app, "/admin/users", Some(&admin_token)).await;
    let user_id = users_body
        .as_array()
        .unwrap()
        .iter()
        .find(|u| u["email"] == "tosuspend@example.com")
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();

    let (status, _) = common::put_json(
        &app,
        &format!("/admin/users/{}/suspend", user_id),
        &admin_token,
        serde_json::json!({}),
    )
    .await;
    assert_eq!(status, 200);

    let (login_status, login_body) = common::post_json(
        &app,
        "/auth/login",
        serde_json::json!({ "email": "tosuspend@example.com", "password": "password123" }),
    )
    .await;
    assert_eq!(login_status, 401);
    assert_eq!(login_body["error"], "unauthorized");
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_can_list_jobs(pool: PgPool) {
    let app = common::test_app(pool.clone()).await;
    let admin_token = create_admin_token(&pool).await;

    let (status, body) = common::get_json(&app, "/admin/jobs", Some(&admin_token)).await;
    assert_eq!(status, 200);
    assert!(body.as_array().is_some());
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_can_get_metrics(pool: PgPool) {
    let app = common::test_app(pool.clone()).await;
    let admin_token = create_admin_token(&pool).await;

    let (status, body) = common::get_json(&app, "/admin/metrics", Some(&admin_token)).await;
    assert_eq!(status, 200);
    assert!(body["active_contractors"].is_number());
    assert!(body["jobs_today"].is_number());
    assert!(body["avg_rating"].is_number());
}
