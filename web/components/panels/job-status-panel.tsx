"use client";

import { useEffect, useState } from "react";
import { Clock, Check, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useJob } from "@/components/providers/providers";
import { api } from "@/lib/api-client";
import { RatingPanel } from "./rating-panel";
import type { JobDetail } from "@/lib/types";

interface SheetConfig {
  Icon: LucideIcon;
  tintBg: string;
  tintFg: string;
  title: string;
}

const SHEET_CONFIG: Record<string, SheetConfig> = {
  pending: {
    Icon: Clock,
    tintBg: "#fef3c7",
    tintFg: "#92400e",
    title: "Waiting for contractor…",
  },
  accepted: {
    Icon: Check,
    tintBg: "#dcfce7",
    tintFg: "#047857",
    title: "On their way!",
  },
  in_progress: {
    Icon: Wrench,
    tintBg: "#eff6ff",
    tintFg: "#1d4ed8",
    title: "Job in progress",
  },
  completed: {
    Icon: Check,
    tintBg: "#f1f5f9",
    tintFg: "#475569",
    title: "Job complete",
  },
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

  if (isTerminal) {
    return (
      <aside
        role="complementary"
        className="fixed bottom-8 right-8 w-[380px] z-30 bg-white rounded-card-lg"
        style={{ boxShadow: "0 18px 40px -16px rgba(15,23,42,0.22), 0 4px 12px -4px rgba(15,23,42,0.1)" }}
      >
        <div className="p-5">
          <p className="text-sm text-slate-600 mb-4">
            {status === "denied"
              ? "The contractor is unavailable. You can request a different contractor."
              : "Job cancelled — contractor went offline."}
          </p>
          <button
            onClick={() => setActiveJob(null)}
            className="w-full bg-slate-100 text-slate-700 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </aside>
    );
  }

  const config = SHEET_CONFIG[status];
  if (!config) return null;
  const { Icon, tintBg, tintFg, title } = config;

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

  return (
    <aside
      role="complementary"
      className="fixed bottom-8 right-8 w-[380px] z-30 bg-white rounded-card-lg overflow-hidden"
      style={{ boxShadow: "0 18px 40px -16px rgba(15,23,42,0.22), 0 4px 12px -4px rgba(15,23,42,0.1)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: tintBg }}>
        <span
          className="inline-flex items-center justify-center rounded-full w-9 h-9 flex-shrink-0"
          style={{ background: tintBg, color: tintFg, border: `1.5px solid ${tintFg}20` }}
        >
          <Icon size={18} />
        </span>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: tintFg }}>
            {status.replace("_", " ")}
          </div>
          <div className="text-[15px] font-semibold text-slate-900 leading-tight">{title}</div>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col gap-3">
        {status === "pending" && (
          <>
            <p className="text-sm text-slate-500">Typically responds within 60 seconds.</p>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full border border-red-300 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {cancelling ? "Cancelling…" : "Cancel Request"}
            </button>
          </>
        )}

        {status === "accepted" && (
          <>
            <p className="text-sm text-slate-500">Your pro is on the way.</p>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full border border-warm-border text-slate-600 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {cancelling ? "Cancelling…" : "Cancel Request"}
            </button>
          </>
        )}

        {status === "in_progress" && jobDetail?.quote && (
          <div className="border border-warm-border rounded-[10px] p-3 text-sm bg-warm-muted">
            <p className="font-medium text-slate-700 mb-1">Quote from contractor</p>
            {jobDetail.quote.custom_amount != null ? (
              <p>
                <span className="font-semibold text-slate-900 tabular-nums">
                  ${jobDetail.quote.custom_amount}
                </span>
                {jobDetail.quote.custom_note && (
                  <span className="text-slate-500 ml-1">— {jobDetail.quote.custom_note}</span>
                )}
              </p>
            ) : jobDetail.quote.base_rate_snapshot != null ? (
              <p>
                Base rate:{" "}
                <span className="font-semibold text-slate-900 tabular-nums">
                  ${jobDetail.quote.base_rate_snapshot}
                </span>
              </p>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}
