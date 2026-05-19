"use client";

import { useEffect, useState } from "react";
import { useJob } from "@/components/providers/providers";
import { api } from "@/lib/api-client";
import { RatingPanel } from "./rating-panel";
import type { JobDetail } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  pending: "Waiting for contractor…",
  accepted: "Contractor accepted!",
  denied: "Request denied",
  in_progress: "Job in progress",
  completed: "Job completed",
  cancelled: "Job cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  accepted: "bg-green-100 text-green-800",
  denied: "bg-red-100 text-red-800",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-gray-100 text-gray-800",
  cancelled: "bg-gray-100 text-gray-500",
};

export function JobStatusPanel() {
  const { activeJob, setActiveJob } = useJob();
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [rated, setRated] = useState(false);

  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === "accepted" || activeJob.status === "in_progress") {
      api.getJob(activeJob.id).then(setJobDetail).catch(() => {});
    }
  }, [activeJob?.id, activeJob?.status]);

  if (!activeJob) return null;

  const status = activeJob.status;
  const isTerminal = ["denied", "cancelled"].includes(status);

  const handleCancel = async () => {
    if (!activeJob) return;
    setCancelling(true);
    try {
      await api.cancelJob(activeJob.id);
      setActiveJob(null);
    } catch {
      setCancelling(false);
    }
  };

  const handleDismiss = () => setActiveJob(null);

  if (status === "completed" && !rated) {
    return (
      <RatingPanel
        jobId={activeJob.id}
        onRated={() => {
          setRated(true);
          setActiveJob(null);
        }}
      />
    );
  }

  return (
    <div className="fixed right-0 top-14 bottom-0 w-full max-w-sm bg-white shadow-xl z-30 overflow-y-auto">
      <div className="p-4 space-y-4">
        <h2 className="font-semibold text-lg">Job Status</h2>

        <span
          className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${
            STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"
          }`}
        >
          {STATUS_LABELS[status] ?? status}
        </span>

        {jobDetail?.quote && (
          <div className="border rounded p-3 space-y-1 text-sm">
            <p className="font-medium text-gray-700">Quote from contractor</p>
            {jobDetail.quote.custom_amount != null ? (
              <p>
                <span className="font-semibold">
                  ${jobDetail.quote.custom_amount}
                </span>
                {jobDetail.quote.custom_note && (
                  <span className="text-gray-500 ml-1">
                    — {jobDetail.quote.custom_note}
                  </span>
                )}
              </p>
            ) : jobDetail.quote.base_rate_snapshot != null ? (
              <p>
                Base rate:{" "}
                <span className="font-semibold">
                  ${jobDetail.quote.base_rate_snapshot}
                </span>
              </p>
            ) : null}
          </div>
        )}

        {status === "denied" && (
          <p className="text-sm text-gray-600">
            The contractor is unavailable. You can request a different contractor.
          </p>
        )}

        {status === "cancelled" && (
          <p className="text-sm text-gray-600">
            Job cancelled — contractor went offline.
          </p>
        )}

        <div className="pt-2 flex gap-2">
          {status === "pending" && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex-1 border border-red-300 text-red-600 py-2 rounded text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {cancelling ? "Cancelling…" : "Cancel Request"}
            </button>
          )}
          {isTerminal && (
            <button
              onClick={handleDismiss}
              className="flex-1 bg-gray-100 text-gray-700 py-2 rounded text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
