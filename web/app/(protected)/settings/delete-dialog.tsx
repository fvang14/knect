"use client";

import { useState } from "react";

interface DeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  userEmail: string;
  isDeleting: boolean;
  error: string | null;
}

export function DeleteDialog({
  isOpen,
  onClose,
  onConfirm,
  userEmail,
  isDeleting,
  error,
}: DeleteDialogProps) {
  const [confirmEmail, setConfirmEmail] = useState("");

  if (!isOpen) return null;

  const isValid = confirmEmail === userEmail;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white border border-warm-border rounded-card-lg max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <h2 className="text-xl font-bold text-red-600 m-0">Delete Account</h2>
        <p className="mt-3 text-sm text-slate-500 leading-relaxed">
          Warning: This action is permanent and cannot be undone. All your profile data, jobs, active requests, and quote details will be deleted immediately.
        </p>
        <p className="mt-2 text-sm text-slate-700 font-medium">
          Please type your email <span className="underline select-all">{userEmail}</span> to confirm.
        </p>

        <input
          type="text"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          placeholder={userEmail}
          className="mt-4 w-full px-3.5 py-2 text-sm border border-warm-border rounded-lg outline-none focus:border-red-500 transition-colors"
        />

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-warm-border rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isValid || isDeleting}
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isDeleting ? "Deleting..." : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
