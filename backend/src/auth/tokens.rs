use crate::{error::AppError, models::user::UserRole};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use uuid::Uuid;

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct Claims {
    pub sub: Uuid,
    pub role: UserRole,
    pub exp: usize,
}

pub fn create_access_token(
    user_id: Uuid,
    role: UserRole,
    secret: &str,
) -> Result<String, AppError> {
    let exp = (Utc::now() + Duration::hours(1)).timestamp() as usize;
    let claims = Claims { sub: user_id, role, exp };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("Token creation failed: {e}")))
}

pub fn create_refresh_token(
    user_id: Uuid,
    role: UserRole,
    secret: &str,
) -> Result<String, AppError> {
    let exp = (Utc::now() + Duration::days(30)).timestamp() as usize;
    let claims = Claims { sub: user_id, role, exp };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("Refresh token creation failed: {e}")))
}

pub fn verify_token(token: &str, secret: &str) -> Result<Claims, AppError> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map(|data| data.claims)
    .map_err(|_| AppError::Unauthorized("Invalid or expired token".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "test_secret_that_is_at_least_64_characters_long_for_hs256_algorithm_testing";

    #[test]
    fn access_token_round_trips() {
        let id = Uuid::new_v4();
        let token = create_access_token(id, UserRole::Contractor, SECRET).unwrap();
        let claims = verify_token(&token, SECRET).unwrap();
        assert_eq!(claims.sub, id);
        assert_eq!(claims.role, UserRole::Contractor);
    }

    #[test]
    fn wrong_secret_fails_verification() {
        let token = create_access_token(Uuid::new_v4(), UserRole::Customer, SECRET).unwrap();
        assert!(verify_token(&token, "wrong_secret").is_err());
    }

    #[test]
    fn refresh_token_round_trips() {
        let id = Uuid::new_v4();
        let token = create_refresh_token(id, UserRole::Customer, SECRET).unwrap();
        let claims = verify_token(&token, SECRET).unwrap();
        assert_eq!(claims.sub, id);
    }
}
