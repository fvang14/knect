import { getSession } from "./session";
import { MeUser } from "./me";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export async function fetchMe(): Promise<MeUser | null> {
  try {
    const session = await getSession();
    if (!session.access_token) return null;

    const res = await fetch(`${API_URL}/me`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) return null;
    return res.json() as Promise<MeUser>;
  } catch {
    return null;
  }
}
