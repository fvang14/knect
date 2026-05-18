"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const API_URL = process.env.API_URL ?? "http://localhost:3000";
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    redirect("/login?error=Invalid+credentials");
  }

  const data = await res.json();
  const session = await getSession();
  session.jwt = data.token;
  await session.save();

  redirect("/");
}
