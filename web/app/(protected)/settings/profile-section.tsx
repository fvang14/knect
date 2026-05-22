"use client";

import { useState } from "react";
import { useMeUser } from "@/components/providers/providers";
import { Avatar } from "@/components/ui/avatar";
import { avatarUrl } from "@/lib/me";
import { deleteAvatar, updateProfile, uploadAvatar } from "./actions";

export function ProfileSection() {
  const { meUser, setMeUser } = useMeUser();
  const [displayName, setDisplayName] = useState(meUser?.display_name ?? "");
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [avatarMsg, setAvatarMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (!meUser) return null;

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!meUser) return;
    if (!displayName.trim() || displayName === meUser.display_name) return;

    setIsSavingName(true);
    setProfileMsg(null);

    const res = await updateProfile(displayName.trim());
    setIsSavingName(false);

    if (res.success) {
      setMeUser({ ...meUser, display_name: displayName.trim() });
      setProfileMsg({ type: "success", text: "Profile updated successfully" });
    } else {
      setProfileMsg({ type: "error", text: res.error || "Failed to update profile" });
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!meUser) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setAvatarMsg({ type: "error", text: "File is too large. Max size is 2MB." });
      return;
    }

    setIsUploading(true);
    setAvatarMsg(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await uploadAvatar(formData);
    setIsUploading(false);

    if (res.success) {
      setMeUser({
        ...meUser,
        has_avatar: true,
        avatar_updated_at: new Date().toISOString(),
      });
      setAvatarMsg({ type: "success", text: "Avatar uploaded successfully" });
    } else {
      setAvatarMsg({ type: "error", text: res.error || "Failed to upload avatar" });
    }
  }

  async function handleAvatarDelete() {
    if (!meUser) return;
    setIsDeleting(true);
    setAvatarMsg(null);

    const res = await deleteAvatar();
    setIsDeleting(false);

    if (res.success) {
      setMeUser({
        ...meUser,
        has_avatar: false,
        avatar_updated_at: null,
      });
      setAvatarMsg({ type: "success", text: "Avatar removed successfully" });
    } else {
      setAvatarMsg({ type: "error", text: res.error || "Failed to remove avatar" });
    }
  }

  return (
    <div className="bg-white border border-warm-border rounded-card p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900 m-0">Profile Settings</h2>
      <p className="mt-1 text-sm text-slate-500">Update your public profile details.</p>

      {/* Avatar Sub-section */}
      <div className="mt-6 flex flex-col sm:flex-row items-center gap-5 border-b border-warm-line pb-6">
        <div className="relative">
          <Avatar
            name={meUser.display_name}
            size={80}
            palette="green"
            src={meUser.has_avatar ? avatarUrl(meUser.id, meUser.avatar_updated_at) : null}
          />
        </div>
        <div className="flex flex-col gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-3">
            <label
              htmlFor="avatar-upload"
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors shadow-sm inline-flex items-center justify-center min-w-[100px]"
            >
              {isUploading ? "Uploading..." : "Upload photo"}
            </label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/png, image/jpeg, image/webp"
              onChange={handleAvatarChange}
              disabled={isUploading || isDeleting}
              className="hidden"
            />
            {meUser.has_avatar && (
              <button
                type="button"
                onClick={handleAvatarDelete}
                disabled={isUploading || isDeleting}
                className="px-3.5 py-1.5 text-red-600 bg-red-50 hover:bg-red-100 text-xs font-semibold rounded-lg border border-red-100 cursor-pointer transition-colors min-w-[100px]"
              >
                {isDeleting ? "Removing..." : "Remove"}
              </button>
            )}
          </div>
          <p className="m-0 text-xs text-slate-400">JPG, PNG, or WebP. Max 2MB.</p>
          {avatarMsg && (
            <p
              className={`text-xs px-2.5 py-1 rounded-md border m-0 ${
                avatarMsg.type === "success"
                  ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                  : "text-red-700 bg-red-50 border-red-100"
              }`}
            >
              {avatarMsg.text}
            </p>
          )}
        </div>
      </div>

      {/* Profile Details Form */}
      <form onSubmit={handleProfileSubmit} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3.5 py-2 text-sm border border-warm-border rounded-lg outline-none focus:border-blue-500 transition-colors"
            maxLength={80}
            required
          />
        </div>

        {profileMsg && (
          <p
            className={`text-sm px-3.5 py-2 rounded-lg border m-0 ${
              profileMsg.type === "success"
                ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                : "text-red-700 bg-red-50 border-red-100"
            }`}
          >
            {profileMsg.text}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSavingName || !displayName.trim() || displayName === meUser.display_name}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-default transition-colors shadow-sm"
          >
            {isSavingName ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
