import { loginAction } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left: form */}
      <section className="flex-1 flex flex-col p-8 sm:p-14 bg-warm-bg">
        <header className="flex items-center justify-between">
          <span className="font-bold text-[22px] text-blue-600 tracking-tight">Knect</span>
          <div className="text-sm text-slate-500">
            New here?{" "}
            <a href="/register" className="text-blue-600 font-medium hover:underline">
              Create an account
            </a>
          </div>
        </header>

        <div className="flex-1 flex flex-col justify-center max-w-[380px] w-full mx-auto">
          <h1 className="text-[30px] font-bold text-slate-900 tracking-[-0.022em] m-0">
            Sign in to Knect
          </h1>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            Find a verified pro near you in seconds.
          </p>

          <form action={loginAction} className="mt-7 flex flex-col gap-3">
            <AuthField label="Email" name="email" type="email" placeholder="you@email.com" />
            <AuthField
              label="Password"
              name="password"
              type="password"
              placeholder="••••••••"
              trailing={
                <a href="/forgot" className="text-xs text-blue-600 font-medium hover:underline">
                  Forgot?
                </a>
              }
            />
            {searchParams.error && (
              <p className="text-sm text-red-600">{searchParams.error}</p>
            )}
            <button
              type="submit"
              className="mt-1 w-full bg-blue-600 text-white py-[10px] rounded-[10px] text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Sign in
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-warm-border" />
            <span className="text-xs text-slate-400">or</span>
            <div className="flex-1 h-px bg-warm-border" />
          </div>

          <button
            disabled
            className="w-full py-[10px] px-4 rounded-[10px] bg-white border border-warm-border text-slate-900 text-sm font-medium flex items-center justify-center gap-2 opacity-50 cursor-not-allowed"
          >
            <GoogleG />
            Continue with Google
          </button>
        </div>
      </section>

      {/* Right: dark map collage */}
      <AuthDarkPanel />
    </div>
  );
}

function AuthField({
  label,
  name,
  type = "text",
  placeholder,
  trailing,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-[13px] font-medium text-slate-900">{label}</span>
        {trailing}
      </div>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required
        className="w-full px-3 py-[10px] border border-warm-border rounded-[10px] bg-white text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </label>
  );
}

function AuthDarkPanel() {
  return (
    <aside className="hidden lg:flex flex-1 bg-[#0f172a] flex-col p-10 justify-end relative overflow-hidden">
      {/* Map SVG background */}
      <div className="absolute inset-0 opacity-60">
        <svg viewBox="0 0 640 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
          <rect width="640" height="800" fill="#1e293b" />
          <path d="M0 0 L640 0 L640 90 C540 120, 420 60, 320 100 C220 135, 120 80, 0 120 Z" fill="#2d4a6e" />
          <ellipse cx="100" cy="600" rx="120" ry="80" fill="#1e3a2a" />
          <ellipse cx="540" cy="260" rx="100" ry="70" fill="#1e3a2a" />
          <g stroke="#2d3748" strokeWidth="18" fill="none">
            <path d="M-10 340 L650 320" />
            <path d="M300 -10 L320 810" />
          </g>
          <g stroke="#2d3748" strokeWidth="10" fill="none">
            <path d="M-10 520 L650 540" />
            <path d="M150 -10 L170 810" />
            <path d="M460 -10 L480 810" />
          </g>
          <g fill="#374151">
            <rect x="30" y="220" width="110" height="60" rx="2" />
            <rect x="30" y="310" width="110" height="40" rx="2" />
            <rect x="180" y="220" width="120" height="60" rx="2" />
            <rect x="350" y="220" width="110" height="60" rx="2" />
            <rect x="350" y="310" width="110" height="40" rx="2" />
            <rect x="500" y="350" width="120" height="40" rx="2" />
          </g>
        </svg>
      </div>

      {/* Gradient mask */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.85) 70%, #0f172a 100%)" }}
      />

      {/* Floating pin cards */}
      <FloatingPin name="Sarah" rate="$65" palette="blue" left="22%" top="28%" />
      <FloatingPin name="Marcus" rate="$90" palette="amber" left="58%" top="20%" />
      <FloatingPin name="Diego" rate="$75" palette="rose" left="44%" top="44%" />
      <FloatingPin name="Priya" rate="$55" palette="mint" left="68%" top="56%" />

      {/* Bottom copy */}
      <div className="relative">
        <h2 className="text-[28px] font-semibold text-white tracking-tight leading-snug m-0">
          Six verified pros within a mile of you.
        </h2>
        <p className="mt-3 text-sm text-slate-300 leading-relaxed">
          No bids, no callbacks, no platform fee. Tap a pro, send a request, watch them arrive.
        </p>
        <div className="mt-6 flex gap-6 text-xs text-slate-400">
          <div>
            <div className="text-[22px] font-bold text-white tabular-nums">12k+</div>
            <div className="mt-0.5">Verified pros</div>
          </div>
          <div>
            <div className="text-[22px] font-bold text-white tabular-nums">11 min</div>
            <div className="mt-0.5">Median ETA</div>
          </div>
          <div>
            <div className="text-[22px] font-bold text-white tabular-nums">0%</div>
            <div className="mt-0.5">Platform fee</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function FloatingPin({
  name,
  rate,
  palette,
  left,
  top,
}: {
  name: string;
  rate: string;
  palette: string;
  left: string;
  top: string;
}) {
  const gradients: Record<string, string> = {
    blue:   "linear-gradient(135deg,#60a5fa,#2563eb)",
    amber:  "linear-gradient(135deg,#fcd34d,#d97706)",
    rose:   "linear-gradient(135deg,#fb7185,#e11d48)",
    mint:   "linear-gradient(135deg,#6ee7b7,#059669)",
  };
  const initials = name[0].toUpperCase();
  return (
    <div
      className="absolute"
      style={{ left, top }}
    >
      <div
        className="flex items-center gap-2 bg-white rounded-full pl-1 pr-3 py-1 text-xs font-semibold text-slate-900"
        style={{ boxShadow: "0 12px 30px -8px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05)" }}
      >
        <span
          className="inline-flex items-center justify-center rounded-full text-white font-bold"
          style={{ width: 24, height: 24, fontSize: 10, background: gradients[palette] }}
        >
          {initials}
        </span>
        {name} · <span className="text-blue-600 tabular-nums">{rate}</span>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}
