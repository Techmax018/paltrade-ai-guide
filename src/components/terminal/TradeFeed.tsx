/**
 * TradeFeed.tsx — MT5-style live trading terminal panel
 *
 * • LIVE FEED tab — real-time tick stream from Deriv WebSocket, first 10 rows
 *   visible, the rest scroll inside the fixed-height container.
 * • TRADE LOG tab — current open positions + closed trade history with live
 *   floating P&L that updates on every price tick. Auto-activates when there
 *   are open positions.
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

export interface TickEntry {
  id: string;
  symbol: string;
  price: number;
  prevPrice: number;
  timestamp: number;
  pipChange: number;
  direction: 1 | -1 | 0;
  intervalMs: number;
}

const MAX_FEED_ROWS = 200;

interface TradeFeedProps {
  symbol: DerivSymbol;
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
  const decimals = symbol.pipSize < 0.001 ? 5 : symbol.pipSize < 0.1 ? 3 : 2;
  const fmt = (v: number) => v.toFixed(decimals);

  // Auto-switch to Trade Log when a position opens
  useEffect(() => {
    if (positions.length > 0) setTab("log");
  }, [positions.length]);

  // Consume live price ticks → append to feed
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
      if (!paused) {
        setFeed((f) => [
          {
            id: `${now}-${Math.random().toString(36).slice(2, 5)}`,
            symbol: symbol.code,
            price: currentPrice,
            prevPrice: prev,
            timestamp: now,
            pipChange,
            direction,
            intervalMs,
          },
          ...f,
        ].slice(0, MAX_FEED_ROWS));
      }
    }
    prevPriceRef.current = currentPrice;
  }, [currentPrice, symbol.code, symbol.pipSize, paused]);

  // Stats
  const wins = history.filter((h) => h.pnl > 0).length;
  const losses = history.filter((h) => h.pnl <= 0).length;
  const netPnl = history.reduce((a, h) => a + h.pnl, 0);
  const totalPnl = positions.reduce((a, p) => a + pnlOf(p, prices[p.symbol] ?? p.entry), 0);

  // Speed indicator
  const recentIntervals = feed.slice(0, 5).map((t) => t.intervalMs).filter(Boolean);
  const avgInterval = recentIntervals.length
    ? recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length
    : 1000;
  const speedPct = Math.min(100, Math.round((1000 / avgInterval) * 50));

  // Streak
  let streak = 0;
  let streakDir: 1 | -1 | 0 = 0;
  for (const t of feed.slice(0, 8)) {
    if (streakDir === 0) { streakDir = t.direction; streak = 1; continue; }
    if (t.direction === streakDir) streak++;
    else break;
  }

  return (
    <section
      className="rounded-2xl border border-border bg-card/60 shadow-card backdrop-blur flex flex-col overflow-hidden"
      style={{ height: 340 }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="h-4 w-4 shrink-0 text-signal" />
          <span className="text-sm font-semibold truncate">Trade Terminal</span>
          <span className={`font-mono text-sm font-bold shrink-0 ${
            feed[0]?.direction === 1 ? "text-profit" : feed[0]?.direction === -1 ? "text-bear" : "text-muted-foreground"
          }`}>
            {currentPrice !== undefined ? fmt(currentPrice) : "—"}
            {feed[0]?.direction === 1 && <TrendingUp className="ml-0.5 inline h-3 w-3" />}
            {feed[0]?.direction === -1 && <TrendingDown className="ml-0.5 inline h-3 w-3" />}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5" title={`${avgInterval.toFixed(0)}ms avg`}>
            <Activity className="h-3.5 w-3.5 text-signal" />
            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-signal transition-all" style={{ width: `${speedPct}%` }} />
            </div>
          </div>
          {streak >= 2 && (
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold hidden sm:inline ${
              streakDir === 1 ? "border-profit/40 bg-profit/10 text-profit" : "border-bear/40 bg-bear/10 text-bear"
            }`}>
              {streakDir === 1 ? "▲" : "▼"} {streak}
            </span>
          )}
          <button
            onClick={() => setPaused((p) => !p)}
            className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
              paused ? "border-[var(--gold)]/50 text-[var(--gold)]" : "border-border text-muted-foreground"
            }`}
          >
            {paused ? "▶" : "⏸"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-border/40 px-3">
        {(["feed", "log"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
              tab === t ? "border-signal text-signal" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "feed" ? `Feed (${feed.length})` : `Trades (${positions.length} open)`}
          </button>
        ))}
      </div>

      {/* Stats strip */}
      <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 border-b border-border/30 bg-background/30 px-3 py-1 text-[10px]">
        <Stat label="Float" value={`${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`} color={totalPnl >= 0 ? "text-profit" : "text-bear"} />
        <Stat label="Closed" value={`${netPnl >= 0 ? "+" : ""}$${netPnl.toFixed(2)}`} color={netPnl >= 0 ? "text-profit" : "text-bear"} />
        <Stat label="W/L" value={`${wins}/${losses}`} color="text-foreground" />
        <Stat label="Open" value={`${positions.length}`} color="text-signal" />
      </div>

      {/* Live Feed tab */}
      {tab === "feed" && (
        <div className="flex-1 overflow-y-auto font-mono text-[11px]">
          {feed.length === 0 ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-4 w-4 animate-pulse text-signal" />
              Waiting for live Deriv ticks…
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-card text-[9px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-1 text-left">Time</th>
                  <th className="px-2 py-1 text-right">Price</th>
                  <th className="px-2 py-1 text-right">Δ Pips</th>
                  <th className="px-2 py-1 text-right hidden sm:table-cell">Speed</th>
                  <th className="px-2 py-1 text-center">Dir</th>
                </tr>
              </thead>
              <tbody>
                {feed.map((tick, idx) => {
                  const up = tick.direction === 1;
                  const dn = tick.direction === -1;
                  return (
                    <tr
                      key={tick.id}
                      className={`border-b border-border/20 transition-colors ${
                        up ? "bg-profit/5" : dn ? "bg-bear/5" : ""
                      } ${idx === 0 ? "opacity-100" : "opacity-80"}`}
                    >
                      <td className="px-3 py-0.5 text-muted-foreground tabular-nums">
                        {new Date(tick.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                      </td>
                      <td className={`px-2 py-0.5 text-right font-semibold tabular-nums ${up ? "text-profit" : dn ? "text-bear" : "text-muted-foreground"}`}>
                        {fmt(tick.price)}
                      </td>
                      <td className={`px-2 py-0.5 text-right tabular-nums ${up ? "text-profit" : dn ? "text-bear" : "text-muted-foreground"}`}>
                        {tick.pipChange > 0 ? "+" : ""}{tick.pipChange.toFixed(1)}
                      </td>
                      <td className="px-2 py-0.5 text-right text-muted-foreground tabular-nums hidden sm:table-cell">
                        {tick.intervalMs < 1000 ? `${tick.intervalMs}ms` : `${(tick.intervalMs / 1000).toFixed(1)}s`}
                      </td>
                      <td className="px-2 py-0.5 text-center">
                        {up ? <ArrowUpRight className="inline h-3 w-3 text-profit" />
                          : dn ? <ArrowDownRight className="inline h-3 w-3 text-bear" />
                          : <Minus className="inline h-3 w-3 text-muted-foreground/40" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Trade Log tab */}
      {tab === "log" && (
        <div className="flex-1 overflow-y-auto font-mono text-[11px]">
          {positions.length === 0 && history.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No trades yet — execute a position to see it here.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-card text-[9px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-1 text-left">Status</th>
                  <th className="px-2 py-1 text-left">Side</th>
                  <th className="px-2 py-1 text-right">Entry</th>
                  <th className="px-2 py-1 text-right">Current</th>
                  <th className="px-2 py-1 text-right">P&L</th>
                  <th className="px-2 py-1 text-right hidden sm:table-cell">Dur.</th>
                </tr>
              </thead>
              <tbody>
                {/* Open positions — live P&L updates with every price tick */}
                {positions.map((p) => {
                  const cur = prices[p.symbol] ?? p.entry;
                  const pnl = pnlOf(p, cur);
                  return (
                    <tr key={p.id} className="border-b border-border/20 bg-signal/5">
                      <td className="px-3 py-1">
                        <span className="flex items-center gap-1 text-signal">
                          <Clock className="h-3 w-3 animate-pulse shrink-0" />
                          <span>OPEN</span>
                        </span>
                      </td>
                      <td className={`px-2 py-1 font-bold ${p.side === "BUY" ? "text-profit" : "text-bear"}`}>{p.side}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{p.entry.toFixed(decimals)}</td>
                      <td className={`px-2 py-1 text-right tabular-nums ${pnl >= 0 ? "text-profit" : "text-bear"}`}>
                        {cur.toFixed(decimals)}
                      </td>
                      <td className={`px-2 py-1 text-right font-bold tabular-nums ${pnl >= 0 ? "text-profit" : "text-bear"}`}>
                        {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right text-muted-foreground hidden sm:table-cell">
                        {formatDuration(Date.now() - p.openedAt)}
                      </td>
                    </tr>
                  );
                })}
                {/* Closed trades */}
                {history.map((h) => (
                  <tr key={h.id} className={`border-b border-border/20 ${h.pnl >= 0 ? "hover:bg-profit/5" : "hover:bg-bear/5"}`}>
                    <td className="px-3 py-1">
                      {h.pnl >= 0
                        ? <span className="flex items-center gap-1 text-profit"><CheckCircle2 className="h-3 w-3" />WIN</span>
                        : <span className="flex items-center gap-1 text-bear"><XCircle className="h-3 w-3" />LOSS</span>}
                    </td>
                    <td className={`px-2 py-1 font-bold ${h.side === "BUY" ? "text-profit" : "text-bear"}`}>{h.side}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{h.entry.toFixed(decimals)}</td>
                    <td className={`px-2 py-1 text-right tabular-nums ${h.pnl >= 0 ? "text-profit" : "text-bear"}`}>
                      {h.exit.toFixed(decimals)}
                    </td>
                    <td className={`px-2 py-1 text-right font-bold tabular-nums ${h.pnl >= 0 ? "text-profit" : "text-bear"}`}>
                      {h.pnl >= 0 ? "+" : ""}${h.pnl.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right text-muted-foreground hidden sm:table-cell">
                      {formatDuration(h.closedAt - h.openedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {/* Sticky total footer */}
          {(positions.length > 0 || history.length > 0) && (
            <div className="sticky bottom-0 flex items-center justify-between border-t border-border/60 bg-card px-3 py-1.5 text-[10px]">
              <span className="text-muted-foreground">{positions.length} open · {history.length} closed</span>
              <span className={`font-bold ${netPnl + totalPnl >= 0 ? "text-profit" : "text-bear"}`}>
                Total {netPnl + totalPnl >= 0 ? "+" : ""}${(netPnl + totalPnl).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-semibold ${color}`}>{value}</span>
    </span>
  );
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
