import Link from "next/link";
import { MapPin, ArrowRight, Check } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Rating } from "@/components/ui/rating";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import type { NearbyContractor } from "@/lib/types";

const PALETTES = ["blue", "green", "amber", "rose", "mint", "violet"] as const;

function paletteFor(id: string): typeof PALETTES[number] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

function formatDistance(meters: number): string {
  return (meters / 1609).toFixed(1);
}

interface DirectoryRowProps {
  contractor: NearbyContractor;
  isLoggedIn: boolean;
}

export function DirectoryRow({ contractor: c, isLoggedIn }: DirectoryRowProps) {
  const requestHref = isLoggedIn ? `/pro/${c.user_id}` : "/login";
  const rateUnit = c.base_rate_unit === "per_hour" ? "/ hr" : "/ job";

  return (
    <article
      className="bg-white border border-warm-border rounded-card p-[18px] flex items-start gap-[18px]"
      style={{ opacity: c.is_busy ? 0.7 : 1 }}
    >
      {/* Avatar with status dot */}
      <div className="relative flex-shrink-0">
        <Avatar name={c.display_name} size={64} palette={paletteFor(c.user_id)} />
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full border-[3px] border-white"
          style={{
            width: 16,
            height: 16,
            background: c.is_busy ? "#9ca3af" : "#10b981",
          }}
        />
      </div>

      {/* Center: name + meta + bio */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[17px] font-semibold text-slate-900 tracking-[-0.01em]">
            {c.display_name}
          </span>
          <VerifiedBadge />
        </div>

        <div className="mt-1.5 flex items-center gap-2.5 flex-wrap">
          <Rating value={c.avg_rating} count={c.rating_count} />
          <span className="text-xs text-slate-500 inline-flex items-center gap-1">
            <MapPin size={11} />
            <span className="tabular-nums">{formatDistance(c.distance_meters)}</span> mi
          </span>
          {c.base_rate != null && (
            <span className="text-xs text-slate-500 inline-flex items-center gap-1">
              <Check size={11} className="text-emerald-700" />
              verified
            </span>
          )}
        </div>

        {c.bio && (
          <p className="mt-2.5 text-[13px] text-slate-500 leading-[1.55]">{c.bio}</p>
        )}
      </div>

      {/* Right: rate + action */}
      <div className="flex flex-col items-end gap-2.5 flex-shrink-0 w-[140px]">
        {c.base_rate != null && (
          <div className="text-right">
            <div className="text-[22px] font-bold text-slate-900 tracking-[-0.01em] tabular-nums">
              ${c.base_rate}
            </div>
            <div className="text-xs text-slate-500">{rateUnit}</div>
          </div>
        )}

        {c.is_busy ? (
          <span className="text-[11px] text-amber-800 bg-amber-100 px-3 py-1 rounded-full font-medium">
            On a job
          </span>
        ) : (
          <Link
            href={requestHref}
            className="w-full flex items-center justify-center gap-1 bg-blue-600 text-white text-[13px] font-medium px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Request <ArrowRight size={14} />
          </Link>
        )}
      </div>
    </article>
  );
}
