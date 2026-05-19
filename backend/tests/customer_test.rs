mod common;

use sqlx::PgPool;

/// Seeds a contractor with a known location and returns (app, contractor_token, customer_token)
async fn setup_located_contractor(pool: &PgPool, suffix: &str) -> (axum::Router, String, String) {
    let app = common::test_app(pool.clone()).await;

    let contractor_token = common::register_and_login(
        &app,
        &format!("nearby_c_{suffix}@example.com"),
        "contractor",
        &format!("Nearby_{suffix}"),
    )
    .await;

    let customer_token = common::register_and_login(
        &app,
        &format!("nearby_k_{suffix}@example.com"),
        "customer",
        &format!("Customer_{suffix}"),
    )
    .await;

    // Set contractor available
    common::post_json_auth(&app, "/contractor/availability", &contractor_token, serde_json::json!({ "available": true })).await;

    // Set location: New York City
    common::post_json_auth(&app, "/location", &contractor_token, serde_json::json!({
        "lat": 40.7128,
        "lng": -74.0060
    })).await;

    (app, contractor_token, customer_token)
}

#[sqlx::test(migrations = "./migrations")]
async fn customer_can_see_nearby_contractor(pool: PgPool) {
    let (app, _, customer_token) = setup_located_contractor(&pool, "a").await;

    let (status, body) = common::get_json(
        &app,
        "/contractors/nearby?lat=40.7128&lng=-74.0060&radius=10000",
        Some(&customer_token),
    )
    .await;

    assert_eq!(status, 200);
    let contractors = body.as_array().unwrap();
    assert!(!contractors.is_empty(), "expected at least one nearby contractor");
    assert_eq!(contractors[0]["display_name"], "Nearby_a");
    assert!(contractors[0]["distance_meters"].as_f64().unwrap() < 100.0);
}

#[sqlx::test(migrations = "./migrations")]
async fn contractor_outside_radius_not_returned(pool: PgPool) {
    let (app, _, customer_token) = setup_located_contractor(&pool, "b").await;

    // Search 1000km away in Los Angeles (contractor is in NYC)
    let (status, body) = common::get_json(
        &app,
        "/contractors/nearby?lat=34.0522&lng=-118.2437&radius=5000",
        Some(&customer_token),
    )
    .await;

    assert_eq!(status, 200);
    let contractors = body.as_array().unwrap();
    assert!(contractors.is_empty(), "contractor should be outside radius");
}

#[sqlx::test(migrations = "./migrations")]
async fn unauthenticated_user_cannot_browse_nearby(pool: PgPool) {
    let app = common::test_app(pool).await;
    let (status, body) = common::get_json(&app, "/contractors/nearby?lat=40.7&lng=-74.0&radius=5000", None).await;
    assert_eq!(status, 401);
    assert_eq!(body["error"], "unauthorized");
}

#[sqlx::test(migrations = "./migrations")]
async fn customer_can_view_public_contractor_profile(pool: PgPool) {
    let (app, contractor_token, customer_token) = setup_located_contractor(&pool, "c").await;

    let (_, profile) = common::get_json(&app, "/contractor/profile", Some(&contractor_token)).await;
    let contractor_id = profile["user_id"].as_str().unwrap();

    let (status, body) = common::get_json(
        &app,
        &format!("/contractors/{}", contractor_id),
        Some(&customer_token),
    )
    .await;

    assert_eq!(status, 200);
    assert_eq!(body["display_name"], "Nearby_c");
    assert!(body["ratings"].is_array());
}

#[sqlx::test(migrations = "./migrations")]
async fn customer_can_create_and_view_job(pool: PgPool) {
    let (app, contractor_token, customer_token) = setup_located_contractor(&pool, "d").await;

    let (_, profile) = common::get_json(&app, "/contractor/profile", Some(&contractor_token)).await;
    let contractor_id = profile["user_id"].as_str().unwrap();

    let (create_status, job_body) = common::post_json_auth(
        &app,
        "/jobs",
        &customer_token,
        serde_json::json!({
            "contractor_id": contractor_id,
            "description": "Replace faucet",
            "location_lat": 40.7128,
            "location_lng": -74.0060,
        }),
    )
    .await;
    assert_eq!(create_status, 200);
    let job_id = job_body["id"].as_str().unwrap();

    let (status, body) = common::get_json(
        &app,
        &format!("/jobs/{}", job_id),
        Some(&customer_token),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(body["status"], "pending");
    assert_eq!(body["description"], "Replace faucet");
    assert!(body["quote"].is_null());
}

#[sqlx::test(migrations = "./migrations")]
async fn contractor_can_view_their_job(pool: PgPool) {
    let (app, contractor_token, customer_token) = setup_located_contractor(&pool, "e").await;

    let (_, profile) = common::get_json(&app, "/contractor/profile", Some(&contractor_token)).await;
    let contractor_id = profile["user_id"].as_str().unwrap();

    let (_, job_body) = common::post_json_auth(
        &app,
        "/jobs",
        &customer_token,
        serde_json::json!({
            "contractor_id": contractor_id,
            "description": "Fix roof",
            "location_lat": 40.7128,
            "location_lng": -74.0060,
        }),
    )
    .await;
    let job_id = job_body["id"].as_str().unwrap();

    let (status, body) = common::get_json(&app, &format!("/jobs/{}", job_id), Some(&contractor_token)).await;
    assert_eq!(status, 200);
    assert_eq!(body["description"], "Fix roof");
}

#[sqlx::test(migrations = "./migrations")]
async fn customer_can_cancel_pending_job(pool: PgPool) {
    let (app, contractor_token, customer_token) = setup_located_contractor(&pool, "f").await;

    let (_, profile) = common::get_json(&app, "/contractor/profile", Some(&contractor_token)).await;
    let contractor_id = profile["user_id"].as_str().unwrap();

    let (_, job_body) = common::post_json_auth(
        &app,
        "/jobs",
        &customer_token,
        serde_json::json!({
            "contractor_id": contractor_id,
            "description": "Trim hedge",
            "location_lat": 40.7128,
            "location_lng": -74.0060,
        }),
    )
    .await;
    let job_id = job_body["id"].as_str().unwrap();

    let (status, _) = common::delete_req(&app, &format!("/jobs/{}", job_id), &customer_token).await;
    assert_eq!(status, 200);
}

#[sqlx::test(migrations = "./migrations")]
async fn customer_cannot_cancel_accepted_job(pool: PgPool) {
    let (app, contractor_token, customer_token) = setup_located_contractor(&pool, "g").await;

    let (_, profile) = common::get_json(&app, "/contractor/profile", Some(&contractor_token)).await;
    let contractor_id = profile["user_id"].as_str().unwrap();

    let (_, job_body) = common::post_json_auth(
        &app,
        "/jobs",
        &customer_token,
        serde_json::json!({
            "contractor_id": contractor_id,
            "description": "Mow lawn",
            "location_lat": 40.7128,
            "location_lng": -74.0060,
        }),
    )
    .await;
    let job_id = job_body["id"].as_str().unwrap();

    common::post_json_auth(&app, &format!("/jobs/{}/respond", job_id), &contractor_token, serde_json::json!({ "action": "accept" })).await;

    let (status, body) = common::delete_req(&app, &format!("/jobs/{}", job_id), &customer_token).await;
    assert_eq!(status, 409);
    assert_eq!(body["error"], "conflict");
}

/// Full job lifecycle helper: create job → accept → complete → return job_id
async fn setup_completed_job(pool: &PgPool, suffix: &str) -> (axum::Router, String, String, String) {
    let (app, contractor_token, customer_token) = setup_located_contractor(pool, suffix).await;

    let (_, profile) = common::get_json(&app, "/contractor/profile", Some(&contractor_token)).await;
    let contractor_id = profile["user_id"].as_str().unwrap().to_string();

    let (_, job_body) = common::post_json_auth(
        &app,
        "/jobs",
        &customer_token,
        serde_json::json!({
            "contractor_id": contractor_id,
            "description": "Paint fence",
            "location_lat": 40.7128,
            "location_lng": -74.0060,
        }),
    )
    .await;
    let job_id = job_body["id"].as_str().unwrap().to_string();

    common::post_json_auth(&app, &format!("/jobs/{}/respond", job_id), &contractor_token, serde_json::json!({ "action": "accept" })).await;
    common::post_json_auth(&app, &format!("/jobs/{}/complete", job_id), &contractor_token, serde_json::json!({})).await;

    (app, contractor_token, customer_token, job_id)
}

#[sqlx::test(migrations = "./migrations")]
async fn customer_can_rate_completed_job(pool: PgPool) {
    let (app, _, customer_token, job_id) = setup_completed_job(&pool, "h").await;

    let (status, _) = common::post_json_auth(
        &app,
        &format!("/jobs/{}/rating", job_id),
        &customer_token,
        serde_json::json!({ "score": 5, "review_text": "Excellent work!" }),
    )
    .await;
    assert_eq!(status, 200);
}

#[sqlx::test(migrations = "./migrations")]
async fn rating_updates_contractor_avg(pool: PgPool) {
    let (app, contractor_token, customer_token, job_id) = setup_completed_job(&pool, "i").await;

    let (_, before) = common::get_json(&app, "/contractor/profile", Some(&contractor_token)).await;
    assert_eq!(before["rating_count"], 0);

    common::post_json_auth(
        &app,
        &format!("/jobs/{}/rating", job_id),
        &customer_token,
        serde_json::json!({ "score": 4 }),
    )
    .await;

    let (_, after) = common::get_json(&app, "/contractor/profile", Some(&contractor_token)).await;
    assert_eq!(after["rating_count"], 1);
    assert_eq!(after["avg_rating"], 4.0);
}

#[sqlx::test(migrations = "./migrations")]
async fn customer_cannot_rate_pending_job(pool: PgPool) {
    let (app, contractor_token, customer_token) = setup_located_contractor(&pool, "j").await;

    let (_, profile) = common::get_json(&app, "/contractor/profile", Some(&contractor_token)).await;
    let contractor_id = profile["user_id"].as_str().unwrap();

    let (_, job_body) = common::post_json_auth(
        &app,
        "/jobs",
        &customer_token,
        serde_json::json!({
            "contractor_id": contractor_id,
            "description": "Plant tree",
            "location_lat": 40.7128,
            "location_lng": -74.0060,
        }),
    )
    .await;
    let job_id = job_body["id"].as_str().unwrap();

    let (status, body) = common::post_json_auth(
        &app,
        &format!("/jobs/{}/rating", job_id),
        &customer_token,
        serde_json::json!({ "score": 5 }),
    )
    .await;
    assert_eq!(status, 409);
    assert_eq!(body["error"], "conflict");
}

#[sqlx::test(migrations = "./migrations")]
async fn customer_cannot_rate_same_job_twice(pool: PgPool) {
    let (app, _, customer_token, job_id) = setup_completed_job(&pool, "k").await;

    common::post_json_auth(&app, &format!("/jobs/{}/rating", job_id), &customer_token, serde_json::json!({ "score": 5 })).await;

    let (status, body) = common::post_json_auth(
        &app,
        &format!("/jobs/{}/rating", job_id),
        &customer_token,
        serde_json::json!({ "score": 3 }),
    )
    .await;
    assert_eq!(status, 409);
    assert_eq!(body["error"], "conflict");
}
