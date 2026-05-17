use axum::{async_trait, extract::FromRequestParts, http::request::Parts};

use crate::{auth::tokens::{verify_token, Claims}, error::AppError, AppState};

pub struct AuthUser(pub Claims);

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or_else(|| AppError::Unauthorized("Missing authorization header".to_string()))?;

        let claims = verify_token(token, &state.config.jwt_secret)?;
        Ok(AuthUser(claims))
    }
}
