/**
 * AutoPilotConfig.tsx
 *
 * Side-drawer for configuring the autonomous trading engine.
 * Opens from the Auto-Pilot toggle in TerminalHeader.
 */
import { useState } from "react";
import {
  Bot,
  Clock,
  DollarSign,
  Layers,
  PercentIcon,
  Shield,
  Target,
  Timer,
  X,
  Plus,
  Trash2,
  ChevronRight,
} from "lucide-react";
import {
  DEFAULT_CONFIG,
  DEFAULT_TRADING_WINDOWS,
  type AutoPilotConfig,
  type TradingWindow,
} from "@/hooks/useAutonomousEngine";
import { SYMBOLS } from "@/lib/derivApi";

interface AutoPilotConfigDrawerProps {
  open: boolean;
  config: AutoPilotConfig;
  onClose: () => void;
  onSave: (config: AutoPilotConfig) => void;
}

export function AutoPilotConfigDrawer({
  open,
  config,
  onClose,
  onSave,
}: AutoPilotConfigDrawerProps) {
  const [draft, setDraft] = useState<AutoPilotConfig>(() => ({ ...config }));

  function set<K extends keyof AutoPilotConfig>(key: K, value: AutoPilotConfig[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  function handleReset() {
    setDraft({ ...DEFAULT_CONFIG });
  }

  // Re-sync local draft when the drawer reopens with updated config
  function handleOpenChange() {
    setDraft({ ...config });
  }

  /* ── Window helpers ─────────────────────────────────────────────────────── */
  function togglePresetWindow(w: TradingWindow) {
    const exists = draft.tradingWindows.some((x) => x.label === w.label);
    set(
      "tradingWindows",
      exists
        ? draft.tradingWindows.filter((x) => x.label !== w.label)
        : [...draft.tradingWindows, w],
    );
  }

  function removeWindow(label: string) {
    set(
      "tradingWindows",
      draft.tradingWindows.filter((w) => w.label !== label),
    );
  }

  /* ── Symbol helpers ─────────────────────────────────────────────────────── */
  function toggleSymbol(code: string) {
    const exists = draft.allowedSymbols.includes(code);
    set(
      "allowedSymbols",
      exists
        ? draft.allowedSymbols.filter((s) => s !== code)
        : [...draft.allowedSymbols, code],
    );
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Auto-Pilot Configuration"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col border-l border-border bg-card shadow-2xl"
        onAnimationStart={handleOpenChange}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-signal/15 text-signal">
              <Bot className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold">Auto-Pilot Configuration</h2>
              <p className="text-[11px] text-muted-foreground">Autonomous engine rules & risk limits</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close configuration"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* ── Signal quality ──────────────────────────────────────────── */}
          <Section icon={<Target className="h-4 w-4" />} title="Signal Quality">
            <SliderField
              label="Minimum confidence threshold"
              hint={`Only execute if AI confidence ≥ ${draft.minConfidence}%`}
              value={draft.minConfidence}
              min={50}
              max={95}
              step={5}
              format={(v) => `${v}%`}
              color="var(--signal)"
              onChange={(v) => set("minConfidence", v)}
            />
          </Section>

          {/* ── Risk management ─────────────────────────────────────────── */}
          <Section icon={<Shield className="h-4 w-4" />} title="Risk Management">
            <SliderField
              label="Max daily drawdown"
              hint={`Auto-pilot disables if daily losses reach $${draft.maxDailyDrawdown}`}
              value={draft.maxDailyDrawdown}
              min={10}
              max={500}
              step={10}
              format={(v) => `$${v}`}
              color="var(--bear)"
              onChange={(v) => set("maxDailyDrawdown", v)}
            />
            <SliderField
              label="Max open positions"
              hint={`No new trades when ${draft.maxOpenPositions} positions are already open`}
              value={draft.maxOpenPositions}
              min={1}
              max={10}
              step={1}
              format={(v) => `${v}`}
              color="var(--gold)"
              onChange={(v) => set("maxOpenPositions", v)}
            />
          </Section>

          {/* ── Position sizing ─────────────────────────────────────────── */}
          <Section icon={<DollarSign className="h-4 w-4" />} title="Position Sizing">
            <SliderField
              label="Risk per trade"
              hint={`${draft.riskPct}% of account balance per position`}
              value={draft.riskPct}
              min={0.25}
              max={5}
              step={0.25}
              format={(v) => `${v}%`}
              color="var(--profit)"
              onChange={(v) => set("riskPct", v)}
            />
            <SliderField
              label="Risk : Reward ratio"
              hint={`TP targets set at 1:${draft.rrRatio}, 1:${draft.rrRatio * 2}, 1:${draft.rrRatio * 3}`}
              value={draft.rrRatio}
              min={0.5}
              max={5}
              step={0.5}
              format={(v) => `${v}R`}
              color="var(--signal)"
              onChange={(v) => set("rrRatio", v)}
            />
          </Section>

          {/* ── Scan interval ───────────────────────────────────────────── */}
          <Section icon={<Timer className="h-4 w-4" />} title="Scanner Speed">
            <SliderField
              label="Scan interval"
              hint={`Market re-evaluated every ${draft.scanIntervalMs / 1000}s`}
              value={draft.scanIntervalMs / 1000}
              min={10}
              max={300}
              step={10}
              format={(v) => `${v}s`}
              color="var(--signal)"
              onChange={(v) => set("scanIntervalMs", v * 1000)}
            />
          </Section>

          {/* ── Trading time windows ─────────────────────────────────────── */}
          <Section icon={<Clock className="h-4 w-4" />} title="Trading Time Windows">
            <p className="text-[11px] text-muted-foreground mb-2">
              Leave empty to trade 24/7. Select sessions to restrict trading hours.
            </p>
            {/* Preset toggles */}
            <div className="flex flex-wrap gap-2 mb-3">
              {DEFAULT_TRADING_WINDOWS.map((w) => {
                const active = draft.tradingWindows.some((x) => x.label === w.label);
                return (
                  <button
                    key={w.label}
                    onClick={() => togglePresetWindow(w)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                      active
                        ? "border-signal bg-signal/15 text-signal"
                        : "border-border text-muted-foreground hover:border-signal/50 hover:text-foreground"
                    }`}
                  >
                    <Clock className="h-3 w-3" />
                    {w.label}
                    <span className="text-[10px] opacity-70">
                      {w.startUtcHour}:00–{w.endUtcHour}:00 UTC
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active windows list */}
            {draft.tradingWindows.length > 0 && (
              <div className="space-y-1.5">
                {draft.tradingWindows.map((w) => (
                  <div
                    key={w.label}
                    className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <ChevronRight className="h-3 w-3 text-signal" />
                      <span className="font-medium">{w.label}</span>
                      <span className="font-mono text-muted-foreground">
                        {w.startUtcHour.toString().padStart(2, "0")}:00 –{" "}
                        {w.endUtcHour.toString().padStart(2, "0")}:00 UTC
                      </span>
                    </div>
                    <button
                      onClick={() => removeWindow(w.label)}
                      className="rounded p-1 text-muted-foreground hover:text-bear"
                      aria-label={`Remove ${w.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {draft.tradingWindows.length === 0 && (
              <div className="rounded-lg border border-dashed border-border/60 px-3 py-3 text-center text-[11px] text-muted-foreground">
                No time restriction — engine runs 24/7
              </div>
            )}
          </Section>

          {/* ── Allowed symbols ──────────────────────────────────────────── */}
          <Section icon={<Layers className="h-4 w-4" />} title="Allowed Symbols">
            <p className="text-[11px] text-muted-foreground mb-2">
              Leave all unselected to trade any symbol. Select specific ones to restrict.
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {SYMBOLS.map((s) => {
                const active = draft.allowedSymbols.includes(s.code);
                const kindColor =
                  s.kind === "metal"
                    ? "text-[var(--gold)]"
                    : s.kind === "synthetic"
                      ? "text-signal"
                      : "text-muted-foreground";
                return (
                  <button
                    key={s.code}
                    onClick={() => toggleSymbol(s.code)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                      active
                        ? "border-signal/50 bg-signal/10 text-foreground"
                        : "border-border/60 bg-background/30 text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${active ? "bg-signal" : "bg-muted-foreground/40"}`}
                      />
                      <span className="font-medium">{s.label}</span>
                    </div>
                    <span className={`font-mono text-[10px] ${kindColor}`}>
                      {s.kind.toUpperCase()}
                    </span>
                  </button>
                );
              })}
            </div>
            {draft.allowedSymbols.length === 0 && (
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                All symbols eligible
              </p>
            )}
          </Section>

          {/* ── Scan interval note ───────────────────────────────────────── */}
          <Section icon={<PercentIcon className="h-4 w-4" />} title="Summary">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <SummaryCell label="Min confidence" value={`${draft.minConfidence}%`} />
              <SummaryCell label="Max drawdown" value={`$${draft.maxDailyDrawdown}`} />
              <SummaryCell label="Max positions" value={`${draft.maxOpenPositions}`} />
              <SummaryCell label="Risk/trade" value={`${draft.riskPct}%`} />
              <SummaryCell label="RR ratio" value={`1:${draft.rrRatio}`} />
              <SummaryCell label="Scan every" value={`${draft.scanIntervalMs / 1000}s`} />
              <SummaryCell
                label="Time windows"
                value={draft.tradingWindows.length ? draft.tradingWindows.map((w) => w.label).join(", ") : "24/7"}
              />
              <SummaryCell
                label="Symbols"
                value={draft.allowedSymbols.length ? `${draft.allowedSymbols.length} selected` : "All"}
              />
            </div>
          </Section>
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-3 border-t border-border/60 px-5 py-4">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:border-signal/40 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5 rotate-45" /> Reset defaults
          </button>
          <button
            onClick={handleSave}
            className="ml-auto flex items-center gap-1.5 rounded-md bg-signal px-5 py-2 text-xs font-bold text-background hover:opacity-90"
          >
            <Bot className="h-3.5 w-3.5" /> Save & Apply
          </button>
        </div>
      </aside>
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */
function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        <span className="text-signal">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function SliderField({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  color,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  color: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1.5 rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span
          className="font-mono text-sm font-bold"
          style={{ color }}
        >
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: color }}
      />
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </label>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/40 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-mono text-xs text-foreground">{value}</div>
    </div>
  );
}
