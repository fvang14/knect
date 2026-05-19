"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    redirect("/login?error=Invalid+email+or+password");
  }

  const data = await res.json();
  const session = await getSession();
  session.access_token = data.access_token;
  session.refresh_token = data.refresh_token;
  await session.save();

  redirect("/");
}
