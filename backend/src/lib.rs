pub mod auth;
pub mod config;
pub mod error;
pub mod models;

use axum::Router;
use sqlx::PgPool;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
}

pub fn create_router(state: AppState) -> Router {
    Router::new().with_state(state)
}
