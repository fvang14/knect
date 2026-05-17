use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::middleware::{AuthUser, CustomerUser},
    error::AppError,
    AppState,
};

// ─── Create Job ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateJobRequest {
    pub contractor_id: Uuid,
    pub description: String,
    pub location_lat: f64,
    pub location_lng: f64,
    pub location_address: Option<String>,
}

#[derive(Serialize)]
pub struct JobResponse {
    pub id: Uuid,
}

pub async fn create_job(
    State(state): State<AppState>,
    CustomerUser(claims): CustomerUser,
    Json(req): Json<CreateJobRequest>,
) -> Result<Json<JobResponse>, AppError> {
    let contractor = sqlx::query!(
        "SELECT cp.user_id FROM contractor_profiles cp
         JOIN users u ON u.id = cp.user_id
         WHERE cp.user_id = $1 AND u.suspended_at IS NULL",
        req.contractor_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Contractor not found".to_string()))?;

    let job_id = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO jobs (id, customer_id, contractor_id, description, location_lat, location_lng, location_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
        job_id,
        claims.sub,
        contractor.user_id,
        req.description,
        req.location_lat,
        req.location_lng,
        req.location_address,
    )
    .execute(&state.db)
    .await?;

    Ok(Json(JobResponse { id: job_id }))
}

// ─── Stubs for later tasks ────────────────────────────────────────────────

pub async fn nearby_contractors() -> StatusCode { todo!() }
pub async fn contractor_profile() -> StatusCode { todo!() }
pub async fn get_job() -> StatusCode { todo!() }
pub async fn cancel_job() -> StatusCode { todo!() }
pub async fn submit_rating() -> StatusCode { todo!() }
