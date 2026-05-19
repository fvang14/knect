import { getSession } from "./session";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getSession();
  if (!session.jwt) throw new Error("Not authenticated");

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.jwt}`,
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(`API returned ${res.status}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  metrics: () => apiFetch<import("./types").Metrics>("/admin/metrics"),
  users: () => apiFetch<import("./types").UserSummary[]>("/admin/users"),
  jobs: () => apiFetch<import("./types").JobSummary[]>("/admin/jobs"),
  suspendUser: (id: string) =>
    apiFetch<void>(`/admin/users/${id}/suspend`, { method: "PUT" }),
};
