import { getSession } from "./session";
import type { CustomerJobListItem, NearbyContractor, PublicContractorProfile } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

async function serverFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getSession();
  if (!session.access_token) throw new Error("Not authenticated");

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

export const serverApi = {
  listJobs: () => serverFetch<CustomerJobListItem[]>("/jobs"),
  contractorProfile: (id: string) =>
    serverFetch<PublicContractorProfile>(`/contractors/${id}`),
  nearbyContractors: async (lat: number, lng: number, radius = 5000): Promise<NearbyContractor[]> => {
    try {
      const res = await fetch(
        `${API_URL}/contractors/nearby?lat=${lat}&lng=${lng}&radius=${radius}`,
        { cache: "no-store" }
      );
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
  },
};
