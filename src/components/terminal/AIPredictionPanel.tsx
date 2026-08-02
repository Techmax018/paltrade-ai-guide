/**
 * AIPredictionPanel.tsx
 *
 * Prominent action card shown inside the AI Analysis section.
 * Displays the current autonomous prediction signal and lets the user
 * execute it instantly with a single click.
 *
 * Sections:
 *  • Dynamic Signal Card  — BUY / SELL / NO TRADE badge with confidence ring
 *  • Level Grid           — Entry, SL, TP1, TP2, TP3
 *  • Structure Badge      — BOS / CHoCH label when present
 *  • Execute Button       — colour-coded, disabled for NO TRADE / NEUTRAL
 *  • Confluence Gates     — expandable rule-check indicators
 */
import { useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Minus,
  Shield,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { Analysis } from "@/lib/analysis";
import type { DerivSymbol } from "@/lib/derivApi";
import type { ExecutionPlan } from "./StrategyPanel";

interface AIPredictionPanelProps {
  analysis: Analysis;
  price: number;
  symbol: DerivSymbol;
  /** Lot size already calculated by StrategyPanel (passed through). */
  lots: number;
  /** Disabled while an execution is in-flight. */
  executing?: boolean;
  onExecute: (plan: ExecutionPlan) => void;
}

export function AIPredictionPanel({
  analysis,
  price,
  symbol,
  lots,
  executing = false,
  onExecute,
}: AIPredictionPanelProps) {
  const [gatesOpen, setGatesOpen] = useState(false);

  const { bias, confidence, structureShift, confluenceAligned, targets, suggestedStop } = analysis;
  const decimals = symbol.pipSize < 0.001 ? 5 : symbol.pipSize < 0.1 ? 3 : 2;
  const fmt = (v: number) => v.toFixed(decimals);

  const isBull = bias === "BULLISH";
  const isBear = bias === "BEARISH";
  const isNeutral = bias === "NEUTRAL";

  /* ── Colour tokens ─────────────────────────────────────────────────────── */
  const signalBg = isBull
    ? "bg-profit/10 border-profit/40"
    : isBear
      ? "bg-bear/10 border-bear/40"
      : "bg-muted/40 border-border";

  const signalText = isBull ? "text-profit" : isBear ? "text-bear" : "text-muted-foreground";

  const btnClass = isNeutral || !confluenceAligned
    ? "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
    : isBull
      ? "bg-profit text-background hover:opacity-90 animate-pulse-glow"
      : "bg-bear text-background hover:opacity-90";

  /* ── Confidence ring: 0–100 → stroke-dashoffset on a 88px circle ───────── */
  const circumference = 2 * Math.PI * 14; // r=14 → ~87.96
  const offset = circumference - (confidence / 100) * circumference;
  const ringColor = isBull ? "var(--profit)" : isBear ? "var(--bear)" : "var(--muted-foreground)";

  /* ── Signal label ─────────────────────────────────────────────────────── */
  const signalLabel = isBull ? "BUY / CALL" : isBear ? "SELL / PUT" : "NO TRADE";
  const SignalIcon = isBull ? TrendingUp : isBear ? TrendingDown : Minus;

  /* ── Structure shift label ───────────────────────────────────────────── */
  const structureLabel =
    structureShift === "BOS_BULL"
      ? { text: "BOS ↑ Bullish", color: "text-profit border-profit/40 bg-profit/10" }
      : structureShift === "BOS_BEAR"
        ? { text: "BOS ↓ Bearish", color: "text-bear border-bear/40 bg-bear/10" }
        : structureShift === "CHOCH_BULL"
          ? { text: "CHoCH ↑ Reversal", color: "text-profit border-profit/40 bg-profit/10" }
          : structureShift === "CHOCH_BEAR"
            ? { text: "CHoCH ↓ Reversal", color: "text-bear border-bear/40 bg-bear/10" }
            : null;

  /* ── Confluence gate display ─────────────────────────────────────────── */
  const gates: { label: string; value: boolean }[] = [
    { label: "EMA trend aligned", value: !!(analysis.ema50 && analysis.ema200 && (isBull ? analysis.ema50 > analysis.ema200 : analysis.ema50 < analysis.ema200)) },
    { label: "Price above/below 50 EMA", value: !!(analysis.ema50 && (isBull ? price > analysis.ema50 : price < analysis.ema50)) },
    { label: "RSI momentum confirms", value: !!(analysis.rsi !== null && (isBull ? analysis.rsi < 70 : analysis.rsi > 30)) },
    { label: "BOS / CHoCH detected", value: structureShift !== null },
    { label: "Golden zone or FVG present", value: analysis.gaps.length > 0 || !!(analysis.fib?.levels.find(l => l.level === 0.618)) },
    { label: "Confidence ≥ threshold", value: confluenceAligned },
  ];
  const passCount = gates.filter((g) => g.value).length;

  /* ── Build execution plan ────────────────────────────────────────────── */
  function handleExecute() {
    if (isNeutral || !confluenceAligned) return;
    const side = isBull ? "BUY" as const : "SELL" as const;
    onExecute({
      side,
      lots,
      stopLoss: suggestedStop,
      targets: targets as [number, number, number],
      tripleMode: true,
    });
  }

  return (
    <div className={`rounded-2xl border p-4 space-y-4 ${signalBg}`}>
      {/* ── Row 1: signal badge + confidence ring ──────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Confidence ring */}
          <div className="relative h-10 w-10 shrink-0">
            <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
              {/* Track */}
              <circle
                cx="18" cy="18" r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-border"
              />
              {/* Progress */}
              <circle
                cx="18" cy="18" r="14"
                fill="none"
                strokeWidth="3"
                stroke={ringColor}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <span
              className="absolute inset-0 flex items-center justify-center font-mono text-[9px] font-bold"
              style={{ color: ringColor }}
            >
              {confidence}%
            </span>
          </div>

          {/* Signal text */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              AI Signal
            </div>
            <div className={`flex items-center gap-1.5 text-base font-extrabold tracking-tight ${signalText}`}>
              <SignalIcon className="h-4 w-4" />
              {signalLabel}
            </div>
            {confluenceAligned && (
              <div className="text-[10px] text-muted-foreground">
                {confidence}% Bullish Confluence
              </div>
            )}
          </div>
        </div>

        {/* Structure badge */}
        {structureLabel && (
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${structureLabel.color}`}
          >
            {structureLabel.text}
          </span>
        )}
      </div>

      {/* ── Row 2: Entry / SL / TP grid ───────────────────────────────── */}
      <div className="grid grid-cols-5 gap-1.5 text-[11px]">
        <LevelCell label="Entry" value={fmt(price)} tone="text-foreground" span={1} />
        <LevelCell label="Stop Loss" value={fmt(suggestedStop)} tone="text-bear" span={1} />
        <LevelCell label="TP 1" value={fmt(targets[0])} tone="text-profit" span={1} />
        <LevelCell label="TP 2" value={fmt(targets[1])} tone="text-profit" span={1} />
        <LevelCell label="TP 3" value={fmt(targets[2])} tone="text-profit" span={1} />
      </div>

      {/* ── Row 3: Execute button ──────────────────────────────────────── */}
      <button
        onClick={handleExecute}
        disabled={isNeutral || !confluenceAligned || executing}
        aria-label={`Execute ${signalLabel} strategy`}
        className={`w-full rounded-xl px-4 py-3 text-sm font-extrabold tracking-wide transition flex items-center justify-center gap-2 ${btnClass} disabled:animate-none`}
      >
        {executing ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Executing…
          </>
        ) : isNeutral ? (
          <>
            <Minus className="h-4 w-4" /> NO TRADE — Awaiting Confluence
          </>
        ) : !confluenceAligned ? (
          <>
            <AlertTriangle className="h-4 w-4" /> Low Confidence — Manual Only
          </>
        ) : isBull ? (
          <>
            <Zap className="h-4 w-4" />
            <ArrowUpRight className="h-4 w-4" />
            EXECUTE PREDICTED STRATEGY — BUY
          </>
        ) : (
          <>
            <Zap className="h-4 w-4" />
            <ArrowDownRight className="h-4 w-4" />
            EXECUTE PREDICTED STRATEGY — SELL
          </>
        )}
      </button>

      {/* ── Row 4: Confluence gate accordion ──────────────────────────── */}
      <div>
        <button
          onClick={() => setGatesOpen((v) => !v)}
          className="flex w-full items-center justify-between text-[11px] text-muted-foreground hover:text-foreground"
          aria-expanded={gatesOpen}
        >
          <span className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-signal" />
            Confluence gates —{" "}
            <span className={passCount === gates.length ? "text-profit" : passCount >= 4 ? "text-[var(--gold)]" : "text-bear"}>
              {passCount}/{gates.length} passing
            </span>
          </span>
          {gatesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {gatesOpen && (
          <div className="mt-2 grid grid-cols-1 gap-1">
            {gates.map((g) => (
              <div
                key={g.label}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] ${
                  g.value
                    ? "border-profit/30 bg-profit/5 text-profit"
                    : "border-bear/30 bg-bear/5 text-bear"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${g.value ? "bg-profit" : "bg-bear"}`}
                />
                {g.label}
                <span className="ml-auto font-mono font-bold">
                  {g.value ? "✓ PASS" : "✗ FAIL"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Level cell ─────────────────────────────────────────────────────────────── */
function LevelCell({
  label,
  value,
  tone,
  span,
}: {
  label: string;
  value: string;
  tone: string;
  span: number;
}) {
  return (
    <div
      className="rounded-lg border border-border/50 bg-background/50 px-2 py-1.5 text-center"
      style={{ gridColumn: `span ${span}` }}
    >
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-[11px] font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
