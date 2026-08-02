import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Brain,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import type { Analysis } from "@/lib/analysis";
import type { DerivSymbol, Side } from "@/lib/derivApi";
import { AIPredictionPanel } from "./AIPredictionPanel";

export interface ExecutionPlan {
  side: Side;
  lots: number;
  stopLoss: number;
  targets: [number, number, number];
  tripleMode: boolean;
}

export function StrategyPanel({
  symbol,
  price,
  balance,
  analysis,
  analyzing,
  tripleMode,
  executing,
  onToggleTriple,
  onAnalyze,
  onExecute,
}: {
  symbol: DerivSymbol;
  price: number;
  balance: number;
  analysis: Analysis | null;
  analyzing: boolean;
  tripleMode: boolean;
  /** True while an execution request is in-flight (disables execute buttons). */
  executing?: boolean;
  onToggleTriple: (v: boolean) => void;
  onAnalyze: () => void;
  onExecute: (plan: ExecutionPlan) => void;
}) {
  const [riskPct, setRiskPct] = useState(1);
  const [slPips, setSlPips] = useState(25);
  const [rr, setRr] = useState(2);

  const decimals = symbol.pipSize < 0.001 ? 5 : symbol.pipSize < 0.1 ? 3 : 2;
  const fmt = (v: number) => v.toFixed(decimals);

  useEffect(() => {
    if (!analysis) return;
    const pips = Math.abs(analysis.suggestedEntry - analysis.suggestedStop) / symbol.pipSize;
    setSlPips(Math.max(5, Math.round(pips)));
  }, [analysis, symbol.pipSize]);

  const riskAmount = (balance * riskPct) / 100;
  const rawLots = riskAmount / Math.max(slPips * symbol.pipValuePerLot, 0.01);
  const lots = Math.max(0.01, Math.round(rawLots * 100) / 100);
  const perTradeLots = tripleMode ? Math.max(0.01, Math.round((lots / 3) * 100) / 100) : lots;

  const side: Side = analysis?.bias === "BEARISH" ? "SELL" : "BUY";

  const plan = useMemo(() => {
    const dist = slPips * symbol.pipSize;
    const build = (s: Side): ExecutionPlan => ({
      side: s,
      lots: perTradeLots,
      stopLoss: s === "BUY" ? price - dist : price + dist,
      targets: (s === "BUY"
        ? [price + dist * rr, price + dist * rr * 2, price + dist * rr * 3]
        : [price - dist * rr, price - dist * rr * 2, price - dist * rr * 3]) as [
        number,
        number,
        number,
      ],
      tripleMode,
    });
    return build;
  }, [slPips, symbol.pipSize, price, rr, perTradeLots, tripleMode]);

  const preview = plan(side);

  const BiasIcon =
    analysis?.bias === "BULLISH"
      ? TrendingUp
      : analysis?.bias === "BEARISH"
        ? TrendingDown
        : Minus;
  const biasTone =
    analysis?.bias === "BULLISH"
      ? "text-profit"
      : analysis?.bias === "BEARISH"
        ? "text-bear"
        : "text-muted-foreground";

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-4 shadow-card backdrop-blur">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Brain className="h-4 w-4 text-signal" /> AI Analysis & Strategy
        </h2>
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          className="inline-flex items-center gap-2 rounded-md bg-signal px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-60"
        >
          {analyzing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Brain className="h-3.5 w-3.5" />
          )}
          Analyze Market
        </button>
      </div>

      {analysis ? (
        <div className="space-y-3">
          {/* ── AI Prediction Panel (prominent action card) ─────────────── */}
          <AIPredictionPanel
            analysis={analysis}
            price={price}
            symbol={symbol}
            lots={perTradeLots}
            executing={executing}
            onExecute={onExecute}
          />

          {/* ── Bias / confidence summary ────────────────────────────────── */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Market bias
              </div>
              <div className={`flex items-center gap-1.5 text-lg font-bold ${biasTone}`}>
                <BiasIcon className="h-5 w-5" /> {analysis.bias}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Confidence
              </div>
              <div className="font-mono text-lg text-signal">{analysis.confidence}%</div>
            </div>
          </div>

          {/* ── Indicator grid ───────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Cell label="Support" value={fmt(analysis.support)} tone="text-profit" />
            <Cell label="Resistance" value={fmt(analysis.resistance)} tone="text-bear" />
            <Cell label="RSI(14)" value={analysis.rsi?.toFixed(1) ?? "—"} />
            <Cell
              label="EMA 50 / 200"
              value={`${analysis.ema50 ? fmt(analysis.ema50) : "—"} / ${analysis.ema200 ? fmt(analysis.ema200) : "—"}`}
            />
          </div>

          {/* ── Recommended strategy ─────────────────────────────────────── */}
          <div className="rounded-xl border border-signal/30 bg-signal/5 p-3">
            <div className="text-[10px] uppercase tracking-widest text-signal">
              Recommended strategy
            </div>
            <div className="mt-1 text-sm font-semibold">{analysis.strategy}</div>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {analysis.rationale.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>

          {/* ── Fair value gaps ──────────────────────────────────────────── */}
          {analysis.gaps.length > 0 && (
            <div className="rounded-xl border border-border bg-background/40 p-3 text-xs">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Fair value gaps
              </div>
              {analysis.gaps.map((g) => (
                <div key={`${g.index}-${g.from}`} className="mt-1 font-mono">
                  <span className={g.kind === "bullish" ? "text-profit" : "text-bear"}>
                    {g.kind}
                  </span>{" "}
                  {fmt(g.from)} → {fmt(g.to)}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
          Run an analysis to score candle structure, RSI(14), EMA trend and Fibonacci confluence
          on {symbol.label}.
        </p>
      )}

      {/* ── Strategy parameters ──────────────────────────────────────────── */}
      <div className="space-y-3 border-t border-border/60 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Strategy parameters
        </h3>
        <Field label={`Risk per trade (${riskPct}%)`}>
          <input
            type="range"
            min={0.25}
            max={5}
            step={0.25}
            value={riskPct}
            onChange={(e) => setRiskPct(+e.target.value)}
            className="w-full accent-[var(--signal)]"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stop loss (pips)">
            <input
              type="number"
              min={1}
              value={slPips}
              onChange={(e) => setSlPips(Math.max(1, +e.target.value))}
              className="w-full rounded-md bg-input px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
          <Field label="Risk : Reward">
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={rr}
              onChange={(e) => setRr(Math.max(0.5, +e.target.value))}
              className="w-full rounded-md bg-input px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-background/40 p-3 text-xs">
          <Cell label="Risk amount" value={`$${riskAmount.toFixed(2)}`} />
          <Cell label="Lot size" value={`${lots.toFixed(2)} lots`} tone="text-signal" />
          <Cell label="Stop price" value={fmt(preview.stopLoss)} tone="text-bear" />
          <Cell label="Per position" value={`${perTradeLots.toFixed(2)} lots`} />
          <Cell label="TP1" value={fmt(preview.targets[0])} tone="text-profit" />
          <Cell label="TP2" value={fmt(preview.targets[1])} tone="text-profit" />
          <Cell label="TP3" value={fmt(preview.targets[2])} tone="text-profit" />
          <Cell label="Pip value" value={`$${symbol.pipValuePerLot}/lot`} />
        </div>

        <label className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-3">
          <span className="flex items-center gap-2 text-xs">
            <Layers className="h-4 w-4 text-signal" />
            <span>
              <span className="font-semibold">Triple-Trade Mode</span>
              <span className="block text-[11px] text-muted-foreground">
                Split into 3 positions scaled to TP1 / TP2 / TP3
              </span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={tripleMode}
            onChange={(e) => onToggleTriple(e.target.checked)}
            className="h-5 w-9 accent-[var(--signal)]"
            aria-label="Toggle triple trade mode"
          />
        </label>

        {/* Manual BUY / SELL buttons (always available regardless of analysis) */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onExecute(plan("BUY"))}
            disabled={executing}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-profit px-4 py-3 text-sm font-bold text-background transition hover:opacity-90 disabled:opacity-60"
          >
            <ArrowUpRight className="h-4 w-4" /> BUY
          </button>
          <button
            onClick={() => onExecute(plan("SELL"))}
            disabled={executing}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-bear px-4 py-3 text-sm font-bold text-background transition hover:opacity-90 disabled:opacity-60"
          >
            <ArrowDownRight className="h-4 w-4" /> SELL
          </button>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono ${tone ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}
