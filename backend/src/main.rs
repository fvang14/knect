use std::sync::Arc;

use knect_api::{config::Config, create_router, ws, AppState};
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "knect_api=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env()?;

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    let redis_client = redis::Client::open(config.redis_url.as_str())
        .map_err(|e| anyhow::anyhow!("Redis client error: {e}"))?;
    let redis = redis::aio::ConnectionManager::new(redis_client)
        .await
        .map_err(|e| anyhow::anyhow!("Redis connection failed: {e}"))?;

    let hub = ws::WsHub::new(redis.clone());

    let hub_loc = Arc::clone(&hub);
    let redis_url_loc = config.redis_url.clone();
    tokio::spawn(async move {
        loop {
            if let Err(e) = ws::run_location_subscriber(Arc::clone(&hub_loc), &redis_url_loc).await {
                tracing::error!("Location subscriber crashed: {e}");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    });

    let hub_ev = Arc::clone(&hub);
    let redis_url_ev = config.redis_url.clone();
    tokio::spawn(async move {
        loop {
            if let Err(e) = ws::run_events_subscriber(Arc::clone(&hub_ev), &redis_url_ev).await {
                tracing::error!("Events subscriber crashed: {e}");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    });

    let state = AppState { db: pool, config: config.clone(), redis, hub };
    let app = create_router(state);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Listening on {addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
