"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react";
import type { ActiveJob } from "@/lib/types";
import { applyWsEvent, WsState } from "@/lib/ws-reducer";
import { useWebSocket } from "@/lib/ws-hook";
import { setClientToken } from "@/lib/api-client";

// ─── Contexts ────────────────────────────────────────────────────────────────

interface AuthCtxValue {
  token: string | null;
}
interface MapCtxValue {
  contractors: Map<string, { lat: number; lng: number }>;
  availableIds: Set<string>;
  setAvailableIds: (ids: Set<string>) => void;
}
interface JobCtxValue {
  activeJob: ActiveJob | null;
  setActiveJob: (job: ActiveJob | null) => void;
}
interface WsCtxValue {
  connected: boolean;
}

const AuthCtx = createContext<AuthCtxValue>({ token: null });
const MapCtx = createContext<MapCtxValue>({
  contractors: new Map(),
  availableIds: new Set(),
  setAvailableIds: () => {},
});
const JobCtx = createContext<JobCtxValue>({
  activeJob: null,
  setActiveJob: () => {},
});
const WsCtx = createContext<WsCtxValue>({ connected: false });

export const useAuth = () => useContext(AuthCtx);
export const useMapContractors = () => useContext(MapCtx);
export const useJob = () => useContext(JobCtx);
export const useWsStatus = () => useContext(WsCtx);

// ─── Providers ───────────────────────────────────────────────────────────────

const INITIAL_STATE: WsState = { contractors: new Map(), activeJob: null };

export function Providers({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [state, dispatch] = useReducer(applyWsEvent, INITIAL_STATE);
  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set());

  // Hydrate token on mount
  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((d) => {
        if (d.access_token) {
          setToken(d.access_token);
          setClientToken(d.access_token);
        }
      })
      .catch(() => {});
  }, []);

  const handleMessage = useCallback(
    (event: Parameters<typeof applyWsEvent>[1]) => {
      dispatch(event);
    },
    []
  );

  useWebSocket(token, handleMessage, setWsConnected);

  const setActiveJob = useCallback((job: ActiveJob | null) => {
    dispatch({ type: "set_active_job", job });
  }, []);

  return (
    <AuthCtx.Provider value={{ token }}>
      <MapCtx.Provider
        value={{
          contractors: state.contractors,
          availableIds,
          setAvailableIds,
        }}
      >
        <JobCtx.Provider value={{ activeJob: state.activeJob, setActiveJob }}>
          <WsCtx.Provider value={{ connected: wsConnected }}>
            {children}
          </WsCtx.Provider>
        </JobCtx.Provider>
      </MapCtx.Provider>
    </AuthCtx.Provider>
  );
}
