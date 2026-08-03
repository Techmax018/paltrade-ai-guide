/**
 * PaltradeLoader.tsx
 *
 * Full-screen animated loader overlay used during:
 *  - Initial app startup
 *  - Deriv OAuth redirect parsing
 *  - Vantage MT5 sync
 *  - AI strategy scans
 *  - Manual data refresh
 *
 * Design: deep navy (#0f172a) background, dual orbital spinning rings
 * with neon cyan (#06b6d4) and gold (#f59e0b) gradients, central
 * pulsing PALTRADE monogram, rotating status message ticker.
 */
import { useEffect, useState } from "react";

interface PaltradeLoaderProps {
  /** Override the status message. If omitted the ticker cycles automatically. */
  message?: string;
  /** Whether the overlay is visible */
  visible?: boolean;
}

const DEFAULT_MESSAGES = [
  "Initialising PalTrade Pro Terminal…",
  "Connecting to Deriv WebSocket…",
  "Retrieving live market data…",
  "Loading candlestick history…",
  "Calibrating AI confluence engine…",
  "Scanning FVG & Fibonacci zones…",
  "Syncing account balances…",
  "Verifying Deriv OAuth session…",
  "Establishing secure connection…",
  "Almost ready…",
];

export function PaltradeLoader({ message, visible = true }: PaltradeLoaderProps) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [fade, setFade] = useState(true);

  // Cycle through status messages every 2.4 s with a fade transition
  useEffect(() => {
    if (message || !visible) return;
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setMsgIdx((i) => (i + 1) % DEFAULT_MESSAGES.length);
        setFade(true);
      }, 300);
    }, 2400);
    return () => clearInterval(interval);
  }, [message, visible]);

  if (!visible) return null;

  const statusText = message ?? DEFAULT_MESSAGES[msgIdx];

  return (
    <div
      role="status"
      aria-label="Loading PalTrade"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(135deg, #020617 0%, #0f172a 60%, #0c1a2e 100%)" }}
    >
      {/* ── Ambient glow backdrop ─────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 55% 40% at 50% 45%, rgba(6,182,212,0.10) 0%, transparent 70%)",
            "radial-gradient(ellipse 30% 25% at 20% 70%, rgba(245,158,11,0.07) 0%, transparent 60%)",
          ].join(", "),
        }}
      />

      {/* ── Orbital ring system ───────────────────────────────────────── */}
      <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>

        {/* Outer ring — slow clockwise */}
        <svg
          aria-hidden="true"
          className="absolute inset-0"
          width="220" height="220"
          style={{ animation: "pt-spin-cw 3.6s linear infinite" }}
        >
          <defs>
            <linearGradient id="ringGradOuter" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#0e7490" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <circle cx="110" cy="110" r="100"
            fill="none"
            stroke="url(#ringGradOuter)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="200 430"
          />
        </svg>

        {/* Middle ring — fast counter-clockwise */}
        <svg
          aria-hidden="true"
          className="absolute inset-0"
          width="220" height="220"
          style={{ animation: "pt-spin-ccw 2.2s linear infinite" }}
        >
          <defs>
            <linearGradient id="ringGradMid" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
              <stop offset="60%" stopColor="#d97706" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <circle cx="110" cy="110" r="76"
            fill="none"
            stroke="url(#ringGradMid)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="140 340"
          />
        </svg>

        {/* Inner ring — medium clockwise */}
        <svg
          aria-hidden="true"
          className="absolute inset-0"
          width="220" height="220"
          style={{ animation: "pt-spin-cw 1.6s linear infinite" }}
        >
          <circle cx="110" cy="110" r="54"
            fill="none"
            stroke="rgba(6,182,212,0.25)"
            strokeWidth="1"
            strokeDasharray="60 280"
          />
        </svg>

        {/* ── Central monogram ─────────────────────────────────────────── */}
        <div
          className="relative flex flex-col items-center justify-center rounded-full"
          style={{
            width: 90,
            height: 90,
            background: "radial-gradient(circle, rgba(6,182,212,0.15) 0%, rgba(2,6,23,0.95) 70%)",
            boxShadow: "0 0 0 1px rgba(6,182,212,0.25), 0 0 40px rgba(6,182,212,0.20), 0 0 80px rgba(6,182,212,0.08)",
            animation: "pt-pulse-glow 2.4s ease-in-out infinite",
          }}
        >
          <img
            src="/android-chrome-192x192.png"
            alt="PalTrade"
            className="h-8 w-8 rounded-lg object-cover"
            style={{ filter: "drop-shadow(0 0 8px rgba(6,182,212,0.8))" }}
          />
          <span
            className="mt-1 font-mono text-[9px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "#06b6d4", textShadow: "0 0 8px rgba(6,182,212,0.9)" }}
          >
            PRO
          </span>
        </div>
      </div>

      {/* ── Brand text ────────────────────────────────────────────────── */}
      <div className="mt-8 text-center">
        <div
          className="font-bold tracking-[0.22em] uppercase"
          style={{
            fontSize: 22,
            color: "#e2e8f0",
            textShadow: "0 0 20px rgba(6,182,212,0.4)",
            fontFamily: "var(--font-display, 'Space Grotesk', sans-serif)",
          }}
        >
          PAL<span style={{ color: "#06b6d4" }}>TRADE</span>
        </div>
        <div
          className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em]"
          style={{ color: "#f59e0b", opacity: 0.85 }}
        >
          Pro Terminal v2.4
        </div>
      </div>

      {/* ── Status message ticker ─────────────────────────────────────── */}
      <div
        className="mt-6 flex items-center gap-2"
        style={{ minHeight: 24 }}
      >
        {/* Pulsing dot */}
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            background: "#06b6d4",
            animation: "pt-ping 1.2s ease-in-out infinite",
            boxShadow: "0 0 6px rgba(6,182,212,0.9)",
          }}
        />
        <span
          className="font-mono text-[11px] uppercase tracking-widest"
          style={{
            color: "rgba(148,163,184,0.85)",
            transition: "opacity 0.3s ease",
            opacity: fade ? 1 : 0,
          }}
        >
          {statusText}
        </span>
      </div>

      {/* ── Progress bar ──────────────────────────────────────────────── */}
      <div
        className="mt-5 overflow-hidden rounded-full"
        style={{ width: 200, height: 2, background: "rgba(255,255,255,0.06)" }}
      >
        <div
          style={{
            height: "100%",
            background: "linear-gradient(90deg, #06b6d4, #f59e0b, #06b6d4)",
            backgroundSize: "200% 100%",
            animation: "pt-progress 2s linear infinite",
            borderRadius: 999,
          }}
        />
      </div>

      {/* ── Keyframe styles ───────────────────────────────────────────── */}
      <style>{`
        @keyframes pt-spin-cw  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pt-spin-ccw { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        @keyframes pt-pulse-glow {
          0%, 100% { box-shadow: 0 0 0 1px rgba(6,182,212,0.25), 0 0 30px rgba(6,182,212,0.18), 0 0 70px rgba(6,182,212,0.06); }
          50%       { box-shadow: 0 0 0 1px rgba(6,182,212,0.50), 0 0 50px rgba(6,182,212,0.32), 0 0 100px rgba(6,182,212,0.14); }
        }
        @keyframes pt-ping {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.8); opacity: 0.4; }
        }
        @keyframes pt-progress {
          0%   { background-position: 0% 0%; }
          100% { background-position: 200% 0%; }
        }
      `}</style>
    </div>
  );
}
