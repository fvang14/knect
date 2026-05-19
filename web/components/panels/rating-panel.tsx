"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { api } from "@/lib/api-client";

interface Props {
  jobId: string;
  onRated: () => void;
}

export function RatingPanel({ jobId, onRated }: Props) {
  const [score, setScore] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!score) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.submitRating(
        jobId,
        score,
        reviewText.trim() || undefined
      );
      onRated();
    } catch {
      setError("Failed to submit rating. Please try again.");
      setSubmitting(false);
    }
  };

  const display = hovered ?? score;

  return (
    <div className="fixed right-0 top-14 bottom-0 w-full max-w-sm bg-white shadow-xl z-30 overflow-y-auto">
      <div className="p-4 space-y-4">
        <h2 className="font-semibold text-lg">Rate your contractor</h2>
        <p className="text-sm text-gray-600">How was the service?</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Stars */}
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} star`}
                onClick={() => setScore(n)}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(null)}
                className="focus:outline-none"
              >
                <Star
                  size={28}
                  className={
                    display !== null && n <= display
                      ? "text-yellow-400 fill-yellow-400"
                      : "text-gray-300"
                  }
                />
              </button>
            ))}
          </div>

          {/* Review text */}
          <textarea
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
            placeholder="Add a review (optional)"
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            aria-label="Submit rating"
            disabled={!score || submitting}
            className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Submitting…" : "Submit Rating"}
          </button>
        </form>
      </div>
    </div>
  );
}
