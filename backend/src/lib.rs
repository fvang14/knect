pub mod auth;
pub mod config;
pub mod error;
pub mod models;

use axum::{
    routing::{get, post},
    Router,
};
use sqlx::PgPool;
use tower_http::trace::TraceLayer;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/auth/register", post(auth::handlers::register))
        .route("/auth/login", post(auth::handlers::login))
        .route("/auth/refresh", post(auth::handlers::refresh))
        .route("/auth/me", get(auth::handlers::me))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
