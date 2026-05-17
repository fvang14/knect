use axum::{async_trait, extract::FromRequestParts, http::request::Parts};

use crate::{
    auth::tokens::{verify_token, Claims},
    error::AppError,
    models::user::UserRole,
    AppState,
};

pub struct AuthUser(pub Claims);
pub struct ContractorUser(pub Claims);
pub struct CustomerUser(pub Claims);
pub struct AdminUser(pub Claims);

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

#[async_trait]
impl FromRequestParts<AppState> for ContractorUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let AuthUser(claims) = AuthUser::from_request_parts(parts, state).await?;
        if claims.role != UserRole::Contractor {
            return Err(AppError::Unauthorized("Contractor access required".to_string()));
        }
        Ok(ContractorUser(claims))
    }
}

#[async_trait]
impl FromRequestParts<AppState> for CustomerUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let AuthUser(claims) = AuthUser::from_request_parts(parts, state).await?;
        if claims.role != UserRole::Customer {
            return Err(AppError::Unauthorized("Customer access required".to_string()));
        }
        Ok(CustomerUser(claims))
    }
}

#[async_trait]
impl FromRequestParts<AppState> for AdminUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let AuthUser(claims) = AuthUser::from_request_parts(parts, state).await?;
        if claims.role != UserRole::Admin {
            return Err(AppError::Unauthorized("Admin access required".to_string()));
        }
        Ok(AdminUser(claims))
    }
}
