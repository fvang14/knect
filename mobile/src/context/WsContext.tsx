import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { WsEvent, WsEventType } from '@/lib/types';

const WS_BASE = process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:8080';
const MAX_BACKOFF_MS = 30_000;

type Subscriber = (event: WsEvent) => void;

interface WsState {
  connected: boolean;
  subscribe: (eventType: WsEventType, callback: Subscriber) => () => void;
}

const WsContext = createContext<WsState | null>(null);

export function WsProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1_000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribersRef = useRef(new Map<string, Set<Subscriber>>());

  function subscribe(eventType: WsEventType, callback: Subscriber): () => void {
    const map = subscribersRef.current;
    if (!map.has(eventType)) map.set(eventType, new Set());
    map.get(eventType)!.add(callback);
    return () => map.get(eventType)?.delete(callback);
  }

  useEffect(() => {
    if (!accessToken) return;

    function connect() {
      if (wsRef.current) return;
      const ws = new WebSocket(`${WS_BASE}/ws?token=${accessToken}`);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 1_000;
        setConnected(true);
      };

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data as string) as WsEvent;
          subscribersRef.current.get(event.type)?.forEach((cb) => cb(event));
        } catch {}
      };

      ws.onerror = () => ws.close();

      ws.onclose = () => {
        wsRef.current = null;
        setConnected(false);
        timerRef.current = setTimeout(connect, backoffRef.current);
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      };
    }

    connect();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [accessToken]);

  return (
    <WsContext.Provider value={{ connected, subscribe }}>
      {children}
    </WsContext.Provider>
  );
}

export function useWs(): WsState {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error('useWs must be used within WsProvider');
  return ctx;
}
