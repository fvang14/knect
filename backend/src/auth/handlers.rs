use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::{
        middleware::AuthUser,
        password::hash_password,
        tokens::{create_access_token, create_refresh_token},
    },
    error::AppError,
    models::user::UserRole,
    AppState,
};

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub phone: Option<String>,
    pub role: UserRole,
    pub display_name: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
}

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<AuthResponse>), AppError> {
    if req.role == UserRole::Admin {
        return Err(AppError::BadRequest("Cannot register as admin".to_string()));
    }

    let existing = sqlx::query!("SELECT id FROM users WHERE email = $1", req.email)
        .fetch_optional(&state.db)
        .await?;

    if existing.is_some() {
        return Err(AppError::Conflict("Email already registered".to_string()));
    }

    let password_hash = hash_password(&req.password)?;
    let user_id = Uuid::new_v4();
    let role = req.role;

    let mut tx = state.db.begin().await?;

    sqlx::query!(
        "INSERT INTO users (id, email, phone, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
        user_id,
        req.email,
        req.phone,
        password_hash,
        role.clone() as UserRole,
    )
    .execute(&mut *tx)
    .await?;

    match &role {
        UserRole::Contractor => {
            sqlx::query!(
                "INSERT INTO contractor_profiles (user_id, display_name) VALUES ($1, $2)",
                user_id,
                req.display_name,
            )
            .execute(&mut *tx)
            .await?;
        }
        UserRole::Customer => {
            sqlx::query!(
                "INSERT INTO customer_profiles (user_id, display_name) VALUES ($1, $2)",
                user_id,
                req.display_name,
            )
            .execute(&mut *tx)
            .await?;
        }
        UserRole::Admin => unreachable!(),
    }

    tx.commit().await?;

    let access_token =
        create_access_token(user_id, role.clone(), &state.config.jwt_secret)?;
    let refresh_token =
        create_refresh_token(user_id, role, &state.config.jwt_refresh_secret)?;

    Ok((StatusCode::OK, Json(AuthResponse { access_token, refresh_token })))
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let row = sqlx::query!(
        r#"SELECT id, password_hash, role as "role: UserRole", suspended_at
           FROM users WHERE email = $1"#,
        req.email
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("Invalid email or password".to_string()))?;

    if row.suspended_at.is_some() {
        return Err(AppError::Unauthorized("Account suspended".to_string()));
    }

    if !crate::auth::password::verify_password(&req.password, &row.password_hash)? {
        return Err(AppError::Unauthorized("Invalid email or password".to_string()));
    }

    let access_token = create_access_token(row.id, row.role.clone(), &state.config.jwt_secret)?;
    let refresh_token =
        create_refresh_token(row.id, row.role, &state.config.jwt_refresh_secret)?;

    Ok(Json(AuthResponse { access_token, refresh_token }))
}

#[derive(Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

pub async fn refresh(
    State(_state): State<AppState>,
    Json(_req): Json<RefreshRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    todo!()  // implemented in Task 10
}

pub async fn me(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query!(
        "SELECT email, phone FROM users WHERE id = $1",
        claims.sub
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    Ok(Json(serde_json::json!({
        "id": claims.sub,
        "email": row.email,
        "phone": row.phone,
        "role": claims.role,
    })))
}
