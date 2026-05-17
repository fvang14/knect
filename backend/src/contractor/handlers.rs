use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::middleware::ContractorUser,
    error::AppError,
    models::contractor::RateUnit,
    AppState,
};

// ─── Profile ───────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct TradeCategory {
    pub id: Uuid,
    pub name: String,
    pub icon_slug: String,
}

#[derive(Serialize)]
pub struct ContractorProfileResponse {
    pub user_id: Uuid,
    pub display_name: String,
    pub bio: Option<String>,
    pub base_rate: Option<f64>,
    pub base_rate_unit: Option<RateUnit>,
    pub is_available: bool,
    pub is_busy: bool,
    pub current_lat: Option<f64>,
    pub current_lng: Option<f64>,
    pub avg_rating: f64,
    pub rating_count: i32,
    pub trade_categories: Vec<TradeCategory>,
}

pub async fn get_profile(
    State(state): State<AppState>,
    ContractorUser(claims): ContractorUser,
) -> Result<Json<ContractorProfileResponse>, AppError> {
    let row = sqlx::query!(
        r#"SELECT user_id, display_name, bio, base_rate,
                  base_rate_unit as "base_rate_unit: RateUnit",
                  is_available, is_busy, current_lat, current_lng,
                  avg_rating, rating_count
           FROM contractor_profiles WHERE user_id = $1"#,
        claims.sub
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Profile not found".to_string()))?;

    let categories = sqlx::query!(
        "SELECT tc.id, tc.name, tc.icon_slug
         FROM trade_categories tc
         JOIN contractor_trade_categories ctc ON ctc.category_id = tc.id
         WHERE ctc.contractor_id = $1
         ORDER BY tc.name",
        claims.sub
    )
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(|r| TradeCategory { id: r.id, name: r.name, icon_slug: r.icon_slug })
    .collect();

    Ok(Json(ContractorProfileResponse {
        user_id: row.user_id,
        display_name: row.display_name,
        bio: row.bio,
        base_rate: row.base_rate,
        base_rate_unit: row.base_rate_unit,
        is_available: row.is_available,
        is_busy: row.is_busy,
        current_lat: row.current_lat,
        current_lng: row.current_lng,
        avg_rating: row.avg_rating,
        rating_count: row.rating_count,
        trade_categories: categories,
    }))
}

#[derive(Deserialize)]
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub base_rate: Option<f64>,
    pub base_rate_unit: Option<RateUnit>,
    pub category_ids: Option<Vec<Uuid>>,
}

pub async fn update_profile(
    State(state): State<AppState>,
    ContractorUser(claims): ContractorUser,
    Json(req): Json<UpdateProfileRequest>,
) -> Result<StatusCode, AppError> {
    let mut tx = state.db.begin().await?;

    sqlx::query!(
        r#"UPDATE contractor_profiles SET
            display_name = COALESCE($1, display_name),
            bio = COALESCE($2, bio),
            base_rate = COALESCE($3, base_rate),
            base_rate_unit = COALESCE($4::rate_unit, base_rate_unit)
           WHERE user_id = $5"#,
        req.display_name,
        req.bio,
        req.base_rate,
        req.base_rate_unit as Option<RateUnit>,
        claims.sub,
    )
    .execute(&mut *tx)
    .await?;

    if let Some(category_ids) = req.category_ids {
        sqlx::query!(
            "DELETE FROM contractor_trade_categories WHERE contractor_id = $1",
            claims.sub
        )
        .execute(&mut *tx)
        .await?;

        for cat_id in category_ids {
            sqlx::query!(
                "INSERT INTO contractor_trade_categories (contractor_id, category_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING",
                claims.sub,
                cat_id,
            )
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;
    Ok(StatusCode::OK)
}

// ─── Availability ─────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct AvailabilityRequest {
    pub available: bool,
}

pub async fn set_availability(
    State(state): State<AppState>,
    ContractorUser(claims): ContractorUser,
    Json(req): Json<AvailabilityRequest>,
) -> Result<StatusCode, AppError> {
    sqlx::query!(
        "UPDATE contractor_profiles SET is_available = $1 WHERE user_id = $2",
        req.available,
        claims.sub,
    )
    .execute(&state.db)
    .await?;

    Ok(StatusCode::OK)
}

// ─── Location ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct LocationRequest {
    pub lat: f64,
    pub lng: f64,
}

pub async fn update_location(
    State(state): State<AppState>,
    ContractorUser(claims): ContractorUser,
    Json(req): Json<LocationRequest>,
) -> Result<StatusCode, AppError> {
    // Write durable record first; Redis is a cache and will expire in 30s regardless
    // ST_MakePoint(longitude, latitude) — PostGIS uses (lng, lat) order
    sqlx::query!(
        r#"UPDATE contractor_profiles
           SET current_lat = $1,
               current_lng = $2,
               current_location = ST_MakePoint($2, $1)::geography,
               location_updated_at = NOW()
           WHERE user_id = $3"#,
        req.lat,
        req.lng,
        claims.sub,
    )
    .execute(&state.db)
    .await?;

    let key = format!("contractor:{}:pos", claims.sub);
    let value = format!("{},{}", req.lat, req.lng);
    let mut conn = state.redis.clone();
    conn.set_ex::<_, _, ()>(&key, &value, 30)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Redis error: {e}")))?;

    state.hub.publish_location(
        &crate::ws::events::WsEvent::LocationUpdate {
            contractor_id: claims.sub,
            lat: req.lat,
            lng: req.lng,
        },
    ).await;

    Ok(StatusCode::OK)
}

// ─── Job Queue ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct JobQueueItem {
    pub id: Uuid,
    pub customer_id: Uuid,
    pub status: crate::models::job::JobStatus,
    pub description: String,
    pub location_lat: f64,
    pub location_lng: f64,
    pub location_address: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

pub async fn list_jobs(
    State(state): State<AppState>,
    ContractorUser(claims): ContractorUser,
) -> Result<Json<Vec<JobQueueItem>>, AppError> {
    let rows = sqlx::query!(
        r#"SELECT id, customer_id,
                  status as "status: crate::models::job::JobStatus",
                  description, location_lat, location_lng,
                  location_address, created_at, updated_at
           FROM jobs
           WHERE contractor_id = $1
             AND status IN ('pending', 'accepted', 'in_progress')
           ORDER BY created_at ASC"#,
        claims.sub
    )
    .fetch_all(&state.db)
    .await?;

    let jobs = rows
        .into_iter()
        .map(|r| JobQueueItem {
            id: r.id,
            customer_id: r.customer_id,
            status: r.status,
            description: r.description,
            location_lat: r.location_lat,
            location_lng: r.location_lng,
            location_address: r.location_address,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
        .collect();

    Ok(Json(jobs))
}

// ─── State Machine ────────────────────────────────────────────────────────

use crate::models::job::JobStatus;

#[derive(Deserialize)]
pub struct RespondRequest {
    pub action: String, // "accept" | "deny"
}

pub async fn respond_to_job(
    State(state): State<AppState>,
    ContractorUser(claims): ContractorUser,
    Path(job_id): Path<Uuid>,
    Json(req): Json<RespondRequest>,
) -> Result<StatusCode, AppError> {
    let job = sqlx::query!(
        r#"SELECT id, status as "status: JobStatus", contractor_id, customer_id
           FROM jobs WHERE id = $1"#,
        job_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Job not found".to_string()))?;

    if job.contractor_id != claims.sub {
        return Err(AppError::Unauthorized("Not your job".to_string()));
    }
    if job.status != JobStatus::Pending {
        return Err(AppError::Conflict("Job is not pending".to_string()));
    }

    match req.action.as_str() {
        "accept" => {
            let mut tx = state.db.begin().await?;
            sqlx::query!(
                "UPDATE jobs SET status = 'accepted' WHERE id = $1",
                job_id
            )
            .execute(&mut *tx)
            .await?;
            sqlx::query!(
                "UPDATE contractor_profiles SET is_busy = TRUE WHERE user_id = $1",
                claims.sub
            )
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            state.hub.publish_job_event(
                job.customer_id,
                &crate::ws::events::WsEvent::JobAccepted { job_id },
            ).await;
        }
        "deny" => {
            sqlx::query!(
                "UPDATE jobs SET status = 'denied' WHERE id = $1",
                job_id
            )
            .execute(&state.db)
            .await?;
            state.hub.publish_job_event(
                job.customer_id,
                &crate::ws::events::WsEvent::JobDenied { job_id },
            ).await;
        }
        _ => {
            return Err(AppError::BadRequest("action must be 'accept' or 'deny'".to_string()));
        }
    }

    Ok(StatusCode::OK)
}

pub async fn complete_job(
    State(state): State<AppState>,
    ContractorUser(claims): ContractorUser,
    Path(job_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let job = sqlx::query!(
        r#"SELECT id, status as "status: JobStatus", contractor_id, customer_id
           FROM jobs WHERE id = $1"#,
        job_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Job not found".to_string()))?;

    if job.contractor_id != claims.sub {
        return Err(AppError::Unauthorized("Not your job".to_string()));
    }
    if job.status != JobStatus::Accepted && job.status != JobStatus::InProgress {
        return Err(AppError::Conflict("Job must be accepted or in_progress to complete".to_string()));
    }

    let mut tx = state.db.begin().await?;
    sqlx::query!(
        "UPDATE jobs SET status = 'completed' WHERE id = $1",
        job_id
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        "UPDATE contractor_profiles SET is_busy = FALSE WHERE user_id = $1",
        claims.sub
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    state.hub.publish_job_event(
        job.customer_id,
        &crate::ws::events::WsEvent::JobCompleted { job_id },
    ).await;

    Ok(StatusCode::OK)
}

// ─── Quotes ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct QuoteRequest {
    pub custom_amount: Option<f64>,
    pub custom_note: Option<String>,
}

pub async fn submit_quote(
    State(state): State<AppState>,
    ContractorUser(claims): ContractorUser,
    Path(job_id): Path<Uuid>,
    Json(req): Json<QuoteRequest>,
) -> Result<StatusCode, AppError> {
    let job = sqlx::query!(
        r#"SELECT status as "status: JobStatus", contractor_id,
                  cp.base_rate as contractor_base_rate
           FROM jobs j
           JOIN contractor_profiles cp ON cp.user_id = j.contractor_id
           WHERE j.id = $1"#,
        job_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Job not found".to_string()))?;

    if job.contractor_id != claims.sub {
        return Err(AppError::Unauthorized("Not your job".to_string()));
    }
    if job.status != JobStatus::Accepted && job.status != JobStatus::InProgress {
        return Err(AppError::Conflict("Job must be accepted or in progress to submit a quote".to_string()));
    }

    sqlx::query!(
        "INSERT INTO quotes (job_id, contractor_id, base_rate_snapshot, custom_amount, custom_note)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (job_id) DO UPDATE SET
             custom_amount = EXCLUDED.custom_amount,
             custom_note = EXCLUDED.custom_note,
             base_rate_snapshot = EXCLUDED.base_rate_snapshot",
        job_id,
        claims.sub,
        job.contractor_base_rate,
        req.custom_amount,
        req.custom_note,
    )
    .execute(&state.db)
    .await?;

    Ok(StatusCode::OK)
}
