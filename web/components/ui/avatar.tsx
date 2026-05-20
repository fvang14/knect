const PALETTE_GRADIENTS: Record<string, string> = {
  blue:   "linear-gradient(135deg, #60a5fa, #2563eb)",
  green:  "linear-gradient(135deg, #4ade80, #16a34a)",
  amber:  "linear-gradient(135deg, #fcd34d, #d97706)",
  rose:   "linear-gradient(135deg, #fb7185, #e11d48)",
  mint:   "linear-gradient(135deg, #6ee7b7, #059669)",
  violet: "linear-gradient(135deg, #a78bfa, #7c3aed)",
};

interface AvatarProps {
  name: string;
  size?: number;
  palette?: "blue" | "green" | "amber" | "rose" | "mint" | "violet";
}

export function Avatar({ name, size = 36, palette = "blue" }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <span
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: PALETTE_GRADIENTS[palette] ?? PALETTE_GRADIENTS.blue,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "9999px",
        color: "#fff",
        fontWeight: 600,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {initials}
    </span>
  );
}
