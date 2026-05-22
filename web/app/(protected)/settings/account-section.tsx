"use client";

import { useState } from "react";
import { useMeUser } from "@/components/providers/providers";
import { changePassword, updateEmail } from "./actions";

export function AccountSection() {
  const { meUser, setMeUser } = useMeUser();
  const [email, setEmail] = useState(meUser?.email ?? "");
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (!meUser) return null;

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!meUser) return;
    if (!email.trim() || email === meUser.email) return;

    setIsSavingEmail(true);
    setEmailMsg(null);

    const res = await updateEmail(email.trim());
    setIsSavingEmail(false);

    if (res.success) {
      setMeUser({ ...meUser, email: email.trim() });
      setEmailMsg({ type: "success", text: "Email updated successfully" });
    } else {
      setEmailMsg({ type: "error", text: res.error || "Failed to update email" });
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    if (newPassword.length < 8) {
      setPasswordMsg({ type: "error", text: "New password must be at least 8 characters" });
      return;
    }

    setIsSavingPassword(true);
    setPasswordMsg(null);

    const res = await changePassword(currentPassword, newPassword);
    setIsSavingPassword(false);

    if (res.success) {
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMsg({ type: "success", text: "Password changed successfully" });
    } else {
      setPasswordMsg({ type: "error", text: res.error || "Failed to change password" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Email form */}
      <div className="bg-white border border-warm-border rounded-card p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 m-0">Email Address</h2>
        <p className="mt-1 text-sm text-slate-500">Update your email address.</p>

        <form onSubmit={handleEmailSubmit} className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-warm-border rounded-lg outline-none focus:border-blue-500 transition-colors"
              required
            />
          </div>

          {emailMsg && (
            <p
              className={`text-sm px-3.5 py-2 rounded-lg border m-0 ${
                emailMsg.type === "success"
                  ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                  : "text-red-700 bg-red-50 border-red-100"
              }`}
            >
              {emailMsg.text}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingEmail || email === meUser.email}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-default transition-colors"
            >
              {isSavingEmail ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Password form */}
      <div className="bg-white border border-warm-border rounded-card p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 m-0">Change Password</h2>
        <p className="mt-1 text-sm text-slate-500">Change your password.</p>

        <form onSubmit={handlePasswordSubmit} className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-warm-border rounded-lg outline-none focus:border-blue-500 transition-colors"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-warm-border rounded-lg outline-none focus:border-blue-500 transition-colors"
              required
            />
          </div>

          {passwordMsg && (
            <p
              className={`text-sm px-3.5 py-2 rounded-lg border m-0 ${
                passwordMsg.type === "success"
                  ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                  : "text-red-700 bg-red-50 border-red-100"
              }`}
            >
              {passwordMsg.text}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingPassword || !currentPassword || !newPassword}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-default transition-colors"
            >
              {isSavingPassword ? "Saving..." : "Change password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
