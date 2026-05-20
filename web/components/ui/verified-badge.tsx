import { Check } from "lucide-react";

export function VerifiedBadge() {
  return (
    <span
      title="Verified"
      className="inline-flex items-center justify-center rounded-full bg-blue-600 text-white"
      style={{ width: 18, height: 18, flexShrink: 0 }}
    >
      <Check size={11} />
    </span>
  );
}
