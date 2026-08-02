/**
 * AuditLog.tsx
 *
 * Autonomous decision audit log table.
 * Shows every signal the engine evaluated — whether auto-executed or skipped —
 * with full metadata: timestamp, symbol, side, confidence, strategy, entry/SL/TP,
 * execution latency, outcome badge, and trigger reasoning.
 */
import { useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Minus,
  ScrollText,
  Trash2,
  TrendingDown,
  TrendingUp,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { AutonomousSignal, EngineStats, SignalGates } from "@/hooks/useAutonomousEngine";

interface AuditLogProps {
  signals: AutonomousSignal[];
  stats: EngineStats;
  onClear: () => void;
}

export function AuditLog({ signals, stats, onClear }: AuditLogProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "AUTO" | "SKIPPED" | "WIN" | "LOSS">("ALL");

  const filtered = signals.filter((s) => {
    if (filter === "AUTO") return s.autoExecuted;
    if (filter === "SKIPPED") return !s.autoExecuted;
    if (filter === "WIN") return s.outcome === "WIN";
    if (filter === "LOSS") return s.outcome === "LOSS";
    return true;
  });

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 shadow-card backdrop-blur">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ScrollText className="h-4 w-4 text-signal" />
          Autonomous Audit Log
          <span className="rounded-full bg-signal/15 px-2 py-0.5 font-mono text-[10px] text-signal">
            {signals.length}
          </span>
        </h2>
        <button
          onClick={onClear}
          disabled={!signals.length}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-bear/50 hover:text-bear disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear
        </button>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatPill label="Total Signals" value={stats.totalSignals} color="text-foreground" />
        <StatPill label="Auto-Executed" value={stats.autoExecuted} color="text-signal" />
        <StatPill label="Wins" value={stats.wins} color="text-profit" />
        <StatPill label="Losses" value={stats.losses} color="text-bear" />
        <StatPill
          label="Win Rate"
          value={`${stats.winRate}%`}
          color={stats.winRate >= 60 ? "text-profit" : stats.winRate >= 40 ? "text-[var(--gold)]" : "text-bear"}
        />
      </div>

      {/* ── Daily drawdown warning ───────────────────────────────────────── */}
      {stats.todayDrawdown > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-bear/30 bg-bear/8 px-3 py-2 text-[11px] text-bear">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Today's realised drawdown: <span className="font-mono font-bold">${stats.todayDrawdown.toFixed(2)}</span>
        </div>
      )}

      {/* ── Filter tabs ──────────────────────────────────────────────────── */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(["ALL", "AUTO", "SKIPPED", "WIN", "LOSS"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
              filter === f
                ? "border-signal bg-signal/15 text-signal"
                : "border-border text-muted-foreground hover:border-signal/40 hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="mt-3 overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
            <Bot className="mx-auto mb-2 h-6 w-6 opacity-30" />
            {signals.length === 0
              ? "No signals yet — the engine will log every decision here"
              : "No signals match the current filter"}
          </div>
        ) : (
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="py-2 pr-3">Time</th>
                <th className="pr-3">Symbol</th>
                <th className="pr-3">Side</th>
                <th className="pr-3">Conf.</th>
                <th className="pr-3">Strategy</th>
                <th className="pr-3">Entry</th>
                <th className="pr-3">SL</th>
                <th className="pr-3">TP1</th>
                <th className="pr-3">Latency</th>
                <th className="pr-3">Outcome</th>
                <th className="pr-3">Mode</th>
                <th />
              </tr>
            </thead>
            <tbody className="font-mono divide-y divide-border/30">
              {filtered.map((sig) => {
                const expanded = expandedId === sig.id;
                const decimals =
                  sig.entry < 10 ? 5 : sig.entry < 100 ? 3 : 2;
                const fmt = (v: number) => v.toFixed(decimals);
                return (
                  <>
                    <tr
                      key={sig.id}
                      className={`cursor-pointer transition-colors ${
                        expanded ? "bg-muted/30" : "hover:bg-muted/20"
                      }`}
                      onClick={() => toggleExpand(sig.id)}
                    >
                      {/* Time */}
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>{formatTime(sig.timestamp)}</span>
                        </div>
                        <div className="text-[9px] text-muted-foreground/60">
                          {formatDate(sig.timestamp)}
                        </div>
                      </td>

                      {/* Symbol */}
                      <td className="pr-3">
                        <span className="text-foreground">{sig.symbolLabel}</span>
                      </td>

                      {/* Side */}
                      <td className="pr-3">
                        <SideBadge side={sig.side} />
                      </td>

                      {/* Confidence */}
                      <td className="pr-3">
                        <ConfidenceBar value={sig.confidence} />
                      </td>

                      {/* Strategy */}
                      <td className="pr-3 max-w-[160px]">
                        <span className="block truncate text-foreground" title={sig.strategy}>
                          {sig.strategy}
                        </span>
                      </td>

                      {/* Entry */}
                      <td className="pr-3 text-foreground">{fmt(sig.entry)}</td>

                      {/* SL */}
                      <td className="pr-3 text-bear">{fmt(sig.stopLoss)}</td>

                      {/* TP1 */}
                      <td className="pr-3 text-profit">{fmt(sig.targets[0])}</td>

                      {/* Latency */}
                      <td className="pr-3">
                        {sig.executionLatencyMs != null ? (
                          <span
                            className={`${
                              sig.executionLatencyMs < 400
                                ? "text-profit"
                                : sig.executionLatencyMs < 800
                                  ? "text-[var(--gold)]"
                                  : "text-bear"
                            }`}
                          >
                            {sig.executionLatencyMs}ms
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>

                      {/* Outcome */}
                      <td className="pr-3">
                        <OutcomeBadge outcome={sig.outcome} />
                      </td>

                      {/* Mode */}
                      <td className="pr-3">
                        {sig.autoExecuted ? (
                          <span className="flex items-center gap-1 text-signal">
                            <Bot className="h-3 w-3" /> Auto
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Activity className="h-3 w-3" /> Manual
                          </span>
                        )}
                      </td>

                      {/* Expand toggle */}
                      <td>
                        <span className="text-muted-foreground">
                          {expanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </span>
                      </td>
                    </tr>

                    {/* ── Expanded detail row ─────────────────────────── */}
                    {expanded && (
                      <tr key={`${sig.id}-detail`} className="bg-muted/20">
                        <td colSpan={12} className="px-3 pb-4 pt-2">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {/* Rationale */}
                            <div>
                              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                Trigger Reasoning
                              </div>
                              <ul className="space-y-1 text-[11px] text-muted-foreground">
                                {sig.rationale.map((r, i) => (
                                  <li key={i} className="flex items-start gap-1.5">
                                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal/60" />
                                    {r}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Gates + skip reason */}
                            <div>
                              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                Gate Results
                              </div>
                              <GateGrid gates={sig.gates} />
                              {sig.skipReason && (
                                <div className="mt-2 rounded-lg border border-bear/30 bg-bear/8 px-3 py-2 text-[11px] text-bear">
                                  <span className="font-semibold">Blocked: </span>
                                  {sig.skipReason}
                                </div>
                              )}
                              {sig.contractId && (
                                <div className="mt-2 text-[10px] text-muted-foreground">
                                  Contract:{" "}
                                  <span className="font-mono text-signal">{sig.contractId}</span>
                                </div>
                              )}
                            </div>

                            {/* TP targets */}
                            <div className="sm:col-span-2">
                              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                Target Levels
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {sig.targets.map((t, i) => (
                                  <div
                                    key={i}
                                    className="rounded-lg border border-profit/30 bg-profit/8 px-3 py-1.5 text-[11px]"
                                  >
                                    <span className="text-muted-foreground">TP{i + 1} </span>
                                    <span className="font-mono font-semibold text-profit">
                                      {fmt(t)}
                                    </span>
                                  </div>
                                ))}
                                <div className="rounded-lg border border-bear/30 bg-bear/8 px-3 py-1.5 text-[11px]">
                                  <span className="text-muted-foreground">SL </span>
                                  <span className="font-mono font-semibold text-bear">
                                    {fmt(sig.stopLoss)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-center">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}

function SideBadge({ side }: { side: "BUY" | "SELL" }) {
  return side === "BUY" ? (
    <span className="flex items-center gap-0.5 font-bold text-profit">
      <ArrowUpRight className="h-3 w-3" /> BUY
    </span>
  ) : (
    <span className="flex items-center gap-0.5 font-bold text-bear">
      <ArrowDownRight className="h-3 w-3" /> SELL
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 80 ? "bg-profit" : value >= 65 ? "bg-[var(--gold)]" : "bg-bear";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span
        className={
          value >= 80 ? "text-profit" : value >= 65 ? "text-[var(--gold)]" : "text-bear"
        }
      >
        {value}%
      </span>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: AutonomousSignal["outcome"] }) {
  const map: Record<
    AutonomousSignal["outcome"],
    { icon: React.ReactNode; label: string; cls: string }
  > = {
    PENDING: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "PENDING",
      cls: "text-signal border-signal/30 bg-signal/8",
    },
    WIN: {
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: "WIN",
      cls: "text-profit border-profit/30 bg-profit/8",
    },
    LOSS: {
      icon: <XCircle className="h-3 w-3" />,
      label: "LOSS",
      cls: "text-bear border-bear/30 bg-bear/8",
    },
    SKIPPED: {
      icon: <Minus className="h-3 w-3" />,
      label: "SKIP",
      cls: "text-muted-foreground border-border/40 bg-muted/20",
    },
    BLOCKED: {
      icon: <XCircle className="h-3 w-3" />,
      label: "BLOCKED",
      cls: "text-bear border-bear/30 bg-bear/8",
    },
  };
  const { icon, label, cls } = map[outcome];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}
    >
      {icon} {label}
    </span>
  );
}

function GateGrid({ gates }: { gates: SignalGates }) {
  const entries: { key: keyof SignalGates; label: string }[] = [
    { key: "confluenceAligned", label: "Confluence" },
    { key: "confidenceMet", label: "Confidence" },
    { key: "withinTimeWindow", label: "Time Window" },
    { key: "positionCapOk", label: "Position Cap" },
    { key: "drawdownOk", label: "Drawdown" },
    { key: "symbolAllowed", label: "Symbol" },
    { key: "noDuplicateSignal", label: "Dedupe" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(({ key, label }) => (
        <span
          key={key}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium ${
            gates[key]
              ? "border-profit/30 bg-profit/8 text-profit"
              : "border-bear/30 bg-bear/8 text-bear"
          }`}
        >
          {gates[key] ? (
            <TrendingUp className="h-2.5 w-2.5" />
          ) : (
            <TrendingDown className="h-2.5 w-2.5" />
          )}
          {label}
        </span>
      ))}
    </div>
  );
}

/* ── Formatting helpers ─────────────────────────────────────────────────────── */
function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
