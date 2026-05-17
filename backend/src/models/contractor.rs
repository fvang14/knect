use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "rate_unit", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum RateUnit {
    PerHour,
    PerJob,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ContractorProfile {
    pub user_id: Uuid,
    pub display_name: String,
    pub bio: Option<String>,
    pub base_rate: Option<f64>,
    pub base_rate_unit: Option<RateUnit>,
    pub is_available: bool,
    pub is_busy: bool,
    pub current_lat: Option<f64>,
    pub current_lng: Option<f64>,
    pub location_updated_at: Option<DateTime<Utc>>,
    pub avg_rating: f64,
    pub rating_count: i32,
}
