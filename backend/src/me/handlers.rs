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

const AVATAR_MAX_BYTES: usize = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES: &[&str] = &["image/jpeg", "image/png", "image/webp"];

pub async fn post_avatar(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    mut multipart: axum::extract::Multipart,
) -> Result<StatusCode, AppError> {
    let field = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("multipart error: {e}")))?
        .ok_or_else(|| AppError::BadRequest("missing file field".to_string()))?;

    let content_type = field
        .content_type()
        .map(|s| s.to_string())
        .unwrap_or_default();

    if !ALLOWED_AVATAR_TYPES.contains(&content_type.as_str()) {
        return Err(AppError::UnsupportedMediaType(
            "Only image/jpeg, image/png, image/webp allowed".to_string(),
        ));
    }

    let bytes = field
        .bytes()
        .await
        .map_err(|e| AppError::BadRequest(format!("read error: {e}")))?;

    if bytes.len() > AVATAR_MAX_BYTES {
        return Err(AppError::PayloadTooLarge(
            "Avatar exceeds 2 MB limit".to_string(),
        ));
    }

    sqlx::query!(
        r#"
        INSERT INTO user_avatars (user_id, bytes, content_type, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET bytes = EXCLUDED.bytes,
            content_type = EXCLUDED.content_type,
            updated_at = NOW()
        "#,
        claims.sub,
        bytes.as_ref(),
        content_type,
    )
    .execute(&state.db)
    .await?;

    Ok(StatusCode::OK)
}

pub async fn delete_avatar(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> Result<StatusCode, AppError> {
    sqlx::query!("DELETE FROM user_avatars WHERE user_id = $1", claims.sub)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::OK)
}

pub async fn get_user_avatar(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let row = sqlx::query!(
        "SELECT bytes, content_type FROM user_avatars WHERE user_id = $1",
        user_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Avatar not found".to_string()))?;

    Ok((
        StatusCode::OK,
        [
            (axum::http::header::CONTENT_TYPE, row.content_type),
            (axum::http::header::CACHE_CONTROL, "public, max-age=86400".to_string()),
            (axum::http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*".to_string()),
        ],
        axum::body::Bytes::from(row.bytes),
    ))
}

pub async fn delete_me(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> Result<StatusCode, AppError> {
    if claims.role == UserRole::Admin {
        return Err(AppError::Unauthorized("Admin cannot use /me".to_string()));
    }

    let active_exists = sqlx::query_scalar!(
        r#"
        SELECT EXISTS (
            SELECT 1 FROM jobs
            WHERE (customer_id = $1 OR contractor_id = $1)
              AND status IN ('pending', 'accepted', 'in_progress')
        )
        "#,
        claims.sub
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(false);

    if active_exists {
        return Err(AppError::Conflict("Cannot delete account with active jobs".to_string()));
    }

    sqlx::query!("DELETE FROM users WHERE id = $1", claims.sub)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::OK)
}
