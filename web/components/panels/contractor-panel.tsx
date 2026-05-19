"use client";

import { useEffect, useState } from "react";
import { X, Star } from "lucide-react";
import { api } from "@/lib/api-client";
import { useJob } from "@/components/providers/providers";
import type { PublicContractorProfile } from "@/lib/types";

interface Props {
  contractorId: string;
  userLocation: { lat: number; lng: number } | null;
  onClose: () => void;
}

export function ContractorPanel({ contractorId, userLocation, onClose }: Props) {
  const { setActiveJob } = useJob();
  const [profile, setProfile] = useState<PublicContractorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setProfile(null);
    api
      .contractorProfile(contractorId)
      .then(setProfile)
      .catch(() => setError("Could not load contractor profile."))
      .finally(() => setLoading(false));
  }, [contractorId]);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const job = await api.createJob({
        contractor_id: contractorId,
        description: description.trim(),
        location_lat: userLocation?.lat ?? 0,
        location_lng: userLocation?.lng ?? 0,
      });
      setActiveJob({ id: job.id, status: "pending", quote: null });
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to send request. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-20"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className="fixed right-0 top-14 bottom-0 w-full max-w-sm bg-white shadow-xl z-30 overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">
            {loading ? "Loading…" : (profile?.display_name ?? "Contractor")}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {loading && (
          <div className="p-4 text-gray-500 text-sm">Loading profile…</div>
        )}

        {!loading && profile && (
          <div className="p-4 space-y-4">
            {/* Rating */}
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <Star size={14} className="text-yellow-400 fill-yellow-400" />
              <span>
                {profile.avg_rating.toFixed(1)} ({profile.rating_count} ratings)
              </span>
            </div>

            {/* Rate */}
            {profile.base_rate != null && (
              <p className="text-sm text-gray-700">
                <span className="font-medium">${profile.base_rate}</span>{" "}
                {profile.base_rate_unit === "per_hour" ? "/ hr" : "/ job"}
              </p>
            )}

            {/* Bio */}
            {profile.bio && (
              <p className="text-sm text-gray-600">{profile.bio}</p>
            )}

            {/* Status badge */}
            {profile.is_busy && (
              <span className="inline-block text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-medium">
                Currently busy
              </span>
            )}

            {/* Job request form */}
            {!profile.is_busy && (
              <form onSubmit={handleRequest} className="space-y-3 pt-2">
                <label className="block text-sm font-medium text-gray-700">
                  Describe your job
                  <textarea
                    className="mt-1 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={4}
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What do you need help with?"
                  />
                </label>
                {error && (
                  <p className="text-sm text-red-600">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={submitting || !description.trim()}
                  className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? "Sending…" : "Send Request"}
                </button>
              </form>
            )}
          </div>
        )}

        {error && !loading && !profile && (
          <div className="p-4 text-red-600 text-sm">{error}</div>
        )}
      </div>
    </>
  );
}
