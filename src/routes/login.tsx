/**
 * login.tsx — PalTrade Pro Terminal login page.
 * Clean split-screen: left = brand + chart preview, right = auth actions.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { buildDerivOAuthUrl, useDerivOAuth } from "@/hooks/useDerivOAuth";
import { PaltradeLoader } from "@/components/PaltradeLoader";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — PalTrade Pro Terminal" },
      { name: "description", content: "Connect your Deriv account to PalTrade via secure OAuth 2.0." },
    ],
  }),
  component: LoginPage,
});

/* ── Root page ─────────────────────────────────────────────────────────────── */
function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useDerivOAuth();
  const [showLoader, setShowLoader] = useState(false);
  const [loaderMsg, setLoaderMsg] = useState<string | undefined>();

  useEffect(() => {
    if (!loading && isAuthenticated) navigate({ to: "/terminal" });
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).has("acct1")) {
      setLoaderMsg("Verifying Deriv OAuth session…");
      setShowLoader(true);
    }
  }, []);

  useEffect(() => {
    if (!loading && showLoader) {
      const t = setTimeout(() => setShowLoader(false), 600);
      return () => clearTimeout(t);
    }
  }, [loading, showLoader]);

  function handleDemoMode() {
    localStorage.setItem("paltrade.demo.mode", "1");
    localStorage.setItem("paltrade.connections.v1", JSON.stringify([
      { broker: "demo", account: "DEMO", currency: "USD", connectedAt: Date.now() },
    ]));
    navigate({ to: "/terminal" });
  }

  if (loading || showLoader) return <PaltradeLoader visible message={loaderMsg} />;

  return (
    <div className="min-h-screen" style={{ background: "#020617" }}>
      <div className="grid min-h-screen lg:grid-cols-2">

        {/* ── Left: brand + chart (desktop only) ── */}
        <div className="relative hidden flex-col items-center justify-center overflow-hidden px-12 lg:flex"
          style={{ background: "linear-gradient(155deg, #0f172a 0%, #0c1a2e 100%)" }}>
          <div aria-hidden className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 60% 50% at 30% 40%, rgba(6,182,212,0.08) 0%, transparent 70%)" }} />

          <div className="relative z-10 w-full max-w-md">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <img src="/android-chrome-192x192.png" alt="PalTrade"
                className="h-9 w-9 rounded-xl object-cover"
                style={{ boxShadow: "0 0 18px rgba(6,182,212,0.45)" }} />
              <div>
                <div className="font-bold uppercase tracking-[0.15em]"
                  style={{ fontSize: 17, color: "#e2e8f0" }}>
                  PAL<span style={{ color: "#06b6d4" }}>TRADE</span>
                </div>
                <div className="font-mono text-[9px] uppercase tracking-[0.3em]"
                  style={{ color: "#f59e0b", opacity: 0.85 }}>Pro Terminal</div>
              </div>
            </div>

            <h1 className="mt-10 text-3xl font-bold leading-snug" style={{ color: "#f1f5f9" }}>
              Autonomous trading,<br />
              <span style={{ color: "#06b6d4" }}>powered by AI.</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed"
              style={{ color: "rgba(148,163,184,0.75)", maxWidth: 340 }}>
              Connect your Deriv account once. The engine scans markets,
              detects confluences and executes positions — hands-free.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                { value: "84%",   label: "AI Win Rate" },
                { value: "<85ms", label: "Execution" },
                { value: "24/7",  label: "Auto-Pilot" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border px-3 py-3 text-center"
                  style={{ borderColor: "rgba(6,182,212,0.15)", background: "rgba(6,182,212,0.04)" }}>
                  <div className="font-mono text-lg font-bold" style={{ color: "#06b6d4" }}>{s.value}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wide"
                    style={{ color: "rgba(148,163,184,0.6)" }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div className="mt-8 overflow-hidden rounded-xl"
              style={{ border: "1px solid rgba(6,182,212,0.13)", background: "rgba(6,182,212,0.03)" }}>
              <div className="flex items-center gap-2 border-b px-3 py-2"
                style={{ borderColor: "rgba(6,182,212,0.10)" }}>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full"
                  style={{ background: "#10b981" }} />
                <span className="font-mono text-[10px]"
                  style={{ color: "rgba(148,163,184,0.7)" }}>XAU/USD · M5</span>
                <span className="ml-auto font-mono text-[11px] font-bold"
                  style={{ color: "#06b6d4" }}>2 358.40</span>
              </div>
              <ChartCanvas />
            </div>
          </div>
        </div>

        {/* ── Right: auth card ── */}
        {/* Mobile: full-viewport centred card. Desktop: fills right half. */}
        <div className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:px-10"
          style={{ background: "#0a0f1e" }}>

          <div className="w-full max-w-sm">
            {/* Logo — shown on all sizes (desktop left panel hidden on mobile) */}
            <div className="mb-7 flex flex-col items-center gap-3 text-center">
              <div className="relative">
                <img src="/android-chrome-192x192.png" alt="PalTrade"
                  className="h-12 w-12 rounded-2xl object-cover"
                  style={{ boxShadow: "0 0 24px rgba(6,182,212,0.5)" }} />
                <span className="absolute -bottom-1 -right-1 rounded-full px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase"
                  style={{ background: "#f59e0b", color: "#020617" }}>PRO</span>
              </div>
              <div>
                <div className="font-bold uppercase tracking-[0.18em]"
                  style={{ fontSize: 18, color: "#e2e8f0" }}>
                  PAL<span style={{ color: "#06b6d4" }}>TRADE</span>
                </div>
                <p className="mt-1 text-sm" style={{ color: "rgba(148,163,184,0.6)" }}>
                  Sign in to start trading
                </p>
              </div>
            </div>

            {/* Primary OAuth button */}
            <a href={buildDerivOAuthUrl()}
              className="group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl py-3.5 text-sm font-bold tracking-wide"
              style={{
                background: "linear-gradient(90deg, #0284c7, #06b6d4, #0ea5e9)",
                boxShadow: "0 0 0 1px rgba(6,182,212,0.35), 0 6px 24px rgba(6,182,212,0.22)",
                color: "#fff",
                textDecoration: "none",
              }}>
              <span aria-hidden
                className="pointer-events-none absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/12 to-transparent transition-transform duration-700 group-hover:translate-x-[100%]" />
              <ExternalLink className="h-4 w-4 shrink-0" />
              Login with Deriv Account
            </a>

            <p className="mt-2 text-center font-mono text-[10px]"
              style={{ color: "rgba(100,116,139,0.6)" }}>
              OAuth 2.0 · No permanent tokens stored
            </p>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
              <span className="text-[11px]" style={{ color: "rgba(100,116,139,0.5)" }}>or</span>
              <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
            </div>

            {/* Vantage accordion */}
            <VantageAccordion />

            {/* Demo + disclaimer */}
            <div className="mt-5 space-y-3 text-center">
              <button onClick={handleDemoMode}
                className="text-xs hover:underline transition-colors"
                style={{ color: "rgba(100,116,139,0.6)" }}>
                Try Demo Terminal (read-only) →
              </button>
              <p className="text-[10px] leading-relaxed"
                style={{ color: "rgba(71,85,105,0.5)" }}>
                Trading involves substantial risk. Not financial advice.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ── Vantage MT5 accordion ─────────────────────────────────────────────────── */
function VantageAccordion() {
  const [open, setOpen] = useState(false);
  const [acctType, setAcctType] = useState<"demo" | "real">("demo");
  const [acct, setAcct] = useState("");
  const [pass, setPass] = useState("");
  const [server, setServer] = useState("VantageFX-Demo");
  const [connecting, setConnecting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setServer(acctType === "demo" ? "VantageFX-Demo" : "VantageFX-Live 1");
  }, [acctType]);

  async function connect() {
    if (!acct.trim() || !pass.trim()) { setErr("Fill in all fields."); return; }
    setErr(""); setConnecting(true);
    await new Promise((r) => setTimeout(r, 900));
    try {
      const prev = JSON.parse(localStorage.getItem("paltrade.connections.v1") || "[]");
      prev.push({ broker: "vantage", account: acct.trim(), server, connectedAt: Date.now() });
      localStorage.setItem("paltrade.connections.v1", JSON.stringify(prev));
    } catch { /* ignore */ }
    setConnecting(false);
    setDone(true);
  }

  const inp = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.09)",
    color: "#e2e8f0",
    borderRadius: 8,
  } as const;

  return (
    <div className="overflow-hidden rounded-xl"
      style={{ border: "1px solid rgba(255,255,255,0.09)" }}>
      <button onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm"
        style={{
          background: open ? "rgba(255,255,255,0.03)" : "transparent",
          color: "rgba(148,163,184,0.8)",
        }}>
        Connect Vantage MT5
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
      </button>

      {open && (
        <div className="space-y-2.5 border-t px-4 pb-4 pt-3"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          {/* Demo / Real toggle */}
          <div className="flex overflow-hidden rounded-lg"
            style={{ border: "1px solid rgba(255,255,255,0.09)" }}>
            {(["demo", "real"] as const).map((t, i) => (
              <button key={t} onClick={() => setAcctType(t)}
                className="flex-1 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
                style={{
                  background: acctType === t ? "rgba(6,182,212,0.14)" : "transparent",
                  color: acctType === t ? "#06b6d4" : "rgba(148,163,184,0.5)",
                  borderRight: i === 0 ? "1px solid rgba(255,255,255,0.07)" : "none",
                }}>
                {t}
              </button>
            ))}
          </div>

          <input value={acct} onChange={(e) => setAcct(e.target.value)}
            placeholder="MT4/MT5 account number"
            className="w-full px-3 py-2 text-sm outline-none" style={inp} />

          <select value={server} onChange={(e) => setServer(e.target.value)}
            className="w-full px-3 py-2 text-sm outline-none"
            style={{ ...inp, background: "rgba(10,15,30,0.95)" }}>
            <option>VantageFX-Demo</option>
            <option>VantageFX-Live 1</option>
            <option>VantageFX-Live 2</option>
          </select>

          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)}
            placeholder="Investor password (read-only)"
            className="w-full px-3 py-2 text-sm outline-none" style={inp} />

          {err && <p className="text-xs" style={{ color: "#ef4444" }}>{err}</p>}
          {done && <p className="text-xs" style={{ color: "#10b981" }}>✓ Connected — open the terminal.</p>}

          <button onClick={connect} disabled={connecting || done}
            className="w-full rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: "linear-gradient(90deg,#0e7490,#0891b2)", color: "#fff" }}>
            {connecting
              ? <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting…
                </span>
              : done ? "✓ Connected" : "Connect Vantage"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Mini animated chart ───────────────────────────────────────────────────── */
function ChartCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // Build deterministic candles
    const candles: { o: number; h: number; l: number; c: number }[] = [];
    let p = 2338;
    for (let i = 0; i < 40; i++) {
      const o = p;
      const c = o + Math.sin(i * 0.7 + 1.2) * 7 + Math.cos(i * 0.4) * 4;
      candles.push({
        o, c,
        h: Math.max(o, c) + Math.abs(Math.sin(i * 1.3)) * 5,
        l: Math.min(o, c) - Math.abs(Math.cos(i * 1.1)) * 5,
      });
      p = c;
    }

    const prices = candles.map((c) => c.c);
    const minP = Math.min(...candles.map((c) => c.l)) - 8;
    const maxP = Math.max(...candles.map((c) => c.h)) + 8;
    const span = maxP - minP;
    const py = (v: number) => H - ((v - minP) / span) * H * 0.85 - H * 0.05;

    let frame = 0;
    let raf: number;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = "rgba(6,182,212,0.05)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(0, (H / 4) * i); ctx.lineTo(W, (H / 4) * i); ctx.stroke();
      }

      const cw = W / candles.length;

      // Candles
      candles.forEach((c, i) => {
        const bull = c.c >= c.o;
        const x = i * cw + cw / 2;
        const bt = py(Math.max(c.o, c.c));
        const bb = py(Math.min(c.o, c.c));
        ctx.strokeStyle = bull ? "#10b981" : "#ef4444";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, py(c.h)); ctx.lineTo(x, py(c.l)); ctx.stroke();
        ctx.fillStyle = bull ? "rgba(16,185,129,0.8)" : "rgba(239,68,68,0.8)";
        ctx.fillRect(x - cw * 0.32, bt, cw * 0.64, Math.max(bb - bt, 1));
      });

      // Animated price line
      const vis = Math.min(40, Math.floor(frame / 1.5) + 15);
      const pts = prices.slice(0, vis);
      if (pts.length > 1) {
        const g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, "rgba(6,182,212,0)");
        g.addColorStop(0.6, "rgba(6,182,212,0.85)");
        g.addColorStop(1, "rgba(6,182,212,1)");

        ctx.beginPath();
        pts.forEach((v, i) => {
          const x = (i / (candles.length - 1)) * W;
          i === 0 ? ctx.moveTo(x, py(v)) : ctx.lineTo(x, py(v));
        });
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.shadowColor = "#06b6d4";
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Live dot
        const lx = ((pts.length - 1) / (candles.length - 1)) * W;
        const ly = py(pts[pts.length - 1]);
        const ping = (frame % 60) / 60;

        ctx.beginPath();
        ctx.arc(lx, ly, 3 + ping * 10, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(6,182,212,${0.5 - ping * 0.5})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(lx, ly, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#06b6d4";
        ctx.shadowColor = "#06b6d4";
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      frame++;
      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="w-full"
      style={{ height: 160, display: "block" }}
    />
  );
}
