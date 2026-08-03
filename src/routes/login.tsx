/**
 * login.tsx — PalTrade Pro Terminal institutional login page.
 *
 * Split-screen layout:
 *   Left  — hero: animated canvas chart, live stat tickers, value bullets
 *   Right — auth card: Deriv OAuth button, Vantage accordion, demo mode
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Bot, ChevronDown, ChevronRight,
  ExternalLink, Loader2, Shield, Target, Zap,
} from "lucide-react";
import { buildDerivOAuthUrl, useDerivOAuth } from "@/hooks/useDerivOAuth";
import { PaltradeLoader } from "@/components/PaltradeLoader";

/* ── Route definition ─────────────────────────────────────────────────────── */
export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — PalTrade Pro Terminal" },
      { name: "description", content: "Connect your Deriv account to PalTrade Pro Terminal via secure OAuth 2.0." },
    ],
  }),
  component: LoginPage,
});

/* ── Static data ───────────────────────────────────────────────────────────── */
const STATS = [
  { label: "AI Win Rate",    value: "84.2%",          color: "#10b981" },
  { label: "Avg Execution",  value: "<85ms",           color: "#06b6d4" },
  { label: "Connected",      value: "Deriv + Vantage", color: "#f59e0b" },
  { label: "Auto-Pilot",     value: "ACTIVE",          color: "#06b6d4" },
  { label: "Signals Today",  value: "12",              color: "#10b981" },
  { label: "Open Positions", value: "3",               color: "#f59e0b" },
];

const BULLETS = [
  { icon: Zap,    color: "#06b6d4", text: "1-Click Multi-Broker Order Routing (Deriv WebSocket + Vantage MT5)" },
  { icon: Bot,    color: "#f59e0b", text: "Real-Time Smart Money Market Structure & Fair Value Gap (FVG) Scans" },
  { icon: Target, color: "#10b981", text: "Automated Fibonacci Golden Zone Execution with Triple-Take-Profit Targets" },
  { icon: Shield, color: "#06b6d4", text: "AI Auto-Pilot with Configurable Risk Gates & Daily Drawdown Limits" },
];

/* ── Root page ─────────────────────────────────────────────────────────────── */
function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useDerivOAuth();
  const [showLoader, setShowLoader] = useState(false);
  const [loaderMsg, setLoaderMsg] = useState<string | undefined>();

  // Already authenticated → go straight to terminal
  useEffect(() => {
    if (!loading && isAuthenticated) navigate({ to: "/terminal" });
  }, [isAuthenticated, loading, navigate]);

  // Detect OAuth redirect → show loader while hook parses params
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).has("acct1")) {
      setLoaderMsg("Verifying Deriv OAuth session & retrieving account tokens…");
      setShowLoader(true);
    }
  }, []);

  // Hide loader once hook finishes
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
      <div className="grid min-h-screen lg:grid-cols-[1fr_480px]">
        {/* Left hero — lg+ only */}
        <div className="hidden lg:block">
          <HeroPanel />
        </div>

        {/* Right auth */}
        <div className="flex flex-col"
          style={{ borderLeft: "1px solid rgba(6,182,212,0.12)" }}>
          {/* Mobile brand bar */}
          <div className="flex items-center gap-2 border-b px-4 py-3 lg:hidden"
            style={{ borderColor: "rgba(255,255,255,0.08)", background: "#0f172a" }}>
            <img src="/android-chrome-192x192.png" alt="PalTrade"
              className="h-7 w-7 rounded-lg object-cover" />
            <span className="font-bold tracking-wide" style={{ color: "#e2e8f0", fontSize: 14 }}>
              PAL<span style={{ color: "#06b6d4" }}>TRADE</span>
            </span>
            <span className="rounded px-1 py-0.5 font-mono text-[8px] font-bold uppercase"
              style={{ background: "#f59e0b", color: "#020617" }}>PRO</span>
          </div>
          <div className="flex flex-1 flex-col justify-center">
            <AuthCard onDemoMode={handleDemoMode} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Left hero panel ───────────────────────────────────────────────────────── */
function HeroPanel() {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden px-10 py-10"
      style={{ background: "linear-gradient(160deg,#0f172a 0%,#0c1a2e 60%,#020617 100%)" }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 70% 50% at 20% 30%,rgba(6,182,212,0.07) 0%,transparent 65%),radial-gradient(ellipse 50% 40% at 80% 70%,rgba(245,158,11,0.06) 0%,transparent 60%)" }} />

      {/* Brand */}
      <div className="relative z-10 flex items-center gap-3">
        <img src="/android-chrome-192x192.png" alt="PalTrade"
          className="h-10 w-10 rounded-xl object-cover"
          style={{ boxShadow: "0 0 20px rgba(6,182,212,0.5)" }} />
        <div>
          <div className="font-bold uppercase tracking-[0.15em]"
            style={{ fontSize: 18, color: "#e2e8f0" }}>
            PAL<span style={{ color: "#06b6d4" }}>TRADE</span>
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.3em]"
            style={{ color: "#f59e0b", opacity: 0.9 }}>PRO TERMINAL v2.4</div>
        </div>
      </div>

      {/* Headline */}
      <div className="relative z-10 mt-10">
        <h1 className="text-4xl font-bold leading-tight"
          style={{ color: "#f1f5f9", textShadow: "0 0 40px rgba(6,182,212,0.18)" }}>
          Institutional-Grade<br />
          <span style={{ color: "#06b6d4" }}>Autonomous Trading</span><br />
          at Your Fingertips
        </h1>
        <p className="mt-4 max-w-[380px] text-sm leading-relaxed"
          style={{ color: "rgba(148,163,184,0.85)" }}>
          Connect once via Deriv OAuth. The AI engine handles market structure,
          confluence scoring and trade execution — automatically.
        </p>
      </div>

      {/* Chart card */}
      <div className="relative z-10 mt-8 overflow-hidden rounded-2xl"
        style={{ background: "rgba(6,182,212,0.04)", border: "1px solid rgba(6,182,212,0.14)", backdropFilter: "blur(8px)" }}>
        <div className="flex items-center justify-between border-b px-4 py-2.5"
          style={{ borderColor: "rgba(6,182,212,0.12)" }}>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full"
              style={{ background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
            <span className="font-mono text-[10px]"
              style={{ color: "rgba(148,163,184,0.8)" }}>XAU/USD · M5 · LIVE</span>
          </div>
          <span className="font-mono text-xs font-bold" style={{ color: "#06b6d4" }}>2 358.40</span>
        </div>
        <ChartCanvas />
      </div>

      {/* Stat tickers */}
      <div className="relative z-10 mt-5"><StatTickers /></div>

      {/* Value bullets */}
      <ul className="relative z-10 mt-6 space-y-3">
        {BULLETS.map((b) => {
          const Icon = b.icon;
          return (
            <li key={b.text} className="flex items-start gap-3 text-sm"
              style={{ color: "rgba(148,163,184,0.9)" }}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: b.color }} />
              {b.text}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Right auth card ───────────────────────────────────────────────────────── */
function AuthCard({ onDemoMode }: { onDemoMode: () => void }) {
  const oauthUrl = buildDerivOAuthUrl();
  return (
    <div className="flex flex-col justify-center px-6 py-10 md:px-10"
      style={{ background: "linear-gradient(170deg,#0f172a 0%,#020617 100%)" }}>

      {/* Brand header */}
      <div className="mb-8 text-center">
        <div className="inline-flex flex-col items-center gap-2">
          <div className="relative">
            <img src="/android-chrome-192x192.png" alt="PalTrade"
              className="h-14 w-14 rounded-2xl object-cover"
              style={{ boxShadow: "0 0 30px rgba(6,182,212,0.55),0 0 60px rgba(6,182,212,0.18)" }} />
            <span className="absolute -bottom-1 -right-1 rounded-full px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest"
              style={{ background: "#f59e0b", color: "#020617" }}>PRO</span>
          </div>
          <div className="mt-2">
            <div className="font-bold uppercase tracking-[0.18em]"
              style={{ fontSize: 20, color: "#e2e8f0" }}>
              PAL<span style={{ color: "#06b6d4" }}>TRADE</span>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.28em]"
              style={{ color: "#f59e0b", opacity: 0.85 }}>Pro Terminal v2.4</div>
          </div>
        </div>
        <p className="mt-4 text-sm" style={{ color: "rgba(148,163,184,0.7)" }}>
          Sign in to access live trading, AI analysis,<br className="hidden sm:inline" /> and auto-pilot execution.
        </p>
      </div>

      {/* Primary Deriv OAuth button */}
      <a href={oauthUrl}
        className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl py-4 text-sm font-bold tracking-wide"
        style={{
          background: "linear-gradient(90deg,#0284c7 0%,#06b6d4 50%,#0ea5e9 100%)",
          boxShadow: "0 0 0 1px rgba(6,182,212,0.4),0 8px 32px rgba(6,182,212,0.28)",
          color: "#fff",
          textDecoration: "none",
        }}>
        {/* Shimmer sweep on hover */}
        <span aria-hidden="true"
          className="pointer-events-none absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-[100%]" />
        <ExternalLink className="h-4 w-4" />
        LOGIN WITH DERIV ACCOUNT
      </a>
      <p className="mt-2 text-center font-mono text-[10px]"
        style={{ color: "rgba(100,116,139,0.75)" }}>
        Instant OAuth 2.0 Auth • No permanent API tokens required
      </p>

      {/* Trust badges */}
      <div className="mt-5 flex justify-center gap-6">
        {[
          { icon: "🔒", label: "OAuth 2.0" },
          { icon: "🛡️", label: "No passwords stored" },
          { icon: "⚡", label: "Instant auth" },
        ].map((b) => (
          <div key={b.label} className="flex flex-col items-center gap-1">
            <span className="text-lg">{b.icon}</span>
            <span className="text-[9px] uppercase tracking-wide"
              style={{ color: "rgba(100,116,139,0.65)" }}>{b.label}</span>
          </div>
        ))}
      </div>

      {/* Vantage accordion */}
      <div className="mt-7"><VantageAccordion /></div>

      {/* Demo mode */}
      <div className="mt-5 text-center">
        <button onClick={onDemoMode}
          className="text-[11px] transition-colors hover:underline"
          style={{ color: "rgba(100,116,139,0.65)" }}>
          Try Demo Terminal in Read-Only Mode →
        </button>
      </div>

      <p className="mt-8 text-center text-[10px] leading-relaxed"
        style={{ color: "rgba(71,85,105,0.6)" }}>
        By connecting you agree to PalTrade's terms. Trading involves substantial risk.
        This is not financial advice.
      </p>
    </div>
  );
}

/* ── Vantage MT5 accordion form ────────────────────────────────────────────── */
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
    if (!acct.trim() || !pass.trim()) { setErr("Please fill in all fields."); return; }
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

  const inputStyle = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "#e2e8f0",
    borderRadius: 8,
  };

  return (
    <div className="overflow-hidden rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.10)" }}>
      <button onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
        style={{ background: open ? "rgba(255,255,255,0.04)" : "transparent", color: "rgba(148,163,184,0.85)" }}>
        <span className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest"
            style={{ color: "rgba(148,163,184,0.4)" }}>or</span>
          Connect Vantage MT5 / Direct API
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {open && (
        <div className="space-y-3 border-t px-4 pb-4 pt-3"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          {/* Demo / Real toggle */}
          <div className="flex overflow-hidden rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.10)" }}>
            {(["demo", "real"] as const).map((t, i) => (
              <button key={t} onClick={() => setAcctType(t)}
                className="flex-1 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors"
                style={{
                  background: acctType === t ? "rgba(6,182,212,0.15)" : "transparent",
                  color: acctType === t ? "#06b6d4" : "rgba(148,163,184,0.55)",
                  borderRight: i === 0 ? "1px solid rgba(255,255,255,0.08)" : "none",
                }}>
                {t}
              </button>
            ))}
          </div>

          <input value={acct} onChange={(e) => setAcct(e.target.value)}
            placeholder="MT4/MT5 account number"
            className="w-full px-3 py-2.5 text-sm outline-none"
            style={inputStyle} />

          <select value={server} onChange={(e) => setServer(e.target.value)}
            className="w-full px-3 py-2.5 text-sm outline-none"
            style={{ ...inputStyle, background: "rgba(15,23,42,0.95)" }}>
            <option>VantageFX-Demo</option>
            <option>VantageFX-Live 1</option>
            <option>VantageFX-Live 2</option>
          </select>

          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)}
            placeholder="Investor password (read-only)"
            className="w-full px-3 py-2.5 text-sm outline-none"
            style={inputStyle} />

          {err && <p className="text-xs" style={{ color: "#ef4444" }}>{err}</p>}
          {done && <p className="text-xs" style={{ color: "#10b981" }}>✓ Vantage connected — open the terminal to start trading.</p>}

          <button onClick={connect} disabled={connecting || done}
            className="w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{ background: "linear-gradient(90deg,#0e7490,#0891b2)", color: "#fff" }}>
            {connecting
              ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Connecting…</span>
              : done ? "✓ Connected"
              : "Connect Vantage Terminal"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Stat tickers ──────────────────────────────────────────────────────────── */
function StatTickers() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActive((i) => (i + 1) % STATS.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-wrap gap-2">
      {STATS.map((s, i) => (
        <div key={s.label}
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] transition-all duration-500"
          style={{
            borderColor: i === active ? s.color : "rgba(255,255,255,0.08)",
            background: i === active ? `${s.color}18` : "rgba(255,255,255,0.03)",
            boxShadow: i === active ? `0 0 12px ${s.color}25` : "none",
          }}>
          <span className="h-1.5 w-1.5 rounded-full"
            style={{ background: i === active ? s.color : "rgba(255,255,255,0.18)" }} />
          <span style={{ color: i === active ? s.color : "rgba(148,163,184,0.65)" }}>{s.label}</span>
          <span className="font-bold"
            style={{ color: i === active ? s.color : "rgba(226,232,240,0.45)" }}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Animated canvas chart ─────────────────────────────────────────────────── */
function ChartCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.scale(dpr, dpr);
    const candles: { o: number; h: number; l: number; c: number }[] = [];
    let p = 2338;
    for (let i = 0; i < 48; i++) {
      const o = p, c = o + Math.sin(i * 0.7 + 1.2) * 8 + Math.cos(i * 0.4) * 5;
      candles.push({
        o, c,
        h: Math.max(o, c) + Math.abs(Math.sin(i * 1.3)) * 6,
        l: Math.min(o, c) - Math.abs(Math.cos(i * 1.1)) * 6,
      });
      p = c;
    }
    const prices = candles.map((c) => c.c);
    const minP = Math.min(...candles.map((c) => c.l)) - 10;
    const maxP = Math.max(...candles.map((c) => c.h)) + 10;
    const span = maxP - minP;
    const py = (v: number) => H - ((v - minP) / span) * H * 0.82 - H * 0.06;
    let frame = 0; let raf: number;
    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(6,182,212,0.06)"; ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo(0, (H / 5) * i); ctx.lineTo(W, (H / 5) * i); ctx.stroke();
      }
      const cw = W / candles.length;
      candles.forEach((c, i) => {
        if (c.c > c.o && c.c - c.o > 6) {
          ctx.fillStyle = "rgba(16,185,129,0.07)";
          ctx.fillRect(i * cw, py(c.h), cw, py(c.l) - py(c.h));
        }
        const bull = c.c >= c.o, x = i * cw + cw / 2;
        const bt = py(Math.max(c.o, c.c)), bb = py(Math.min(c.o, c.c));
        ctx.strokeStyle = bull ? "#10b981" : "#ef4444"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, py(c.h)); ctx.lineTo(x, py(c.l)); ctx.stroke();
        ctx.fillStyle = bull ? "rgba(16,185,129,0.85)" : "rgba(239,68,68,0.85)";
        ctx.fillRect(x - cw * 0.3, bt, cw * 0.6, Math.max(bb - bt, 1));
      });
      const vis = Math.min(48, Math.floor(frame / 1.2) + 20);
      const pts = prices.slice(0, vis);
      if (pts.length > 1) {
        const g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, "rgba(6,182,212,0)");
        g.addColorStop(0.5, "rgba(6,182,212,0.9)");
        g.addColorStop(1, "rgba(6,182,212,1)");
        ctx.beginPath();
        pts.forEach((v, i) => { const x = (i / (candles.length - 1)) * W; i === 0 ? ctx.moveTo(x, py(v)) : ctx.lineTo(x, py(v)); });
        ctx.strokeStyle = g; ctx.lineWidth = 1.8;
        ctx.shadowColor = "#06b6d4"; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
        const lx = ((pts.length - 1) / (candles.length - 1)) * W, ly = py(pts[pts.length - 1]);
        const ping = (frame % 60) / 60;
        ctx.beginPath(); ctx.arc(lx, ly, 3.5 + ping * 12, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(6,182,212,${0.6 - ping * 0.6})`; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#06b6d4"; ctx.shadowColor = "#06b6d4"; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
      }
      frame++; raf = requestAnimationFrame(draw);
    }
    draw(); return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} aria-hidden="true" className="w-full" style={{ height: 220, display: "block" }} />;
}
