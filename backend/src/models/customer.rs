use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow)]
pub struct CustomerProfile {
    pub user_id: Uuid,
    pub display_name: String,
}
