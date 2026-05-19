"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";

export async function suspendUserAction(userId: string) {
  await api.suspendUser(userId);
  revalidatePath("/users");
}
