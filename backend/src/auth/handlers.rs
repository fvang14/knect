use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::{
        password::hash_password,
        tokens::{create_access_token, create_refresh_token, verify_token, Claims},
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

    sqlx::query!(
        "INSERT INTO users (id, email, phone, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
        user_id,
        req.email,
        req.phone,
        password_hash,
        req.role.clone() as UserRole,
    )
    .execute(&state.db)
    .await?;

    match req.role {
        UserRole::Contractor => {
            sqlx::query!(
                "INSERT INTO contractor_profiles (user_id, display_name) VALUES ($1, $2)",
                user_id,
                req.display_name,
            )
            .execute(&state.db)
            .await?;
        }
        UserRole::Customer => {
            sqlx::query!(
                "INSERT INTO customer_profiles (user_id, display_name) VALUES ($1, $2)",
                user_id,
                req.display_name,
            )
            .execute(&state.db)
            .await?;
        }
        UserRole::Admin => unreachable!(),
    }

    let access_token =
        create_access_token(user_id, req.role.clone(), &state.config.jwt_secret)?;
    let refresh_token =
        create_refresh_token(user_id, req.role, &state.config.jwt_refresh_secret)?;

    Ok((StatusCode::OK, Json(AuthResponse { access_token, refresh_token })))
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

pub async fn login(
    State(_state): State<AppState>,
    Json(_req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    todo!()  // implemented in Task 8
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
