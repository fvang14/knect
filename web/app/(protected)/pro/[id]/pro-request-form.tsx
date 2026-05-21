"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api-client";
import { useJob } from "@/components/providers/providers";

interface ProRequestFormProps {
  contractorId: string;
}

export function ProRequestForm({ contractorId }: ProRequestFormProps) {
  const router = useRouter();
  const { setActiveJob } = useJob();
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const job = await api.createJob({
        contractor_id: contractorId,
        description: description.trim(),
        location_lat: 0,
        location_lng: 0,
      });
      setActiveJob({ id: job.id, status: "pending", quote: null });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send request. Try again.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="block">
        <span className="text-[13px] font-medium text-slate-900 block mb-1.5">
          What do you need help with?
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your job…"
          required
          rows={4}
          className="w-full px-3 py-2.5 border border-warm-border rounded-[10px] text-sm text-slate-900 bg-white resize-none outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !description.trim()}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Sending…" : <>Send Request <ArrowRight size={14} /></>}
      </button>

      <p className="text-[11px] text-slate-400 text-center leading-relaxed">
        Your request goes directly to this pro. No platform fee.
      </p>
    </form>
  );
}
