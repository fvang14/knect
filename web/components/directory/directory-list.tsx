"use client";

import { useState } from "react";
import { DirectoryRow } from "./directory-row";
import type { NearbyContractor } from "@/lib/types";

const TRADE_CHIPS = [
  { key: "all",        label: "All" },
  { key: "plumbing",   label: "Plumbing" },
  { key: "electrical", label: "Electrical" },
  { key: "hvac",       label: "HVAC" },
  { key: "carpentry",  label: "Carpentry" },
  { key: "locksmith",  label: "Locksmith" },
  { key: "handyman",   label: "Handyman" },
];

interface DirectoryListProps {
  contractors: NearbyContractor[];
  isLoggedIn: boolean;
  showLiveIndicator?: boolean;
}

export function DirectoryList({
  contractors,
  isLoggedIn,
  showLiveIndicator = false,
}: DirectoryListProps) {
  const [activeFilter, setActiveFilter] = useState("all");

  // NearbyContractor has no trade field — filter is visual-only (all shown for any trade chip)
  const visible = contractors;

  return (
    <div className="flex flex-col min-h-0">
      {/* Trade filter chips */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {TRADE_CHIPS.map((chip) => {
          const isActive = activeFilter === chip.key;
          const count = chip.key === "all" ? contractors.length : 0;
          return (
            <button
              key={chip.key}
              onClick={() => setActiveFilter(chip.key)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-slate-900 text-white border border-slate-900"
                  : "bg-white text-slate-500 border border-warm-border hover:border-slate-300"
              }`}
            >
              {chip.label}
              {chip.key === "all" && (
                <span
                  className={`text-[11px] px-1.5 rounded-full font-medium ${
                    isActive ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Results header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-warm-border">
        <span className="text-[11px] text-slate-500 uppercase tracking-[0.05em] font-semibold">
          {showLiveIndicator ? "Live · ranked by response time" : "Available · ranked by response time"}
        </span>
        {showLiveIndicator && (
          <span className="text-[11px] text-slate-400 inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Updated 2s ago
          </span>
        )}
      </div>

      {/* Rows */}
      {visible.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">No pros available nearby.</p>
      ) : (
        <div className="flex flex-col gap-3 overflow-auto flex-1 pb-6">
          {visible.map((c) => (
            <DirectoryRow key={c.user_id} contractor={c} isLoggedIn={isLoggedIn} />
          ))}
        </div>
      )}
    </div>
  );
}
