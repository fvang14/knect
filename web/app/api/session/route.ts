import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session.access_token) {
    return NextResponse.json({ access_token: null }, { status: 401 });
  }
  return NextResponse.json({ access_token: session.access_token });
}
