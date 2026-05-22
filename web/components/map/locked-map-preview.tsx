"use client";

const DEFAULT_LAT = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? "40.7128");
const DEFAULT_LNG = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? "-74.006");
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export function LockedMapPreview() {
  const lat = DEFAULT_LAT;
  const lng = DEFAULT_LNG;

  const width = 320;
  const height = 160;
  const zoom = 12;

  // Mapbox Static Images API format:
  // https://api.mapbox.com/styles/v1/{username}/{style_id}/static/{lon},{lat},{zoom},{bearing},{pitch}/{width}x{height}{@2x}?access_token={token}
  const imageUrl = MAPBOX_TOKEN
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${lng},${lat},${zoom},0,0/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}`
    : null;

  return (
    <div className="relative h-[160px] rounded-[10px] overflow-hidden mb-3.5" data-testid="locked-map-container">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt="Static map preview"
          className="w-full h-full object-cover"
          data-testid="locked-map-image"
        />
      ) : (
        <svg viewBox="0 0 320 160" className="w-full h-full" style={{ background: "#eef1ea" }} data-testid="locked-map-fallback">
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
      )}

      {/* Pin dots */}
      {([[40, 50], [70, 30], [30, 80], [80, 70], [55, 60]] as [number, number][]).map(([x, y], i) => (
        <div
          key={i}
          className="absolute rounded-full bg-blue-600"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: 10,
            height: 10,
            transform: "translate(-50%, -50%)",
            boxShadow: "0 0 0 2px #fff, 0 0 0 3px rgba(37,99,235,0.25)",
          }}
          data-testid={`locked-map-pin-${i}`}
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
  );
}
