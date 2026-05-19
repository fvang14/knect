"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export async function registerAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const display_name = formData.get("display_name") as string;

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name, role: "customer" }),
  });

  if (res.status === 409) {
    redirect("/register?error=Email+already+registered");
  }
  if (!res.ok) {
    redirect("/register?error=Registration+failed");
  }

  const data = await res.json();
  const session = await getSession();
  session.access_token = data.access_token;
  session.refresh_token = data.refresh_token;
  await session.save();

  redirect("/");
}
