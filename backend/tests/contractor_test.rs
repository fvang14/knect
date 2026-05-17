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

#[sqlx::test(migrations = "./migrations")]
async fn contractor_can_toggle_availability_on(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "avail@example.com", "contractor", "Avail").await;

    let (status, _) = common::post_json_auth(
        &app,
        "/contractor/availability",
        &token,
        serde_json::json!({ "available": true }),
    )
    .await;
    assert_eq!(status, 200);

    let (_, body) = common::get_json(&app, "/contractor/profile", Some(&token)).await;
    assert_eq!(body["is_available"], true);
}

#[sqlx::test(migrations = "./migrations")]
async fn contractor_can_toggle_availability_off(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "avail2@example.com", "contractor", "Avail2").await;

    common::post_json_auth(&app, "/contractor/availability", &token, serde_json::json!({ "available": true })).await;
    let (status, _) = common::post_json_auth(&app, "/contractor/availability", &token, serde_json::json!({ "available": false })).await;
    assert_eq!(status, 200);

    let (_, body) = common::get_json(&app, "/contractor/profile", Some(&token)).await;
    assert_eq!(body["is_available"], false);
}

#[sqlx::test(migrations = "./migrations")]
async fn contractor_can_update_location(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "loc@example.com", "contractor", "LocUser").await;

    let (status, _) = common::post_json_auth(
        &app,
        "/location",
        &token,
        serde_json::json!({ "lat": 40.7128, "lng": -74.0060 }),
    )
    .await;
    assert_eq!(status, 200);

    let (_, body) = common::get_json(&app, "/contractor/profile", Some(&token)).await;
    let lat = body["current_lat"].as_f64().unwrap();
    let lng = body["current_lng"].as_f64().unwrap();
    assert!((lat - 40.7128).abs() < 0.0001);
    assert!((lng - (-74.0060)).abs() < 0.0001);
}

#[sqlx::test(migrations = "./migrations")]
async fn customer_cannot_post_location(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "cust_loc@example.com", "customer", "Cust").await;

    let (status, body) = common::post_json_auth(
        &app,
        "/location",
        &token,
        serde_json::json!({ "lat": 40.0, "lng": -74.0 }),
    )
    .await;
    assert_eq!(status, 401);
    assert_eq!(body["error"], "unauthorized");
}

#[sqlx::test(migrations = "./migrations")]
async fn contractor_job_queue_is_empty_initially(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "queue_c@example.com", "contractor", "QueueC").await;

    let (status, body) = common::get_json(&app, "/contractor/jobs", Some(&token)).await;

    assert_eq!(status, 200);
    assert!(body.as_array().unwrap().is_empty());
}

#[sqlx::test(migrations = "./migrations")]
async fn contractor_sees_pending_job_in_queue(pool: PgPool) {
    let app = common::test_app(pool).await;
    let contractor_token = common::register_and_login(&app, "cjq_contractor@example.com", "contractor", "ContractorQ").await;
    let customer_token = common::register_and_login(&app, "cjq_customer@example.com", "customer", "CustomerQ").await;

    let (_, profile) = common::get_json(&app, "/contractor/profile", Some(&contractor_token)).await;
    let contractor_id = profile["user_id"].as_str().unwrap();

    let (job_status, job_body) = common::post_json_auth(
        &app,
        "/jobs",
        &customer_token,
        serde_json::json!({
            "contractor_id": contractor_id,
            "description": "Fix the sink",
            "location_lat": 40.7128,
            "location_lng": -74.0060
        }),
    )
    .await;
    assert_eq!(job_status, 200, "job creation failed: {:?}", job_body);

    let (status, body) = common::get_json(&app, "/contractor/jobs", Some(&contractor_token)).await;
    assert_eq!(status, 200);
    let jobs = body.as_array().unwrap();
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0]["status"], "pending");
    assert_eq!(jobs[0]["description"], "Fix the sink");
}
