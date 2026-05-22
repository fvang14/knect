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

#[derive(Deserialize)]
pub struct PatchMeRequest {
    pub display_name: Option<String>,
    pub email: Option<String>,
}

pub async fn patch_me(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<PatchMeRequest>,
) -> Result<StatusCode, AppError> {
    if let Some(ref name) = req.display_name {
        if name.trim().is_empty() || name.len() > 80 {
            return Err(AppError::BadRequest("Invalid display name".to_string()));
        }
    }

    let mut tx = state.db.begin().await?;

    if let Some(ref email) = req.email {
        let exists = sqlx::query_scalar!(
            "SELECT id FROM users WHERE email = $1 AND id <> $2",
            email,
            claims.sub
        )
        .fetch_optional(&mut *tx)
        .await?;
        if exists.is_some() {
            return Err(AppError::Conflict("Email already registered".to_string()));
        }
        sqlx::query!("UPDATE users SET email = $1 WHERE id = $2", email, claims.sub)
            .execute(&mut *tx)
            .await?;
    }

    if let Some(ref name) = req.display_name {
        match claims.role {
            UserRole::Customer => {
                sqlx::query!(
                    "UPDATE customer_profiles SET display_name = $1 WHERE user_id = $2",
                    name,
                    claims.sub
                )
                .execute(&mut *tx)
                .await?;
            }
            UserRole::Contractor => {
                sqlx::query!(
                    "UPDATE contractor_profiles SET display_name = $1 WHERE user_id = $2",
                    name,
                    claims.sub
                )
                .execute(&mut *tx)
                .await?;
            }
            UserRole::Admin => {
                return Err(AppError::Unauthorized("Admin cannot use /me".to_string()))
            }
        }
    }

    tx.commit().await?;
    Ok(StatusCode::OK)
}

#[derive(Deserialize)]
pub struct PasswordChangeRequest {
    pub current: String,
    pub new: String,
}

pub async fn post_password(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<PasswordChangeRequest>,
) -> Result<StatusCode, AppError> {
    if req.new.len() < 8 {
        return Err(AppError::BadRequest("Password too short".to_string()));
    }

    let row = sqlx::query!(
        "SELECT password_hash FROM users WHERE id = $1",
        claims.sub
    )
    .fetch_one(&state.db)
    .await?;

    if !verify_password(&req.current, &row.password_hash)? {
        return Err(AppError::Unauthorized("Current password incorrect".to_string()));
    }

    let new_hash = hash_password(&req.new)?;
    sqlx::query!(
        "UPDATE users SET password_hash = $1 WHERE id = $2",
        new_hash,
        claims.sub
    )
    .execute(&state.db)
    .await?;

    Ok(StatusCode::OK)
}
