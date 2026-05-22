export interface MeUser {
  id: string;
  email: string;
  role: "customer" | "contractor";
  display_name: string;
  has_avatar: boolean;
  avatar_updated_at: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export function avatarUrl(userId: string, avatarUpdatedAt?: string | null): string {
  if (!avatarUpdatedAt) return "";
  const bust = new Date(avatarUpdatedAt).getTime();
  return `${API_URL}/users/${userId}/avatar?t=${bust}`;
}
