use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
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

// ─── Stubs for later tasks ──────────────────────────────────────────────────

pub async fn set_availability() -> StatusCode { todo!() }
pub async fn update_location() -> StatusCode { todo!() }
pub async fn list_jobs() -> StatusCode { todo!() }
pub async fn respond_to_job() -> StatusCode { todo!() }
pub async fn submit_quote() -> StatusCode { todo!() }
pub async fn complete_job() -> StatusCode { todo!() }
