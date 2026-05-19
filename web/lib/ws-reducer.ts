import type { ActiveJob, WsEvent } from "./types";

export interface WsState {
  contractors: Map<string, { lat: number; lng: number }>;
  activeJob: ActiveJob | null;
}

export type WsAction =
  | WsEvent
  | { type: "set_active_job"; job: ActiveJob | null };

export function applyWsEvent(state: WsState, action: WsAction): WsState {
  switch (action.type) {
    case "snapshot":
      return {
        ...state,
        contractors: new Map(
          action.contractors.map((c) => [
            c.contractor_id,
            { lat: c.lat, lng: c.lng },
          ])
        ),
      };

    case "location_update": {
      const next = new Map(state.contractors);
      next.set(action.contractor_id, { lat: action.lat, lng: action.lng });
      return { ...state, contractors: next };
    }

    case "job_accepted":
      return {
        ...state,
        activeJob:
          state.activeJob?.id === action.job_id
            ? { ...state.activeJob, status: "accepted" as const }
            : state.activeJob,
      };

    case "job_denied":
      return {
        ...state,
        activeJob:
          state.activeJob?.id === action.job_id
            ? { ...state.activeJob, status: "denied" as const }
            : state.activeJob,
      };

    case "job_completed":
      return {
        ...state,
        activeJob:
          state.activeJob?.id === action.job_id
            ? { ...state.activeJob, status: "completed" as const }
            : state.activeJob,
      };

    case "job_cancelled":
      return {
        ...state,
        activeJob:
          state.activeJob?.id === action.job_id ? null : state.activeJob,
      };

    case "set_active_job":
      return { ...state, activeJob: action.job };

    default:
      return state;
  }
}
