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

const PNG_1X1: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
];

#[sqlx::test(migrations = "./migrations")]
async fn avatar_upload_round_trip(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "a@example.com", "customer", "Ava").await;

    let (status, _) = common::post_multipart(
        &app,
        "/me/avatar",
        &token,
        "image/png",
        "tiny.png",
        PNG_1X1,
    )
    .await;
    assert_eq!(status, 200);

    let (me_status, me_body) = common::get_json(&app, "/me", Some(&token)).await;
    assert_eq!(me_status, 200);
    assert_eq!(me_body["has_avatar"], true);

    let user_id = me_body["id"].as_str().unwrap();
    let (avatar_status, _, ct, bytes) =
        common::get_bytes(&app, &format!("/users/{}/avatar", user_id)).await;
    assert_eq!(avatar_status, 200);
    assert_eq!(ct, "image/png");
    assert_eq!(bytes, PNG_1X1);
}

#[sqlx::test(migrations = "./migrations")]
async fn avatar_upload_rejects_oversize(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "big@example.com", "customer", "Big").await;

    let big = vec![0u8; 2 * 1024 * 1024 + 1]; // 2MB + 1 byte
    let (status, _) = common::post_multipart(&app, "/me/avatar", &token, "image/png", "big.png", &big).await;
    assert_eq!(status, 413);
}

#[sqlx::test(migrations = "./migrations")]
async fn avatar_upload_rejects_bad_content_type(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "bad@example.com", "customer", "Bad").await;

    let (status, _) =
        common::post_multipart(&app, "/me/avatar", &token, "application/pdf", "x.pdf", PNG_1X1).await;
    assert_eq!(status, 415);
}

#[sqlx::test(migrations = "./migrations")]
async fn avatar_delete_removes_row(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "d@example.com", "customer", "Del").await;

    common::post_multipart(&app, "/me/avatar", &token, "image/png", "x.png", PNG_1X1).await;
    let (status, _) = common::delete_req(&app, "/me/avatar", &token).await;
    assert_eq!(status, 200);

    let (_, body) = common::get_json(&app, "/me", Some(&token)).await;
    assert_eq!(body["has_avatar"], false);
}

#[sqlx::test(migrations = "./migrations")]
async fn avatar_public_read_404_when_missing(pool: PgPool) {
    let app = common::test_app(pool).await;
    let token = common::register_and_login(&app, "n@example.com", "customer", "None").await;
    let (_, body) = common::get_json(&app, "/me", Some(&token)).await;
    let user_id = body["id"].as_str().unwrap();

    let (status, _, _, _) =
        common::get_bytes(&app, &format!("/users/{}/avatar", user_id)).await;
    assert_eq!(status, 404);
}

#[sqlx::test(migrations = "./migrations")]
async fn delete_me_success_no_jobs(pool: PgPool) {
    let app = common::test_app(pool.clone()).await;
    let token = common::register_and_login(&app, "del1@example.com", "customer", "Del One").await;

    // Verify user exists
    let user_id: uuid::Uuid = sqlx::query_scalar!("SELECT id FROM users WHERE email = 'del1@example.com'")
        .fetch_one(&pool)
        .await
        .unwrap();

    // Call DELETE /me
    let (status, _) = common::delete_req(&app, "/me", &token).await;
    assert_eq!(status, 200);

    // Verify user is gone from users table
    let exists = sqlx::query_scalar!("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)", user_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(exists, Some(false));
}

#[sqlx::test(migrations = "./migrations")]
async fn delete_me_fails_with_active_jobs(pool: PgPool) {
    let app = common::test_app(pool.clone()).await;
    let customer_token = common::register_and_login(&app, "cust@example.com", "customer", "Customer").await;
    let contractor_token = common::register_and_login(&app, "cont@example.com", "contractor", "Contractor").await;

    let customer_id = sqlx::query_scalar!("SELECT id FROM users WHERE email = 'cust@example.com'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let contractor_id = sqlx::query_scalar!("SELECT id FROM users WHERE email = 'cont@example.com'")
        .fetch_one(&pool)
        .await
        .unwrap();

    // Create a pending job
    let job_id = uuid::Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO jobs (id, customer_id, contractor_id, description, location_lat, location_lng, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending'::job_status)",
        job_id,
        customer_id,
        contractor_id,
        "Fix the sink",
        40.7128,
        -74.0060
    )
    .execute(&pool)
    .await
    .unwrap();

    // Deleting customer should fail with 409
    let (c_status, _) = common::delete_req(&app, "/me", &customer_token).await;
    assert_eq!(c_status, 409);

    // Deleting contractor should fail with 409
    let (con_status, _) = common::delete_req(&app, "/me", &contractor_token).await;
    assert_eq!(con_status, 409);

    // Update job status to 'completed'
    sqlx::query!("UPDATE jobs SET status = 'completed' WHERE id = $1", job_id)
        .execute(&pool)
        .await
        .unwrap();

    // Deleting customer should now succeed
    let (c_status2, _) = common::delete_req(&app, "/me", &customer_token).await;
    assert_eq!(c_status2, 200);

    // Verify customer is gone
    let c_exists = sqlx::query_scalar!("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)", customer_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(c_exists, Some(false));
}
