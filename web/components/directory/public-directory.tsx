import { DirectoryList } from "./directory-list";
import type { NearbyContractor } from "@/lib/types";
import { LockedMapPreview } from "../map/locked-map-preview";

const DEFAULT_ADDRESS = "247 Lake Ave, Brooklyn";

interface PublicDirectoryProps {
  contractors: NearbyContractor[];
}

export function PublicDirectory({ contractors }: PublicDirectoryProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Hero */}
      <section className="px-10 pt-6 pb-4 flex-shrink-0">
        <h1 className="text-[30px] font-bold text-slate-900 tracking-[-0.02em] m-0">
          {contractors.length} pros near{" "}
          <span className="text-blue-600">{DEFAULT_ADDRESS}</span>
        </h1>
      </section>

      {/* Two-column */}
      <div className="flex gap-7 px-10 pb-7 flex-1 min-h-0 overflow-hidden">
        {/* List */}
        <main className="flex-1 min-w-0 flex flex-col min-h-0">
          <DirectoryList contractors={contractors} isLoggedIn={false} />
        </main>

        {/* Aside: locked map + how it works */}
        <aside className="w-[320px] flex-shrink-0 flex flex-col gap-4 overflow-auto">
          <LockedMapPromo />
          <HowItWorks />
        </aside>
      </div>
    </div>
  );
}

function LockedMapPromo() {
  return (
    <div className="bg-white border border-warm-border rounded-card p-4">
      {/* Static map preview */}
      <LockedMapPreview />

      <h3 className="m-0 text-[15px] font-semibold text-slate-900">See pros live on a map</h3>
      <p className="mt-1.5 mb-3 text-[13px] text-slate-500 leading-relaxed">
        Watch them move toward you in real time after you request. Free account, takes 30 seconds.
      </p>
      <a
        href="/register"
        className="block w-full text-center bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors"
      >
        Create free account
      </a>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    ["Browse", "See verified pros within a few miles. No bids, no callbacks."],
    ["Request", "Tap a pro — they get the request instantly."],
    ["Track", "Watch them arrive on a live map."],
    ["Pay", "Settle directly. No platform fee."],
  ] as const;

  return (
    <div className="px-2 py-1">
      <h3 className="m-0 text-[13px] font-semibold text-slate-900 uppercase tracking-[0.06em]">
        How Knect works
      </h3>
      <ol className="mt-3 list-none p-0 flex flex-col gap-3">
        {steps.map(([title, desc], i) => (
          <li key={title} className="flex gap-3">
            <span className="w-[22px] h-[22px] rounded-full bg-blue-50 text-blue-700 text-xs font-bold inline-flex items-center justify-center flex-shrink-0">
              {i + 1}
            </span>
            <div>
              <div className="text-[13px] font-semibold text-slate-900">{title}</div>
              <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
