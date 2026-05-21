import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { serverApi } from "@/lib/api-server";
import { Avatar } from "@/components/ui/avatar";
import { Rating } from "@/components/ui/rating";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { ProRequestForm } from "./pro-request-form";
import type { PublicContractorProfile } from "@/lib/types";

const PALETTES = ["blue", "green", "amber", "rose", "mint", "violet"] as const;

function paletteFor(id: string): typeof PALETTES[number] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

async function getProfile(id: string): Promise<PublicContractorProfile | null> {
  try {
    return await serverApi.contractorProfile(id);
  } catch {
    return null;
  }
}

export default async function ProDetailPage({ params }: { params: { id: string } }) {
  const profile = await getProfile(params.id);
  if (!profile) notFound();

  const palette = paletteFor(profile.user_id);
  const rateUnit = profile.base_rate_unit === "per_hour" ? "/ hr" : "/ job";

  return (
    <div className="max-w-[1100px] mx-auto px-8 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
          <ArrowLeft size={14} /> Back to results
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-medium">{profile.display_name}</span>
      </div>

      <div className="flex gap-8 items-start">
        {/* Left column */}
        <main className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Header card */}
          <div className="bg-white border border-warm-border rounded-card-lg p-6 flex gap-5 items-start">
            <div className="relative flex-shrink-0">
              <Avatar name={profile.display_name} size={96} palette={palette} />
              <span
                className="absolute -bottom-1 -right-1 rounded-full border-[3px] border-white"
                style={{
                  width: 22,
                  height: 22,
                  background: profile.is_busy ? "#9ca3af" : "#10b981",
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[26px] font-bold text-slate-900 tracking-[-0.02em] m-0">
                  {profile.display_name}
                </h1>
                <VerifiedBadge />
              </div>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <Rating value={profile.avg_rating} count={profile.rating_count} />
              </div>
              {profile.bio && (
                <p className="mt-3 text-sm text-slate-600 leading-relaxed max-w-[620px]">
                  {profile.bio}
                </p>
              )}
            </div>
            {profile.base_rate != null && (
              <div className="flex-shrink-0 text-right">
                <div className="text-[30px] font-bold text-slate-900 tracking-[-0.02em] tabular-nums">
                  ${profile.base_rate}
                </div>
                <div className="text-xs text-slate-500">{rateUnit}</div>
              </div>
            )}
          </div>

          {/* Recent reviews */}
          {profile.ratings.length > 0 && (
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900 mb-3">Recent reviews</h2>
              <div className="flex flex-col gap-3">
                {profile.ratings.filter(r => r.review_text).slice(0, 5).map((r, i) => (
                  <div key={i} className="bg-white border border-warm-border rounded-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Avatar name="A" size={32} palette="blue" />
                        <span className="text-sm font-medium text-slate-900">Anonymous</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{formatDate(r.created_at)}</span>
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, si) => (
                            <span key={si} className={si < r.score ? "text-amber-400" : "text-slate-200"}>★</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">{r.review_text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Right aside: request form */}
        <aside className="w-[360px] flex-shrink-0 sticky top-[84px]">
          <div className="bg-white border border-warm-border rounded-card p-5">
            <h3 className="text-[15px] font-semibold text-slate-900 mb-4">Send a request</h3>
            {profile.is_busy ? (
              <div className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                {profile.display_name} is currently on another job. Try again soon.
              </div>
            ) : (
              <ProRequestForm contractorId={profile.user_id} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
