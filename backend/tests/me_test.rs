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
