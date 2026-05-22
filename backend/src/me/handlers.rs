use axum::{extract::{Path, State}, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::{middleware::AuthUser, password::{hash_password, verify_password}},
    error::AppError,
    models::user::UserRole,
    AppState,
};

#[derive(Serialize)]
pub struct MeResponse {
    pub id: Uuid,
    pub email: String,
    pub role: UserRole,
    pub display_name: String,
    pub has_avatar: bool,
    pub avatar_updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn get_me(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> Result<Json<MeResponse>, AppError> {
    let display_name = match claims.role {
        UserRole::Customer => sqlx::query_scalar!(
            "SELECT display_name FROM customer_profiles WHERE user_id = $1",
            claims.sub
        )
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Profile not found".to_string()))?,
        UserRole::Contractor => sqlx::query_scalar!(
            "SELECT display_name FROM contractor_profiles WHERE user_id = $1",
            claims.sub
        )
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Profile not found".to_string()))?,
        UserRole::Admin => {
            return Err(AppError::Unauthorized("Admin cannot use /me".to_string()))
        }
    };

    let email: String =
        sqlx::query_scalar!("SELECT email FROM users WHERE id = $1", claims.sub)
            .fetch_one(&state.db)
            .await?;

    let avatar = sqlx::query!(
        "SELECT updated_at FROM user_avatars WHERE user_id = $1",
        claims.sub
    )
    .fetch_optional(&state.db)
    .await?;

    Ok(Json(MeResponse {
        id: claims.sub,
        email,
        role: claims.role,
        display_name,
        has_avatar: avatar.is_some(),
        avatar_updated_at: avatar.map(|a| a.updated_at),
    }))
}
