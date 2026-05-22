"use client";

import { useState } from "react";
import { useMeUser } from "@/components/providers/providers";
import { deleteAccount, signOut } from "./actions";
import { DeleteDialog } from "./delete-dialog";

export function DangerSection() {
  const { meUser } = useMeUser();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSignOut, setIsSignOut] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!meUser) return null;

  async function handleSignOut() {
    setIsSignOut(true);
    await signOut();
  }

  async function handleDeleteConfirm() {
    setIsDeleting(true);
    setError(null);
    const res = await deleteAccount();
    if (res && res.error) {
      setError(res.error);
      setIsDeleting(false);
    }
  }

  return (
    <div className="bg-white border border-warm-border rounded-card p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900 m-0">Danger Zone</h2>
      <p className="mt-1 text-sm text-slate-500">Actions that can permanently affect your account.</p>

      <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-warm-line pt-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 m-0">Sign out</h3>
          <p className="mt-0.5 text-xs text-slate-500">Sign out of your session on this device.</p>
        </div>
        <button
          onClick={handleSignOut}
          disabled={isSignOut}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-warm-border rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {isSignOut ? "Signing out..." : "Sign out"}
        </button>
      </div>

      <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-warm-line pt-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 m-0">Delete account</h3>
          <p className="mt-0.5 text-xs text-slate-500">Permanently delete your Knect account and all related data.</p>
        </div>
        <button
          onClick={() => {
            setError(null);
            setDialogOpen(true);
          }}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
        >
          Delete account
        </button>
      </div>

      <DeleteDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        userEmail={meUser.email}
        isDeleting={isDeleting}
        error={error}
      />
    </div>
  );
}
