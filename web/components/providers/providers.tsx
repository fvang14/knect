"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import type { ActiveJob } from "@/lib/types";
import { applyWsEvent, WsState } from "@/lib/ws-reducer";
import { useWebSocket } from "@/lib/ws-hook";
import { setClientToken, apiFetch } from "@/lib/api-client";
import { MeUser } from "@/lib/me";

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
interface MeUserCtxValue {
  meUser: MeUser | null;
  setMeUser: React.Dispatch<React.SetStateAction<MeUser | null>>;
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
const MeUserCtx = createContext<MeUserCtxValue>({
  meUser: null,
  setMeUser: () => {},
});

export const useAuth = () => useContext(AuthCtx);
export const useMapContractors = () => useContext(MapCtx);
export const useJob = () => useContext(JobCtx);
export const useWsStatus = () => useContext(WsCtx);
export const useMeUser = () => useContext(MeUserCtx);

// ─── Providers ───────────────────────────────────────────────────────────────

const INITIAL_STATE: WsState = { contractors: new Map(), activeJob: null };

export function Providers({
  children,
  initialMeUser,
}: {
  children: React.ReactNode;
  initialMeUser: MeUser | null;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [state, dispatch] = useReducer(applyWsEvent, INITIAL_STATE);
  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set());
  const [meUser, setMeUser] = useState<MeUser | null>(initialMeUser);
  const [hasCheckedSession, setHasCheckedSession] = useState(false);
  const pathname = usePathname();

  // Hydrate token on mount or on route navigation
  useEffect(() => {
    fetch("/api/session")
      .then((r) => {
        return r.json();
      })
      .then((d) => {
        if (d.access_token) {
          setToken(d.access_token);
          setClientToken(d.access_token);
        } else {
          setToken(null);
          setClientToken(null);
        }
      })
      .catch((err) => {
        console.error("Providers [useEffect pathname]: /api/session fetch failed:", err);
        setToken(null);
        setClientToken(null);
      })
      .finally(() => {
        setHasCheckedSession(true);
      });
  }, [pathname]);

  // Sync meUser when token changes client-side
  useEffect(() => {
    if (token) {
      apiFetch<MeUser>("/me")
        .then((user) => {
          setMeUser(user);
        })
        .catch((err) => {
          console.error("Providers [useEffect token]: apiFetch(/me) failed:", err);
          setMeUser(null);
        });
    } else if (hasCheckedSession) {
      setMeUser(null);
    }
  }, [token, hasCheckedSession]);

  // Sync token from API client updates (e.g., after silent refresh)
  useEffect(() => {
    const handleTokenChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setToken(customEvent.detail);
    };

    window.addEventListener("knect-token-changed", handleTokenChange);
    return () => {
      window.removeEventListener("knect-token-changed", handleTokenChange);
    };
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
            <MeUserCtx.Provider value={{ meUser, setMeUser }}>
              {children}
            </MeUserCtx.Provider>
          </WsCtx.Provider>
        </JobCtx.Provider>
      </MapCtx.Provider>
    </AuthCtx.Provider>
  );
}
