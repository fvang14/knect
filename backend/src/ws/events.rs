use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractorPosition {
    pub contractor_id: Uuid,
    pub lat: f64,
    pub lng: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsEvent {
    Snapshot { contractors: Vec<ContractorPosition> },
    LocationUpdate { contractor_id: Uuid, lat: f64, lng: f64 },
    JobRequested { job_id: Uuid, description: String, location_lat: f64, location_lng: f64 },
    JobAccepted { job_id: Uuid },
    JobDenied { job_id: Uuid },
    JobCompleted { job_id: Uuid },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_serializes_with_type_field() {
        let event = WsEvent::Snapshot { contractors: vec![] };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "snapshot");
        assert!(json["contractors"].is_array());
    }

    #[test]
    fn location_update_serializes_with_type_field() {
        let id = Uuid::new_v4();
        let event = WsEvent::LocationUpdate { contractor_id: id, lat: 40.71, lng: -74.0 };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "location_update");
        assert_eq!(json["contractor_id"], id.to_string());
    }

    #[test]
    fn job_requested_serializes_with_type_field() {
        let event = WsEvent::JobRequested {
            job_id: Uuid::new_v4(),
            description: "Fix sink".into(),
            location_lat: 40.7,
            location_lng: -74.0,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "job_requested");
        assert_eq!(json["description"], "Fix sink");
    }

    #[test]
    fn job_accepted_round_trips() {
        let id = Uuid::new_v4();
        let event = WsEvent::JobAccepted { job_id: id };
        let json = serde_json::to_string(&event).unwrap();
        let decoded: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded["type"], "job_accepted");
        assert_eq!(decoded["job_id"], id.to_string());
    }
}
