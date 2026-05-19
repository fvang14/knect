import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  if (!session.refresh_token) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });

  if (!res.ok) {
    session.destroy();
    return NextResponse.json({ error: "Refresh failed" }, { status: 401 });
  }

  const data = await res.json();
  session.access_token = data.access_token;
  session.refresh_token = data.refresh_token;
  await session.save();

  return NextResponse.json({ access_token: data.access_token });
}
