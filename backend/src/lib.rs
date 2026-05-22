pub mod admin;
pub mod auth;
pub mod config;
pub mod contractor;
pub mod customer;
pub mod error;
pub mod me;
pub mod models;
pub mod ws;

use std::sync::Arc;

use axum::{
    routing::{delete, get, post, put},
    Router,
};
use sqlx::PgPool;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
    pub redis: redis::aio::ConnectionManager,
    pub hub: Arc<ws::WsHub>,
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        // Auth
        .route("/auth/register", post(auth::handlers::register))
        .route("/auth/login", post(auth::handlers::login))
        .route("/auth/refresh", post(auth::handlers::refresh))
        .route("/auth/me", get(auth::handlers::me))
        .route("/me", get(me::handlers::get_me))
        // Contractor
        .route("/contractor/profile", get(contractor::handlers::get_profile))
        .route("/contractor/profile", put(contractor::handlers::update_profile))
        .route("/contractor/availability", post(contractor::handlers::set_availability))
        .route("/location", post(contractor::handlers::update_location))
        .route("/contractor/jobs", get(contractor::handlers::list_jobs))
        .route("/jobs/:id/respond", post(contractor::handlers::respond_to_job))
        .route("/jobs/:id/quote", post(contractor::handlers::submit_quote))
        .route("/jobs/:id/complete", post(contractor::handlers::complete_job))
        // Customer
        .route("/contractors/nearby", get(customer::handlers::nearby_contractors))
        .route("/contractors/:id", get(customer::handlers::contractor_profile))
        .route("/jobs", post(customer::handlers::create_job))
        .route("/jobs", get(customer::handlers::list_jobs))
        .route("/jobs/:id", get(customer::handlers::get_job))
        .route("/jobs/:id", delete(customer::handlers::cancel_job))
        .route("/jobs/:id/rating", post(customer::handlers::submit_rating))
        // Admin
        .route("/admin/users", get(admin::handlers::list_users))
        .route("/admin/users/:id/suspend", put(admin::handlers::suspend_user))
        .route("/admin/jobs", get(admin::handlers::list_jobs))
        .route("/admin/metrics", get(admin::handlers::get_metrics))
        // WebSocket
        .route("/ws", get(ws::handler::ws_handler))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
