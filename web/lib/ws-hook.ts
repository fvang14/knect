"use client";

import { useEffect, useRef, useCallback } from "react";
import type { WsEvent } from "./types";

const MAX_BACKOFF_MS = 30_000;

export function useWebSocket(
  token: string | null,
  onMessage: (event: WsEvent) => void,
  onConnectionChange: (connected: boolean) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1_000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  const onConnRef = useRef(onConnectionChange);

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onConnRef.current = onConnectionChange; }, [onConnectionChange]);

  const connect = useCallback(() => {
    if (!token || wsRef.current) return;

    const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";
    const ws = new WebSocket(`${WS_URL}/ws?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      backoffRef.current = 1_000;
      onConnRef.current(true);
    };

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as WsEvent;
        onMessageRef.current(event);
      } catch {
        // ignore malformed frames
      }
    };

    ws.onerror = () => ws.close();

    ws.onclose = () => {
      wsRef.current = null;
      onConnRef.current(false);
      timerRef.current = setTimeout(() => {
        connect();
      }, backoffRef.current);
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
    };
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);
}
