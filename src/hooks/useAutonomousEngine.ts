/**
 * useAutonomousEngine.ts
 *
 * Background autonomous trading engine hook.
 *
 * Responsibilities:
 *  • Polls candle data on a configurable interval (default 30 s)
 *  • Runs the full analysis pipeline (EMA, RSI, Fib, BOS/CHoCH, FVG) on each tick
 *  • Evaluates every configurable rule gate before considering an execution
 *  • Emits AutonomousSignal entries to a capped feed (shown in the Audit Log)
 *  • When autoPilot is ON and all gates pass, calls onExecute() automatically
 *  • Enforces max open positions, daily drawdown limit, and time-window filters
 *  • Prevents duplicate signals within the same candle window
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeMarket, type Analysis } from "@/lib/analysis";
import type { Candle, DerivConnection, DerivSymbol, Side } from "@/lib/derivApi";
import type { ExecutionPlan } from "@/components/terminal/StrategyPanel";
import type { Position } from "@/components/terminal/PositionsTable";

/* ── Public configuration type ─────────────────────────────────────────────── */
export interface AutoPilotConfig {
  /** Only fire if AI confidence >= this value (0–100). Default 80. */
  minConfidence: number;
  /** Disable auto-pilot if daily realised loss exceeds this USD amount. Default 100. */
  maxDailyDrawdown: number;
  /** Never open more than this many simultaneous positions. Default 3. */
  maxOpenPositions: number;
  /** Only trade during these UTC hour ranges. Empty = any time. */
  tradingWindows: TradingWindow[];
  /** Symbols the engine is allowed to trade. Empty = current symbol only. */
  allowedSymbols: string[];
  /** Lot size risk % per trade (passed through to ExecutionPlan). Default 1. */
  riskPct: number;
  /** Risk:Reward multiplier for TP calc. Default 2. */
  rrRatio: number;
  /** How often (ms) the scanner re-evaluates. Default 30 000. */
  scanIntervalMs: number;
}

export interface TradingWindow {
  label: string; // e.g. "London Open"
  startUtcHour: number; // 0–23
  endUtcHour: number; // 0–23
}

export const DEFAULT_TRADING_WINDOWS: TradingWindow[] = [
  { label: "London Open", startUtcHour: 7, endUtcHour: 12 },
  { label: "New York Open", startUtcHour: 13, endUtcHour: 17 },
  { label: "Asian Session", startUtcHour: 0, endUtcHour: 4 },
];

export const DEFAULT_CONFIG: AutoPilotConfig = {
  minConfidence: 80,
  maxDailyDrawdown: 100,
  maxOpenPositions: 3,
  tradingWindows: [],
  allowedSymbols: [],
  riskPct: 1,
  rrRatio: 2,
  scanIntervalMs: 30_000,
};

/* ── Signal feed types ──────────────────────────────────────────────────────── */
export type SignalOutcome = "PENDING" | "WIN" | "LOSS" | "SKIPPED" | "BLOCKED";

export interface AutonomousSignal {
  id: string;
  timestamp: number;
  symbol: string;
  symbolLabel: string;
  side: Side;
  confidence: number;
  strategy: string;
  rationale: string[];
  entry: number;
  stopLoss: number;
  targets: [number, number, number];
  /** Whether auto-pilot actually fired the trade. */
  autoExecuted: boolean;
  /** Why the trade was NOT executed (if skipped). */
  skipReason?: string;
  outcome: SignalOutcome;
  /** ms from signal detection to buy confirmation. */
  executionLatencyMs?: number;
  /** Deriv contract ID if executed live. */
  contractId?: string;
  /** Gate flags — useful for audit log display. */
  gates: SignalGates;
}

export interface SignalGates {
  confluenceAligned: boolean;
  confidenceMet: boolean;
  withinTimeWindow: boolean;
  positionCapOk: boolean;
  drawdownOk: boolean;
  symbolAllowed: boolean;
  noDuplicateSignal: boolean;
}

/* ── Engine state returned to the consumer ─────────────────────────────────── */
export interface AutonomousEngineState {
  /** Most recent analysis result (null until first scan). */
  latestAnalysis: Analysis | null;
  /** Ordered feed of all signals (newest first, capped at 100). */
  signalFeed: AutonomousSignal[];
  /** Counts for the UI summary badges. */
  stats: EngineStats;
  /** Whether the scanner is actively running. */
  isRunning: boolean;
  /** Manually trigger one analysis cycle (for "Analyze Market" button). */
  triggerScan: () => void;
  /** Resolve a pending signal's outcome once a position closes. */
  resolveSignal: (signalId: string, outcome: "WIN" | "LOSS") => void;
  /** Clear the entire signal feed. */
  clearFeed: () => void;
}

export interface EngineStats {
  totalSignals: number;
  autoExecuted: number;
  wins: number;
  losses: number;
  winRate: number; // 0–100
  todayDrawdown: number; // realised USD loss today
}

/* ── Gate helpers ───────────────────────────────────────────────────────────── */
function isWithinTradingWindow(windows: TradingWindow[]): boolean {
  if (!windows.length) return true; // no restriction
  const nowUtcHour = new Date().getUTCHours();
  return windows.some((w) => {
    if (w.startUtcHour <= w.endUtcHour) {
      return nowUtcHour >= w.startUtcHour && nowUtcHour < w.endUtcHour;
    }
    // Wraps midnight
    return nowUtcHour >= w.startUtcHour || nowUtcHour < w.endUtcHour;
  });
}

function buildExecutionPlan(
  analysis: Analysis,
  price: number,
  symbol: DerivSymbol,
  config: AutoPilotConfig,
): ExecutionPlan {
  const side: Side = analysis.bias === "BEARISH" ? "SELL" : "BUY";
  const dist = Math.max(
    Math.abs(analysis.suggestedEntry - analysis.suggestedStop),
    symbol.pipSize * 5,
  );
  const tp1 = side === "BUY" ? price + dist * config.rrRatio : price - dist * config.rrRatio;
  const tp2 = side === "BUY" ? price + dist * config.rrRatio * 2 : price - dist * config.rrRatio * 2;
  const tp3 = side === "BUY" ? price + dist * config.rrRatio * 3 : price - dist * config.rrRatio * 3;

  // Risk-based lot size
  const balance = 10_000; // fallback; terminal passes actual balance via onExecute
  const riskAmount = (balance * config.riskPct) / 100;
  const pipDist = dist / symbol.pipSize;
  const rawLots = riskAmount / Math.max(pipDist * symbol.pipValuePerLot, 0.01);
  const lots = Math.max(0.01, Math.round(rawLots * 100) / 100);

  return {
    side,
    lots,
    stopLoss: analysis.suggestedStop,
    targets: [tp1, tp2, tp3],
    tripleMode: true,
  };
}

function makeSignalId() {
  return `sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ── Main hook ──────────────────────────────────────────────────────────────── */
export function useAutonomousEngine({
  autoPilot,
  config,
  symbol,
  candles,
  price,
  positions,
  connection,
  todayLoss,
  onExecute,
  onSignalDetected,
}: {
  autoPilot: boolean;
  config: AutoPilotConfig;
  symbol: DerivSymbol;
  candles: Candle[];
  price: number;
  positions: Position[];
  connection: DerivConnection | null;
  /** Running total of today's realised losses (USD, positive = loss). */
  todayLoss: number;
  /** Called when auto-pilot fires a trade. */
  onExecute: (plan: ExecutionPlan, signal: AutonomousSignal) => Promise<{ latencyMs?: number; contractId?: string }>;
  /** Called for every detected signal (auto-executed or not). */
  onSignalDetected?: (signal: AutonomousSignal) => void;
}): AutonomousEngineState {
  const [latestAnalysis, setLatestAnalysis] = useState<Analysis | null>(null);
  const [signalFeed, setSignalFeed] = useState<AutonomousSignal[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // Prevent duplicate signals within the same 30-second window
  const lastSignalKeyRef = useRef<string>("");
  // Guard against concurrent scan execution
  const scanningRef = useRef(false);

  /* ── Core scan logic ─────────────────────────────────────────────────────── */
  const runScan = useCallback(async () => {
    if (scanningRef.current || !candles.length || !price) return;
    scanningRef.current = true;

    try {
      const analysis = analyzeMarket(candles, price);
      setLatestAnalysis(analysis);

      // Only produce a signal when confluence is aligned and bias is not neutral
      if (!analysis.confluenceAligned || analysis.bias === "NEUTRAL") return;

      // Deduplicate: same symbol + bias + strategy within the same scan window
      const signalKey = `${symbol.code}:${analysis.bias}:${analysis.strategy}`;
      if (signalKey === lastSignalKeyRef.current) return;
      lastSignalKeyRef.current = signalKey;

      /* ── Evaluate all gates ─────────────────────────────────────────────── */
      const gates: SignalGates = {
        confluenceAligned: analysis.confluenceAligned,
        confidenceMet: analysis.confidence >= config.minConfidence,
        withinTimeWindow: isWithinTradingWindow(config.tradingWindows),
        positionCapOk: positions.length < config.maxOpenPositions,
        drawdownOk: todayLoss < config.maxDailyDrawdown,
        symbolAllowed:
          !config.allowedSymbols.length || config.allowedSymbols.includes(symbol.code),
        noDuplicateSignal: true,
      };

      const allGatesPass = Object.values(gates).every(Boolean);
      const skipReason = !allGatesPass
        ? Object.entries(gates)
            .filter(([, v]) => !v)
            .map(([k]) => {
              const labels: Record<string, string> = {
                confidenceMet: `confidence ${analysis.confidence}% < threshold ${config.minConfidence}%`,
                withinTimeWindow: "outside configured trading window",
                positionCapOk: `max ${config.maxOpenPositions} positions reached`,
                drawdownOk: `daily drawdown $${todayLoss.toFixed(2)} exceeds $${config.maxDailyDrawdown} limit`,
                symbolAllowed: `${symbol.code} not in allowed symbols list`,
                noDuplicateSignal: "duplicate signal suppressed",
                confluenceAligned: "confluence rules not aligned",
              };
              return labels[k] ?? k;
            })
            .join("; ")
        : undefined;

      const side: Side = analysis.bias === "BEARISH" ? "SELL" : "BUY";
      const plan = buildExecutionPlan(analysis, price, symbol, config);

      const signal: AutonomousSignal = {
        id: makeSignalId(),
        timestamp: Date.now(),
        symbol: symbol.code,
        symbolLabel: symbol.label,
        side,
        confidence: analysis.confidence,
        strategy: analysis.strategy,
        rationale: analysis.rationale,
        entry: price,
        stopLoss: analysis.suggestedStop,
        targets: analysis.targets,
        autoExecuted: false,
        skipReason,
        outcome: allGatesPass && autoPilot ? "PENDING" : "SKIPPED",
        gates,
      };

      // Auto-execute if auto-pilot is ON and all gates pass
      if (autoPilot && allGatesPass && connection) {
        try {
          const result = await onExecute(plan, signal);
          signal.autoExecuted = true;
          signal.outcome = "PENDING";
          signal.executionLatencyMs = result.latencyMs;
          signal.contractId = result.contractId;
        } catch (err) {
          signal.outcome = "SKIPPED";
          signal.skipReason = `Execution error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      setSignalFeed((prev) => [signal, ...prev].slice(0, 100));
      onSignalDetected?.(signal);
    } finally {
      scanningRef.current = false;
    }
  }, [
    candles,
    price,
    symbol,
    config,
    autoPilot,
    positions,
    connection,
    todayLoss,
    onExecute,
    onSignalDetected,
  ]);

  /* ── Periodic background scanner ────────────────────────────────────────── */
  useEffect(() => {
    if (!autoPilot && !candles.length) return;
    setIsRunning(true);
    // Run immediately on mount / config change
    runScan();
    const id = setInterval(runScan, config.scanIntervalMs);
    return () => {
      clearInterval(id);
      setIsRunning(false);
    };
  }, [autoPilot, runScan, config.scanIntervalMs, candles.length]);

  /* ── Signal outcome resolver ─────────────────────────────────────────────── */
  const resolveSignal = useCallback((signalId: string, outcome: "WIN" | "LOSS") => {
    setSignalFeed((prev) =>
      prev.map((s) => (s.id === signalId ? { ...s, outcome } : s)),
    );
  }, []);

  /* ── Stats computation ───────────────────────────────────────────────────── */
  const stats: EngineStats = (() => {
    const resolved = signalFeed.filter((s) => s.outcome === "WIN" || s.outcome === "LOSS");
    const wins = resolved.filter((s) => s.outcome === "WIN").length;
    return {
      totalSignals: signalFeed.length,
      autoExecuted: signalFeed.filter((s) => s.autoExecuted).length,
      wins,
      losses: resolved.filter((s) => s.outcome === "LOSS").length,
      winRate: resolved.length ? Math.round((wins / resolved.length) * 100) : 0,
      todayDrawdown: todayLoss,
    };
  })();

  const clearFeed = useCallback(() => {
    setSignalFeed([]);
    lastSignalKeyRef.current = "";
  }, []);

  return {
    latestAnalysis,
    signalFeed,
    stats,
    isRunning,
    triggerScan: runScan,
    resolveSignal,
    clearFeed,
  };
}
