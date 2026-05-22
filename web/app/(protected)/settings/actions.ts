"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

async function authenticatedFetch(path: string, options: RequestInit = {}) {
  const session = await getSession();
  if (!session.access_token) {
    throw new Error("Unauthorized");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${session.access_token}`);

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  return res;
}

export async function updateProfile(displayName: string) {
  try {
    const res = await authenticatedFetch("/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: displayName }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { error: errData.message || "Failed to update profile" };
    }

    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Something went wrong" };
  }
}

export async function updateEmail(email: string) {
  try {
    const res = await authenticatedFetch("/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { error: errData.message || "Failed to update email" };
    }

    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Something went wrong" };
  }
}

export async function changePassword(current: string, newPass: string) {
  try {
    const res = await authenticatedFetch("/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current, new: newPass }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { error: errData.message || "Failed to change password" };
    }

    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Something went wrong" };
  }
}

export async function uploadAvatar(formData: FormData) {
  try {
    const res = await authenticatedFetch("/me/avatar", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { error: errData.message || "Failed to upload avatar" };
    }

    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Something went wrong" };
  }
}

export async function deleteAvatar() {
  try {
    const res = await authenticatedFetch("/me/avatar", {
      method: "DELETE",
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { error: errData.message || "Failed to delete avatar" };
    }

    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Something went wrong" };
  }
}

export async function signOut() {
  const session = await getSession();
  await session.destroy();
  redirect("/login");
}

export async function deleteAccount() {
  let success = false;
  try {
    const res = await authenticatedFetch("/me", {
      method: "DELETE",
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { error: errData.message || "Failed to delete account" };
    }
    success = true;
  } catch (err: any) {
    return { error: err.message || "Something went wrong" };
  }

  if (success) {
    const session = await getSession();
    await session.destroy();
    redirect("/register");
  }
}
