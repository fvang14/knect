use axum::{
    extract::{Query, State, WebSocketUpgrade},
    extract::ws::{Message, WebSocket},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use futures_util::{SinkExt, StreamExt};
use redis::AsyncCommands;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::{
    auth::tokens::verify_token,
    models::user::UserRole,
    ws::events::{ContractorPosition, WsEvent},
    AppState,
};

#[derive(Deserialize)]
pub struct WsQuery {
    pub token: String,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(q): Query<WsQuery>,
    State(state): State<AppState>,
) -> Response {
    match verify_token(&q.token, &state.config.jwt_secret) {
        Ok(claims) => ws.on_upgrade(move |socket| handle_socket(socket, claims.sub, claims.role, state)),
        Err(_) => (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "unauthorized", "message": "Invalid token", "status": 401})),
        )
            .into_response(),
    }
}

async fn handle_socket(mut socket: WebSocket, user_id: Uuid, role: UserRole, state: AppState) {
    let (connection_id, mut rx) = state.hub.register(user_id, role.clone());

    if role == UserRole::Customer {
        let snapshot = build_snapshot(&mut state.redis.clone()).await;
        if let Ok(json) = serde_json::to_string(&snapshot) {
            if socket.send(Message::Text(json)).await.is_err() {
                state.hub.deregister(user_id, connection_id);
                return;
            }
        }
    }

    let (mut ws_sender, mut ws_receiver) = socket.split();

    let send_task = tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let Ok(json) = serde_json::to_string(&event) {
                if ws_sender.send(Message::Text(json)).await.is_err() {
                    break;
                }
            }
        }
    });

    let recv_task = tokio::spawn(async move {
        while let Some(result) = ws_receiver.next().await {
            match result {
                Ok(Message::Close(_)) | Err(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }

    state.hub.deregister(user_id, connection_id);
}

async fn build_snapshot(redis: &mut redis::aio::ConnectionManager) -> WsEvent {
    let keys: Vec<String> = redis.keys("contractor:*:pos").await.unwrap_or_default();
    let mut contractors = Vec::new();
    for key in &keys {
        if let Ok(val) = redis.get::<_, String>(key).await {
            // key: "contractor:{uuid}:pos", val: "{lat},{lng}"
            let parts: Vec<&str> = key.split(':').collect();
            if parts.len() == 3 {
                if let Ok(id) = Uuid::parse_str(parts[1]) {
                    let coords: Vec<&str> = val.split(',').collect();
                    if coords.len() == 2 {
                        if let (Ok(lat), Ok(lng)) =
                            (coords[0].parse::<f64>(), coords[1].parse::<f64>())
                        {
                            contractors.push(ContractorPosition { contractor_id: id, lat, lng });
                        }
                    }
                }
            }
        }
    }
    WsEvent::Snapshot { contractors }
}
