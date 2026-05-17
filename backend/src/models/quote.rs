use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow)]
pub struct Quote {
    pub id: Uuid,
    pub job_id: Uuid,
    pub contractor_id: Uuid,
    pub base_rate_snapshot: Option<f64>,
    pub custom_amount: Option<f64>,
    pub custom_note: Option<String>,
    pub created_at: DateTime<Utc>,
}
