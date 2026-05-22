"use client";

import { useWsStatus, useAuth } from "@/components/providers/providers";

export function ReconnectingBanner() {
  const { connected } = useWsStatus();
  const { token } = useAuth();
  if (connected || !token) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-400 text-yellow-900 text-sm text-center py-1 font-medium">
      Reconnecting to live updates…
    </div>
  );
}
