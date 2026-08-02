/**
 * TradeFeed.tsx — MT5-style live trading terminal panel
 *
 * Two tabs:
 *  1. LIVE FEED   — real-time tick stream with direction arrows, speed bar,
 *                   pip-change from last trade entry, spread indicator
 *  2. TRADE LOG   — executed + closed trades with entry→exit, PnL, duration,
 *                   colour-coded rows, running total
 *
 * Designed to sit below the chart as a compact resizable panel.
 */
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Minus,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import type { DerivSymbol } from "@/lib/derivApi";
import type { ClosedTrade, Position } from "./PositionsTable";
import { pnlOf } from "./PositionsTable";

/* ── Tick entry shape ───────────────────────────────────────────────────── */
export interface TickEntry {
  id: string;
  symbol: string;
  price: number;
  prevPrice: number;
  timestamp: number;
  /** pip change from the previous tick */
  pipChange: number;
  /** direction: 1 up, -1 down, 0 flat */
  direction: 1 | -1 | 0;
  /** ms since last tick (for speed calculation) */
  intervalMs: number;
}

const MAX_FEED_ROWS = 80;

interface TradeFeedProps {
  symbol: DerivSymbol;
  /** Live tick prices keyed by symbol code */
  prices: Record<string, number>;
  positions: Position[];
  history: ClosedTrade[];
}

export function TradeFeed({ symbol, prices, positions, history }: TradeFeedProps) {
  const [tab, setTab] = useState<"feed" | "log">("feed");
  const [feed, setFeed] = useState<TickEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const prevPriceRef = useRef<number | null>(null);
  const prevTickTimeRef = useRef<number>(Date.now());
  const feedEndRef = useRef<HTMLDivElement>(null);
  const decimals = symbol.pipSize < 0.001 ? 5 : symbol.pipSize < 0.1 ? 3 : 2;
  const fmt = (v: number) => v.toFixed(decimals);

  /* ── Consume price ticks → feed entries ──────────────────────────────── */
  const currentPrice = prices[symbol.code];
  useEffect(() => {
    if (currentPrice === undefined) return;
    const prev = prevPriceRef.current;
    const now = Date.now();
    const intervalMs = now - prevTickTimeRef.current;
    prevTickTimeRef.current = now;

    if (prev !== null && prev !== currentPrice) {
      const pipChange = (currentPrice - prev) / symbol.pipSize;
      const direction: 1 | -1 | 0 = pipChange > 0 ? 1 : pipChange < 0 ? -1 : 0;
      const entry: TickEntry = {
        id: `${now}-${Math.random().toString(36).slice(2, 5)}`,
        symbol: symbol.code,
        price: currentPrice,
        prevPrice: prev,
        timestamp: now,
        pipChange,
        direction,
        intervalMs,
      };
      if (!paused) {
        setFeed((f) => [entry, ...f].slice(0, MAX_FEED_ROWS));
      }
    }
    prevPriceRef.current = currentPrice;
  }, [currentPrice, symbol.code, symbol.pipSize, paused]);

  /* ── Auto-scroll feed to top (newest first) on new entry ────────────── */
  // feed is newest-first, no scroll needed — list is already at top

  /* ── Stats ────────────────────────────────────────────────────────────── */
  const wins = history.filter((h) => h.pnl > 0).length;
  const losses = history.filter((h) => h.pnl <= 0).length;
  const netPnl = history.reduce((a, h) => a + h.pnl, 0);
  const totalPnl = positions.reduce((a, p) => a + pnlOf(p, prices[p.symbol] ?? p.entry), 0);

  /* ── Speed indicator: avg ms between last 5 ticks ─────────────────────── */
  const recentIntervals = feed.slice(0, 5).map((t) => t.intervalMs).filter(Boolean);
  const avgInterval = recentIntervals.length
    ? recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length
    : 1000;
  const speedPct = Math.min(100, Math.round((1000 / avgInterval) * 50)); // 0–100%

  /* ── Up/down run streaks ──────────────────────────────────────────────── */
  let streak = 0;
  let streakDir: 1 | -1 | 0 = 0;
  for (const t of feed.slice(0, 8)) {
    if (streakDir === 0) { streakDir = t.direction; streak = 1; continue; }
    if (t.direction === streakDir) streak++;
    else break;
  }

  return (
    <section className="rounded-2xl border border-border bg-card/60 shadow-card backdrop-blur flex flex-col" style={{ minHeight: 220 }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-signal" />
          <span className="text-sm font-semibold">Trade Terminal</span>
          {/* live price badge */}
          <span className={`font-mono text-sm font-bold ${
            feed[0]?.direction === 1 ? "text-profit" : feed[0]?.direction === -1 ? "text-bear" : "text-muted-foreground"
          }`}>
            {currentPrice !== undefined ? fmt(currentPrice) : "—"}
            {feed[0]?.direction === 1 && <TrendingUp className="ml-1 inline h-3.5 w-3.5" />}
            {feed[0]?.direction === -1 && <TrendingDown className="ml-1 inline h-3.5 w-3.5" />}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Speed bar */}
          <div className="flex items-center gap-1.5" title={`Tick speed: ${avgInterval.toFixed(0)}ms avg`}>
            <Activity className="h-3.5 w-3.5 text-signal" />
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-signal transition-all"
                style={{ width: `${speedPct}%` }}
              />
            </div>
          </div>

          {/* Streak badge */}
          {streak >= 2 && (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              streakDir === 1
                ? "border-profit/40 bg-profit/10 text-profit"
                : "border-bear/40 bg-bear/10 text-bear"
            }`}>
              {streakDir === 1 ? "▲" : "▼"} {streak} streak
            </span>
          )}

          {/* Pause toggle */}
          <button
            onClick={() => setPaused((p) => !p)}
            className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold ${
              paused ? "border-[var(--gold)]/50 bg-[var(--gold)]/10 text-[var(--gold)]" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {paused ? "▶ Resume" : "⏸ Pause"}
          </button>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-border/40 px-4">
        {(["feed", "log"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
              tab === t
                ? "border-signal text-signal"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "feed" ? `Live Feed (${feed.length})` : `Trade Log (${history.length + positions.length})`}
          </button>
        ))}
      </div>

      {/* ── Stats strip ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 border-b border-border/30 bg-background/30 px-4 py-1.5 text-[11px]">
        <Stat label="Float P&L" value={`$${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}`} color={totalPnl >= 0 ? "text-profit" : "text-bear"} />
        <Stat label="Closed P&L" value={`$${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)}`} color={netPnl >= 0 ? "text-profit" : "text-bear"} />
        <Stat label="W / L" value={`${wins} / ${losses}`} color="text-foreground" />
        <Stat label="Open" value={`${positions.length}`} color="text-signal" />
        <Stat label="Symbol" value={symbol.label} color="text-[var(--gold)]" />
      </div>

      {/* ── Live feed tab ─────────────────────────────────────────────────── */}
      {tab === "feed" && (
        <div className="flex-1 overflow-y-auto font-mono text-[11px]" ref={feedEndRef}>
          {feed.length === 0 ? (
            <div className="flex h-20 items-center justify-center text-muted-foreground text-xs gap-2">
              <Activity className="h-4 w-4 animate-pulse text-signal" />
              Waiting for price ticks…
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-card/90 text-[9px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-1 text-left">Time</th>
                  <th className="px-2 py-1 text-right">Price</th>
                  <th className="px-2 py-1 text-right">Δ Pips</th>
                  <th className="px-2 py-1 text-right">Speed</th>
                  <th className="px-2 py-1 text-center">Dir</th>
                </tr>
              </thead>
              <tbody>
                {feed.map((tick, idx) => {
                  const isNew = idx === 0;
                  const rowColor =
                    tick.direction === 1
                      ? "bg-profit/5 hover:bg-profit/10"
                      : tick.direction === -1
                        ? "bg-bear/5 hover:bg-bear/10"
                        : "hover:bg-muted/20";
                  const textColor =
                    tick.direction === 1 ? "text-profit" : tick.direction === -1 ? "text-bear" : "text-muted-foreground";
                  return (
                    <tr
                      key={tick.id}
                      className={`border-b border-border/20 transition-colors ${rowColor} ${isNew ? "animate-pulse-once" : ""}`}
                    >
                      <td className="px-4 py-1 text-muted-foreground tabular-nums">
                        {new Date(tick.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                      </td>
                      <td className={`px-2 py-1 text-right font-semibold tabular-nums ${textColor}`}>
                        {fmt(tick.price)}
                      </td>
                      <td className={`px-2 py-1 text-right tabular-nums ${textColor}`}>
                        {tick.pipChange > 0 ? "+" : ""}{tick.pipChange.toFixed(1)}
                      </td>
                      <td className="px-2 py-1 text-right text-muted-foreground tabular-nums">
                        {tick.intervalMs < 1000 ? `${tick.intervalMs}ms` : `${(tick.intervalMs / 1000).toFixed(1)}s`}
                      </td>
                      <td className="px-2 py-1 text-center">
                        {tick.direction === 1 ? (
                          <ArrowUpRight className="inline h-3.5 w-3.5 text-profit" />
                        ) : tick.direction === -1 ? (
                          <ArrowDownRight className="inline h-3.5 w-3.5 text-bear" />
                        ) : (
                          <Minus className="inline h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Trade log tab ─────────────────────────────────────────────────── */}
      {tab === "log" && (
        <div className="flex-1 overflow-y-auto font-mono text-[11px]">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-card/90 text-[9px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-1 text-left">Status</th>
                <th className="px-2 py-1 text-left">Side</th>
                <th className="px-2 py-1 text-right">Entry</th>
                <th className="px-2 py-1 text-right">Exit / Cur</th>
                <th className="px-2 py-1 text-right">Lots</th>
                <th className="px-2 py-1 text-right">P&L</th>
                <th className="px-2 py-1 text-right">Duration</th>
                <th className="px-2 py-1 text-left">Label</th>
              </tr>
            </thead>
            <tbody>
              {/* Open positions first */}
              {positions.map((p) => {
                const cur = prices[p.symbol] ?? p.entry;
                const pnl = pnlOf(p, cur);
                return (
                  <tr key={p.id} className="border-b border-border/20 bg-signal/4 hover:bg-signal/8">
                    <td className="px-4 py-1.5">
                      <span className="flex items-center gap-1 text-signal">
                        <Clock className="h-3 w-3 animate-pulse" /> OPEN
                      </span>
                    </td>
                    <td className={`px-2 py-1.5 font-bold ${p.side === "BUY" ? "text-profit" : "text-bear"}`}>
                      {p.side}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.entry.toFixed(decimals)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${pnl >= 0 ? "text-profit" : "text-bear"}`}>
                      {cur.toFixed(decimals)}
                    </td>
                    <td className="px-2 py-1.5 text-right">{p.lots.toFixed(2)}</td>
                    <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${pnl >= 0 ? "text-profit" : "text-bear"}`}>
                      {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">
                      {formatDuration(Date.now() - p.openedAt)}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{p.label}</td>
                  </tr>
                );
              })}

              {/* Closed trades */}
              {history.length === 0 && positions.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center font-sans text-muted-foreground">
                    No trades yet — execute a position to see it here.
                  </td>
                </tr>
              )}
              {history.map((h) => (
                <tr key={h.id} className={`border-b border-border/20 transition-colors ${h.pnl >= 0 ? "hover:bg-profit/5" : "hover:bg-bear/5"}`}>
                  <td className="px-4 py-1.5">
                    {h.pnl >= 0 ? (
                      <span className="flex items-center gap-1 text-profit">
                        <CheckCircle2 className="h-3 w-3" /> WIN
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-bear">
                        <XCircle className="h-3 w-3" /> LOSS
                      </span>
                    )}
                  </td>
                  <td className={`px-2 py-1.5 font-bold ${h.side === "BUY" ? "text-profit" : "text-bear"}`}>
                    {h.side}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{h.entry.toFixed(decimals)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${h.pnl >= 0 ? "text-profit" : "text-bear"}`}>
                    {h.exit.toFixed(decimals)}
                  </td>
                  <td className="px-2 py-1.5 text-right">{h.lots.toFixed(2)}</td>
                  <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${h.pnl >= 0 ? "text-profit" : "text-bear"}`}>
                    {h.pnl >= 0 ? "+" : ""}${h.pnl.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">
                    {formatDuration(h.closedAt - h.openedAt)}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{h.label}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Running total footer */}
          {(history.length > 0 || positions.length > 0) && (
            <div className="sticky bottom-0 flex items-center justify-between border-t border-border/60 bg-card/95 px-4 py-2 text-[11px]">
              <span className="text-muted-foreground">
                {positions.length} open · {history.length} closed
              </span>
              <span className={`font-bold ${netPnl + totalPnl >= 0 ? "text-profit" : "text-bear"}`}>
                Total P&L {netPnl + totalPnl >= 0 ? "+" : ""}${(netPnl + totalPnl).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-semibold ${color}`}>{value}</span>
    </span>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
