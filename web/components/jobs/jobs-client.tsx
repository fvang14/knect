"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import type { CustomerJobListItem, JobStatus } from "@/lib/types";

const PALETTES = ["blue", "green", "amber", "rose", "mint", "violet"] as const;

function paletteFor(id: string): typeof PALETTES[number] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_PILL: Record<JobStatus, { bg: string; fg: string; label: string }> = {
  pending:     { bg: "#fef3c7", fg: "#92400e", label: "Pending" },
  accepted:    { bg: "#fef3c7", fg: "#92400e", label: "Accepted" },
  in_progress: { bg: "#eff6ff", fg: "#1d4ed8", label: "In progress" },
  completed:   { bg: "#f1f5f9", fg: "#475569", label: "Completed" },
  cancelled:   { bg: "#fef2f2", fg: "#b91c1c", label: "Cancelled" },
  denied:      { bg: "#fef2f2", fg: "#b91c1c", label: "Denied" },
};

const ACTIVE_STATUSES: JobStatus[] = ["pending", "accepted", "in_progress"];

type FilterKey = "all" | "active" | "completed" | "cancelled";

const FILTERS: { key: FilterKey; label: string; match: (s: JobStatus) => boolean }[] = [
  { key: "all",       label: "All",       match: () => true },
  { key: "active",    label: "Active",    match: (s) => ACTIVE_STATUSES.includes(s) },
  { key: "completed", label: "Completed", match: (s) => s === "completed" },
  { key: "cancelled", label: "Cancelled", match: (s) => s === "cancelled" || s === "denied" },
];

interface JobsClientProps {
  jobs: CustomerJobListItem[];
  totalSpent: number | null;
}

export function JobsClient({ jobs, totalSpent }: JobsClientProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const visible = jobs.filter((j) =>
    FILTERS.find((f) => f.key === activeFilter)!.match(j.status)
  );

  return (
    <div className="max-w-[1100px] mx-auto px-8 py-8">
      {/* Hero */}
      <h1 className="text-[30px] font-bold text-slate-900 tracking-[-0.022em] m-0">My jobs</h1>
      <p className="mt-1 text-sm text-slate-500">
        {jobs.length} jobs{totalSpent != null ? ` · $${totalSpent.toLocaleString()} spent in 2025` : ""}
      </p>

      {/* Filter chips */}
      <div className="flex gap-1.5 mt-5 mb-6 flex-wrap">
        {FILTERS.map((f) => {
          const count = jobs.filter((j) => f.match(j.status)).length;
          const isActive = activeFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-slate-900 text-white border border-slate-900"
                  : "bg-white text-slate-500 border border-warm-border hover:border-slate-300"
              }`}
            >
              {f.label}
              <span
                className={`text-[11px] px-1.5 rounded-full font-medium ${
                  isActive ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Job list */}
      {visible.length === 0 ? (
        <p className="text-sm text-slate-500">No jobs in this category.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((job) => {
            const pill = STATUS_PILL[job.status];
            return (
              <li
                key={job.id}
                className="bg-white border border-warm-border rounded-card p-[18px] flex items-center gap-4"
              >
                <Avatar name={job.contractor_display_name} size={48} palette={paletteFor(job.contractor_id)} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-semibold text-slate-900">
                      {job.contractor_display_name}
                    </span>
                    <span
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                      style={{ background: pill.bg, color: pill.fg }}
                    >
                      {pill.label}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 truncate mt-0.5">{job.description}</p>
                  <div className="text-xs text-slate-400 tabular-nums mt-0.5">
                    {formatDate(job.created_at)} · #{job.id.slice(0, 8)}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  {job.status === "completed" && !job.has_rating && (
                    <Link
                      href={`/?rate=${job.id}`}
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      Leave a rating
                    </Link>
                  )}
                  <Link
                    href={`/pro/${job.contractor_id}`}
                    className="text-xs text-slate-500 hover:text-slate-900 font-medium transition-colors"
                  >
                    Details →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
