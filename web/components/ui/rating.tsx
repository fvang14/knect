import { Star } from "lucide-react";

interface RatingProps {
  value: number;
  count: number;
  size?: number;
  showCount?: boolean;
}

export function Rating({ value, count, size = 12, showCount = true }: RatingProps) {
  return (
    <span className="inline-flex items-center gap-1 text-slate-500 tabular-nums" style={{ fontSize: 12 }}>
      <Star size={size} className="text-amber-400 fill-amber-400" />
      <span className="font-semibold text-slate-900">{value.toFixed(1)}</span>
      {showCount && <span className="text-slate-400">({count})</span>}
    </span>
  );
}
