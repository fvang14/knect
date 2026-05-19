import { applyWsEvent, WsState } from "@/lib/ws-reducer";
import type { ActiveJob } from "@/lib/types";

const emptyState: WsState = {
  contractors: new Map(),
  activeJob: null,
};

const jobA: ActiveJob = { id: "job-1", status: "pending", quote: null };

describe("applyWsEvent", () => {
  test("snapshot replaces all contractor positions", () => {
    const next = applyWsEvent(emptyState, {
      type: "snapshot",
      contractors: [
        { contractor_id: "c1", lat: 40.7, lng: -74.0 },
        { contractor_id: "c2", lat: 40.8, lng: -73.9 },
      ],
    });
    expect(next.contractors.size).toBe(2);
    expect(next.contractors.get("c1")).toEqual({ lat: 40.7, lng: -74.0 });
    expect(next.contractors.get("c2")).toEqual({ lat: 40.8, lng: -73.9 });
  });

  test("snapshot with no contractors clears the map", () => {
    const state: WsState = {
      contractors: new Map([["c1", { lat: 1, lng: 2 }]]),
      activeJob: null,
    };
    const next = applyWsEvent(state, { type: "snapshot", contractors: [] });
    expect(next.contractors.size).toBe(0);
  });

  test("location_update updates a specific contractor", () => {
    const state: WsState = {
      contractors: new Map([["c1", { lat: 40.7, lng: -74.0 }]]),
      activeJob: null,
    };
    const next = applyWsEvent(state, {
      type: "location_update",
      contractor_id: "c1",
      lat: 40.75,
      lng: -74.05,
    });
    expect(next.contractors.get("c1")).toEqual({ lat: 40.75, lng: -74.05 });
  });

  test("location_update adds a new contractor not previously in map", () => {
    const next = applyWsEvent(emptyState, {
      type: "location_update",
      contractor_id: "new",
      lat: 1,
      lng: 2,
    });
    expect(next.contractors.get("new")).toEqual({ lat: 1, lng: 2 });
  });

  test("job_accepted sets status to accepted for matching job", () => {
    const state = { ...emptyState, activeJob: jobA };
    const next = applyWsEvent(state, { type: "job_accepted", job_id: "job-1" });
    expect(next.activeJob?.status).toBe("accepted");
  });

  test("job_accepted ignores events for different job", () => {
    const state = { ...emptyState, activeJob: jobA };
    const next = applyWsEvent(state, { type: "job_accepted", job_id: "job-99" });
    expect(next.activeJob?.status).toBe("pending");
  });

  test("job_denied sets status to denied", () => {
    const state = { ...emptyState, activeJob: jobA };
    const next = applyWsEvent(state, { type: "job_denied", job_id: "job-1" });
    expect(next.activeJob?.status).toBe("denied");
  });

  test("job_completed sets status to completed", () => {
    const state = { ...emptyState, activeJob: jobA };
    const next = applyWsEvent(state, { type: "job_completed", job_id: "job-1" });
    expect(next.activeJob?.status).toBe("completed");
  });

  test("job_cancelled clears activeJob", () => {
    const state = { ...emptyState, activeJob: jobA };
    const next = applyWsEvent(state, { type: "job_cancelled", job_id: "job-1" });
    expect(next.activeJob).toBeNull();
  });

  test("job_cancelled ignores events for different job", () => {
    const state = { ...emptyState, activeJob: jobA };
    const next = applyWsEvent(state, { type: "job_cancelled", job_id: "job-99" });
    expect(next.activeJob).toEqual(jobA);
  });

  test("set_active_job sets the active job", () => {
    const next = applyWsEvent(emptyState, {
      type: "set_active_job",
      job: jobA,
    });
    expect(next.activeJob).toEqual(jobA);
  });

  test("set_active_job with null clears the active job", () => {
    const state = { ...emptyState, activeJob: jobA };
    const next = applyWsEvent(state, { type: "set_active_job", job: null });
    expect(next.activeJob).toBeNull();
  });

  test("does not mutate the original state", () => {
    const orig = new Map([["c1", { lat: 1, lng: 2 }]]);
    const state: WsState = { contractors: orig, activeJob: null };
    applyWsEvent(state, {
      type: "location_update",
      contractor_id: "c1",
      lat: 99,
      lng: 99,
    });
    expect(orig.get("c1")).toEqual({ lat: 1, lng: 2 });
  });
});
