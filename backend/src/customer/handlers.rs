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
    models::contractor::RateUnit,
    ws::events::WsEvent,
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

    state.hub.publish_job_event(
        contractor.user_id,
        &WsEvent::JobRequested {
            job_id,
            description: req.description,
            location_lat: req.location_lat,
            location_lng: req.location_lng,
        },
    ).await;

    Ok(Json(JobResponse { id: job_id }))
}

// ─── Browse ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct NearbyQuery {
    pub lat: f64,
    pub lng: f64,
    pub radius: Option<f64>,
}

#[derive(Serialize)]
pub struct NearbyContractor {
    pub user_id: Uuid,
    pub display_name: String,
    pub bio: Option<String>,
    pub base_rate: Option<f64>,
    pub base_rate_unit: Option<RateUnit>,
    pub is_busy: bool,
    pub avg_rating: f64,
    pub rating_count: i32,
    pub current_lat: Option<f64>,
    pub current_lng: Option<f64>,
    pub distance_meters: f64,
}

pub async fn nearby_contractors(
    State(state): State<AppState>,
    CustomerUser(_claims): CustomerUser,
    Query(q): Query<NearbyQuery>,
) -> Result<Json<Vec<NearbyContractor>>, AppError> {
    let radius = q.radius.unwrap_or(5000.0);

    let rows = sqlx::query!(
        r#"SELECT
               user_id, display_name, bio, base_rate,
               base_rate_unit as "base_rate_unit: RateUnit",
               is_busy, current_lat, current_lng,
               avg_rating, rating_count,
               ST_Distance(current_location, ST_MakePoint($1, $2)::geography) as distance_meters
           FROM contractor_profiles
           WHERE is_available = TRUE
             AND is_busy = FALSE
             AND current_location IS NOT NULL
             AND ST_DWithin(current_location, ST_MakePoint($1, $2)::geography, $3)
           ORDER BY distance_meters ASC
           LIMIT 50"#,
        q.lng,
        q.lat,
        radius,
    )
    .fetch_all(&state.db)
    .await?;

    let result = rows
        .into_iter()
        .map(|r| NearbyContractor {
            user_id: r.user_id,
            display_name: r.display_name,
            bio: r.bio,
            base_rate: r.base_rate,
            base_rate_unit: r.base_rate_unit,
            is_busy: r.is_busy,
            avg_rating: r.avg_rating,
            rating_count: r.rating_count,
            current_lat: r.current_lat,
            current_lng: r.current_lng,
            distance_meters: r.distance_meters.unwrap_or(0.0),
        })
        .collect();

    Ok(Json(result))
}

#[derive(Serialize)]
pub struct PublicRating {
    pub score: i16,
    pub review_text: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize)]
pub struct PublicContractorProfile {
    pub user_id: Uuid,
    pub display_name: String,
    pub bio: Option<String>,
    pub base_rate: Option<f64>,
    pub base_rate_unit: Option<RateUnit>,
    pub is_available: bool,
    pub is_busy: bool,
    pub avg_rating: f64,
    pub rating_count: i32,
    pub ratings: Vec<PublicRating>,
}

pub async fn contractor_profile(
    State(state): State<AppState>,
    CustomerUser(_claims): CustomerUser,
    Path(contractor_id): Path<Uuid>,
) -> Result<Json<PublicContractorProfile>, AppError> {
    let row = sqlx::query!(
        r#"SELECT user_id, display_name, bio, base_rate,
                  base_rate_unit as "base_rate_unit: RateUnit",
                  is_available, is_busy, avg_rating, rating_count
           FROM contractor_profiles WHERE user_id = $1"#,
        contractor_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Contractor not found".to_string()))?;

    let ratings = sqlx::query!(
        "SELECT score, review_text, created_at
         FROM ratings WHERE contractor_id = $1
         ORDER BY created_at DESC LIMIT 20",
        contractor_id
    )
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(|r| PublicRating {
        score: r.score,
        review_text: r.review_text,
        created_at: r.created_at,
    })
    .collect();

    Ok(Json(PublicContractorProfile {
        user_id: row.user_id,
        display_name: row.display_name,
        bio: row.bio,
        base_rate: row.base_rate,
        base_rate_unit: row.base_rate_unit,
        is_available: row.is_available,
        is_busy: row.is_busy,
        avg_rating: row.avg_rating,
        rating_count: row.rating_count,
        ratings,
    }))
}

// ─── Job Management ───────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct QuoteDetail {
    pub id: Uuid,
    pub base_rate_snapshot: Option<f64>,
    pub custom_amount: Option<f64>,
    pub custom_note: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize)]
pub struct JobDetail {
    pub id: Uuid,
    pub customer_id: Uuid,
    pub contractor_id: Uuid,
    pub status: crate::models::job::JobStatus,
    pub description: String,
    pub location_lat: f64,
    pub location_lng: f64,
    pub location_address: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub quote: Option<QuoteDetail>,
}

pub async fn get_job(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(job_id): Path<Uuid>,
) -> Result<Json<JobDetail>, AppError> {
    let job = sqlx::query!(
        r#"SELECT id, customer_id, contractor_id,
                  status as "status: crate::models::job::JobStatus",
                  description, location_lat, location_lng,
                  location_address, created_at, updated_at
           FROM jobs WHERE id = $1"#,
        job_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Job not found".to_string()))?;

    if job.customer_id != claims.sub && job.contractor_id != claims.sub {
        return Err(AppError::Unauthorized("Not your job".to_string()));
    }

    let quote = sqlx::query!(
        "SELECT id, base_rate_snapshot, custom_amount, custom_note, created_at
         FROM quotes WHERE job_id = $1",
        job_id
    )
    .fetch_optional(&state.db)
    .await?
    .map(|r| QuoteDetail {
        id: r.id,
        base_rate_snapshot: r.base_rate_snapshot,
        custom_amount: r.custom_amount,
        custom_note: r.custom_note,
        created_at: r.created_at,
    });

    Ok(Json(JobDetail {
        id: job.id,
        customer_id: job.customer_id,
        contractor_id: job.contractor_id,
        status: job.status,
        description: job.description,
        location_lat: job.location_lat,
        location_lng: job.location_lng,
        location_address: job.location_address,
        created_at: job.created_at,
        updated_at: job.updated_at,
        quote,
    }))
}

pub async fn cancel_job(
    State(state): State<AppState>,
    CustomerUser(claims): CustomerUser,
    Path(job_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let job = sqlx::query!(
        r#"SELECT id, customer_id, contractor_id, status as "status: crate::models::job::JobStatus"
           FROM jobs WHERE id = $1"#,
        job_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Job not found".to_string()))?;

    if job.customer_id != claims.sub {
        return Err(AppError::Unauthorized("Not your job".to_string()));
    }
    if job.status != crate::models::job::JobStatus::Pending {
        return Err(AppError::Conflict("Only pending jobs can be cancelled".to_string()));
    }

    sqlx::query!(
        "UPDATE jobs SET status = 'cancelled' WHERE id = $1",
        job_id
    )
    .execute(&state.db)
    .await?;

    state
        .hub
        .publish_job_event(
            job.contractor_id,
            &crate::ws::events::WsEvent::JobCancelled { job_id },
        )
        .await;

    Ok(StatusCode::OK)
}

// ─── Ratings ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct RatingRequest {
    pub score: i16,
    pub review_text: Option<String>,
}

pub async fn submit_rating(
    State(state): State<AppState>,
    CustomerUser(claims): CustomerUser,
    Path(job_id): Path<Uuid>,
    Json(req): Json<RatingRequest>,
) -> Result<StatusCode, AppError> {
    if req.score < 1 || req.score > 5 {
        return Err(AppError::BadRequest("Score must be between 1 and 5".to_string()));
    }

    let job = sqlx::query!(
        r#"SELECT customer_id, contractor_id,
                  status as "status: crate::models::job::JobStatus"
           FROM jobs WHERE id = $1"#,
        job_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Job not found".to_string()))?;

    if job.customer_id != claims.sub {
        return Err(AppError::Unauthorized("Not your job".to_string()));
    }
    if job.status != crate::models::job::JobStatus::Completed {
        return Err(AppError::Conflict("Can only rate completed jobs".to_string()));
    }

    let existing = sqlx::query!(
        "SELECT id FROM ratings WHERE job_id = $1",
        job_id
    )
    .fetch_optional(&state.db)
    .await?;

    if existing.is_some() {
        return Err(AppError::Conflict("Job already rated".to_string()));
    }

    let mut tx = state.db.begin().await?;

    sqlx::query!(
        "INSERT INTO ratings (job_id, contractor_id, customer_id, score, review_text)
         VALUES ($1, $2, $3, $4, $5)",
        job_id,
        job.contractor_id,
        claims.sub,
        req.score,
        req.review_text,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query!(
        r#"UPDATE contractor_profiles SET
               avg_rating = (avg_rating * rating_count + $1::double precision) / (rating_count + 1),
               rating_count = rating_count + 1
           WHERE user_id = $2"#,
        req.score as f64,
        job.contractor_id,
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(StatusCode::OK)
}
