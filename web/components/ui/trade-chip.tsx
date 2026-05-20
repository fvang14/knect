import { Wrench, Plug, Snowflake, Hammer, Shield, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const TRADES: Record<string, { label: string; Icon: LucideIcon }> = {
  plumbing:   { label: "Plumbing",   Icon: Wrench },
  electrical: { label: "Electrical", Icon: Plug },
  hvac:       { label: "HVAC",       Icon: Snowflake },
  carpentry:  { label: "Carpentry",  Icon: Hammer },
  locksmith:  { label: "Locksmith",  Icon: Shield },
  handyman:   { label: "Handyman",   Icon: Zap },
};

interface TradeChipProps {
  trade: string;
}

export function TradeChip({ trade }: TradeChipProps) {
  const t = TRADES[trade];
  if (!t) return null;
  const { label, Icon } = t;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-warm-border bg-white text-slate-600 text-xs font-medium">
      <Icon size={11} />
      {label}
    </span>
  );
}
