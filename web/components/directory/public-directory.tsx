import { DirectoryList } from "./directory-list";
import type { NearbyContractor } from "@/lib/types";

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
      <div className="relative h-[160px] rounded-[10px] overflow-hidden mb-3.5">
        <svg viewBox="0 0 320 160" className="w-full h-full" style={{ background: "#eef1ea" }}>
          <path d="M0 0 L320 0 L320 30 C260 45, 200 20, 140 35 C90 48, 40 28, 0 42 Z" fill="#cfdef0" />
          <ellipse cx="50" cy="130" rx="60" ry="35" fill="#d9e7d0" />
          <ellipse cx="280" cy="70" rx="50" ry="30" fill="#d9e7d0" />
          <g stroke="#fff" fill="none" strokeWidth="8"><path d="M-5 80 L325 76" /></g>
          <g stroke="#fff" fill="none" strokeWidth="5"><path d="M155 -5 L160 165" /><path d="M-5 120 L325 122" /></g>
          <g fill="#e7e1d2">
            <rect x="20" y="55" width="60" height="22" rx="1" /><rect x="20" y="90" width="60" height="16" rx="1" />
            <rect x="100" y="55" width="65" height="22" rx="1" /><rect x="185" y="55" width="60" height="22" rx="1" />
            <rect x="185" y="90" width="60" height="16" rx="1" /><rect x="260" y="90" width="55" height="16" rx="1" />
          </g>
        </svg>
        {/* Pin dots */}
        {([[40, 50], [70, 30], [30, 80], [80, 70], [55, 60]] as [number, number][]).map(([x, y], i) => (
          <div
            key={i}
            className="absolute rounded-full bg-blue-600"
            style={{
              left: `${x}%`, top: `${y}%`,
              width: 10, height: 10,
              transform: "translate(-50%, -50%)",
              boxShadow: "0 0 0 2px #fff, 0 0 0 3px rgba(37,99,235,0.25)",
            }}
          />
        ))}
        {/* Frosted overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "rgba(248,250,252,0.65)", backdropFilter: "blur(2px)" }}
        >
          <div
            className="bg-white rounded-full px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900"
            style={{ boxShadow: "0 6px 18px -4px rgba(15,23,42,0.18)" }}
          >
            🔒 Sign in to view live map
          </div>
        </div>
      </div>

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
