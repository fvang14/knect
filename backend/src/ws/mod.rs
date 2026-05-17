pub mod events;
pub mod handler;

use std::sync::Arc;

use dashmap::DashMap;
use futures_util::StreamExt;
use uuid::Uuid;
use tokio::sync::mpsc;

use crate::models::user::UserRole;
use events::WsEvent;

pub struct WsHub {
    connections: DashMap<Uuid, (Uuid, UserRole, mpsc::Sender<WsEvent>)>,
    redis: redis::aio::ConnectionManager,
}

impl WsHub {
    pub fn new(redis: redis::aio::ConnectionManager) -> Arc<Self> {
        Arc::new(WsHub {
            connections: DashMap::new(),
            redis,
        })
    }

    pub fn register(&self, user_id: Uuid, role: UserRole) -> (Uuid, mpsc::Receiver<WsEvent>) {
        let connection_id = Uuid::new_v4();
        let (tx, rx) = mpsc::channel(32);
        self.connections.insert(user_id, (connection_id, role, tx));
        (connection_id, rx)
    }

    pub fn deregister(&self, user_id: Uuid, connection_id: Uuid) {
        self.connections
            .remove_if(&user_id, |_, (id, _, _)| *id == connection_id);
    }

    pub fn deliver_to_customers(&self, event: WsEvent) {
        for entry in self.connections.iter() {
            let (_, role, tx) = entry.value();
            if *role == UserRole::Customer {
                let _ = tx.try_send(event.clone());
            }
        }
    }

    pub fn deliver_to_user(&self, user_id: &Uuid, event: WsEvent) {
        if let Some(entry) = self.connections.get(user_id) {
            let (_, _, tx) = entry.value();
            let _ = tx.try_send(event);
        }
    }

    pub async fn publish_job_event(&self, user_id: Uuid, event: &WsEvent) {
        use redis::AsyncCommands;
        let Ok(json) = serde_json::to_string(event) else { return };
        let channel = format!("user:{}:events", user_id);
        let mut conn = self.redis.clone();
        if let Err(e) = conn.publish::<_, _, ()>(&channel, &json).await {
            tracing::warn!("publish_job_event failed: {e}");
        }
    }

    pub async fn publish_location(&self, event: &WsEvent) {
        use redis::AsyncCommands;
        let Ok(json) = serde_json::to_string(event) else { return };
        let mut conn = self.redis.clone();
        if let Err(e) = conn.publish::<_, _, ()>("location:updates", &json).await {
            tracing::warn!("publish_location failed: {e}");
        }
    }
}

fn parse_user_id_from_channel(channel: &str) -> Option<Uuid> {
    let parts: Vec<&str> = channel.split(':').collect();
    if parts.len() == 3 && parts[0] == "user" && parts[2] == "events" {
        Uuid::parse_str(parts[1]).ok()
    } else {
        None
    }
}

pub async fn run_location_subscriber(hub: Arc<WsHub>, redis_url: &str) -> anyhow::Result<()> {
    let client = redis::Client::open(redis_url)?;
    let conn = client.get_async_connection().await?;
    let mut pubsub = conn.into_pubsub();
    pubsub.subscribe("location:updates").await?;
    let mut stream = pubsub.on_message();
    loop {
        match stream.next().await {
            Some(msg) => {
                let payload: String = msg.get_payload()?;
                if let Ok(event) = serde_json::from_str::<WsEvent>(&payload) {
                    hub.deliver_to_customers(event);
                }
            }
            None => return Err(anyhow::anyhow!("location:updates stream ended")),
        }
    }
}

pub async fn run_events_subscriber(hub: Arc<WsHub>, redis_url: &str) -> anyhow::Result<()> {
    let client = redis::Client::open(redis_url)?;
    let conn = client.get_async_connection().await?;
    let mut pubsub = conn.into_pubsub();
    pubsub.psubscribe("user:*:events").await?;
    let mut stream = pubsub.on_message();
    loop {
        match stream.next().await {
            Some(msg) => {
                let channel: String = msg.get_channel()?;
                if let Some(user_id) = parse_user_id_from_channel(&channel) {
                    let payload: String = msg.get_payload()?;
                    if let Ok(event) = serde_json::from_str::<WsEvent>(&payload) {
                        hub.deliver_to_user(&user_id, event);
                    }
                }
            }
            None => return Err(anyhow::anyhow!("user:*:events stream ended")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_user_id_from_channel_valid() {
        let id = Uuid::new_v4();
        let channel = format!("user:{}:events", id);
        assert_eq!(parse_user_id_from_channel(&channel), Some(id));
    }

    #[test]
    fn parse_user_id_from_channel_invalid() {
        assert_eq!(parse_user_id_from_channel("location:updates"), None);
        assert_eq!(parse_user_id_from_channel("user:not-a-uuid:events"), None);
        assert_eq!(parse_user_id_from_channel("user:events"), None);
    }
}
