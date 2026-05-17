mod common;

use sqlx::PgPool;

#[sqlx::test(migrations = "./migrations")]
async fn contractor_can_get_own_profile(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "alice@example.com", "contractor", "Alice Builder").await;

    let (status, body) = common::get_json(&app, "/contractor/profile", Some(&token)).await;

    assert_eq!(status, 200);
    assert_eq!(body["display_name"], "Alice Builder");
    assert_eq!(body["is_available"], false);
    assert_eq!(body["is_busy"], false);
    assert!(body["trade_categories"].is_array());
}

#[sqlx::test(migrations = "./migrations")]
async fn customer_cannot_access_contractor_profile_endpoint(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "bob@example.com", "customer", "Bob").await;

    let (status, body) = common::get_json(&app, "/contractor/profile", Some(&token)).await;

    assert_eq!(status, 401);
    assert_eq!(body["error"], "unauthorized");
}

#[sqlx::test(migrations = "./migrations")]
async fn contractor_can_update_profile(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "carol@example.com", "contractor", "Carol").await;

    let (status, _) = common::put_json(
        &app,
        "/contractor/profile",
        &token,
        serde_json::json!({
            "bio": "Expert plumber",
            "base_rate": 75.0,
            "base_rate_unit": "per_hour"
        }),
    )
    .await;
    assert_eq!(status, 200);

    let (_, body) = common::get_json(&app, "/contractor/profile", Some(&token)).await;
    assert_eq!(body["bio"], "Expert plumber");
    assert_eq!(body["base_rate"], 75.0);
    assert_eq!(body["base_rate_unit"], "per_hour");
}

#[sqlx::test(migrations = "./migrations")]
async fn contractor_can_update_trade_categories(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "dave@example.com", "contractor", "Dave").await;

    let (_, profile_before) = common::get_json(&app, "/contractor/profile", Some(&token)).await;
    assert_eq!(profile_before["trade_categories"].as_array().unwrap().len(), 0);

    let (status, _) = common::put_json(
        &app,
        "/contractor/profile",
        &token,
        serde_json::json!({ "category_ids": [] }),
    )
    .await;
    assert_eq!(status, 200);
}
