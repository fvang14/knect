use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;
use uuid::Uuid;

use crate::{auth::middleware::AdminUser, error::AppError, AppState};

#[derive(Serialize)]
pub struct UserSummary {
    pub id: Uuid,
    pub email: String,
    pub phone: Option<String>,
    pub role: crate::models::user::UserRole,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub suspended_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn list_users(
    State(state): State<AppState>,
    AdminUser(_claims): AdminUser,
) -> Result<Json<Vec<UserSummary>>, AppError> {
    let rows = sqlx::query!(
        r#"SELECT id, email, phone,
                  role as "role: crate::models::user::UserRole",
                  created_at, suspended_at
           FROM users ORDER BY created_at DESC"#
    )
    .fetch_all(&state.db)
    .await?;

    let users = rows
        .into_iter()
        .map(|r| UserSummary {
            id: r.id,
            email: r.email,
            phone: r.phone,
            role: r.role,
            created_at: r.created_at,
            suspended_at: r.suspended_at,
        })
        .collect();

    Ok(Json(users))
}

pub async fn suspend_user(
    State(state): State<AppState>,
    AdminUser(_claims): AdminUser,
    Path(user_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let result = sqlx::query!(
        "UPDATE users SET suspended_at = NOW() WHERE id = $1 AND suspended_at IS NULL",
        user_id
    )
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("User not found or already suspended".to_string()));
    }

    Ok(StatusCode::OK)
}

#[derive(Serialize)]
pub struct JobSummary {
    pub id: Uuid,
    pub customer_id: Uuid,
    pub contractor_id: Uuid,
    pub status: crate::models::job::JobStatus,
    pub description: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn list_jobs(
    State(state): State<AppState>,
    AdminUser(_claims): AdminUser,
) -> Result<Json<Vec<JobSummary>>, AppError> {
    let rows = sqlx::query!(
        r#"SELECT id, customer_id, contractor_id,
                  status as "status: crate::models::job::JobStatus",
                  description, created_at
           FROM jobs ORDER BY created_at DESC LIMIT 200"#
    )
    .fetch_all(&state.db)
    .await?;

    let jobs = rows
        .into_iter()
        .map(|r| JobSummary {
            id: r.id,
            customer_id: r.customer_id,
            contractor_id: r.contractor_id,
            status: r.status,
            description: r.description,
            created_at: r.created_at,
        })
        .collect();

    Ok(Json(jobs))
}

#[derive(Serialize)]
pub struct Metrics {
    pub active_contractors: i64,
    pub jobs_today: i64,
    pub avg_rating: f64,
}

pub async fn get_metrics(
    State(state): State<AppState>,
    AdminUser(_claims): AdminUser,
) -> Result<Json<Metrics>, AppError> {
    let active_contractors = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM contractor_profiles WHERE is_available = TRUE OR is_busy = TRUE"
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(0);

    let jobs_today = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM jobs WHERE created_at >= CURRENT_DATE"
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(0);

    let avg_rating = sqlx::query_scalar!(
        "SELECT COALESCE(AVG(score::double precision), 0.0) FROM ratings"
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(0.0);

    Ok(Json(Metrics {
        active_contractors,
        jobs_today,
        avg_rating,
    }))
}
