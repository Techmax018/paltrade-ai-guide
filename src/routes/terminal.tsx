import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TerminalHeader } from "@/components/terminal/TerminalHeader";
import { ChartContainer } from "@/components/terminal/ChartContainer";
import { StrategyPanel, type ExecutionPlan } from "@/components/terminal/StrategyPanel";
import { PositionsTable, pnlOf, type ClosedTrade, type Position } from "@/components/terminal/PositionsTable";
import { SettingsModal, type SettingsValues } from "@/components/terminal/SettingsModal";
import { AutoPilotConfigDrawer } from "@/components/terminal/AutoPilotConfig";
import { AuditLog } from "@/components/terminal/AuditLog";
import { TradeFeed } from "@/components/terminal/TradeFeed";
import {
  useAutonomousEngine,
  DEFAULT_CONFIG,
  type AutoPilotConfig,
  type AutonomousSignal,
} from "@/hooks/useAutonomousEngine";
import {
  SYMBOLS,
  connectWebSocket,
  type AccountInfo,
  type Candle,
  type ConnectionStatus,
  type DerivConnection,
  type Timeframe,
} from "@/lib/derivApi";
import { analyzeMarket, type Analysis } from "@/lib/analysis";
import {
  playAutoPilotOff,
  playAutoPilotOn,
  playExecutionConfirm,
  playSignalAlert,
} from "@/lib/audio";
import { getOrigin } from "@/lib/og";
import { Link } from "@tanstack/react-router";
import {
  BarChart2,
  Brain,
  ChevronRight,
  KeyRound,
  Link2,
  Plug,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/terminal")({
  loader: async () => ({ origin: await getOrigin() }),
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? "";
    const img = `${origin}/og-home.jpg`;
    return {
      meta: [
        { title: "Trading Terminal — PalTrade Deriv Forex & Synthetics" },
        {
          name: "description",
          content:
            "Trade Forex and synthetic indices with live candlestick charts, RSI, EMA and Fibonacci confluence, AI market analysis and one-click Deriv execution.",
        },
        { property: "og:title", content: "PalTrade Terminal — Deriv Forex & Synthetic Trading" },
        {
          property: "og:description",
          content:
            "Live charts, AI strategy engine, lot size calculator and triple-trade execution in one dark terminal.",
        },
        { property: "og:url", content: "/terminal" },
        { property: "og:image", content: img },
        { name: "twitter:image", content: img },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: "/terminal" }],
    };
  },
  component: TerminalPage,
});

function TerminalPage() {
  /* ── API / connection settings ───────────────────────────────────────── */
  const [settings, setSettings] = useState<SettingsValues>({
    appId: "",
    token: "",
    accountType: "demo",
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [account, setAccount] = useState<AccountInfo | null>(null);

  /* ── Chart / symbol state ────────────────────────────────────────────── */
  const [symbolCode, setSymbolCode] = useState(SYMBOLS[0].code);
  const [timeframe, setTimeframe] = useState<Timeframe>("M5");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [overlays, setOverlays] = useState({ fib: true, ema: true, rsi: true });

  /* ── Analysis ────────────────────────────────────────────────────────── */
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  /* ── Trade execution ─────────────────────────────────────────────────── */
  const [tripleMode, setTripleMode] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<ClosedTrade[]>([]);

  /* ── Auto-Pilot ──────────────────────────────────────────────────────── */
  const [autoPilot, setAutoPilot] = useState(false);
  const [autoPilotConfigOpen, setAutoPilotConfigOpen] = useState(false);
  const [autoPilotConfig, setAutoPilotConfig] = useState<AutoPilotConfig>(DEFAULT_CONFIG);

  /* ── Audio toggle (visible in mobile tab bar and sub-bar) ─────────────── */
  const [audioEnabled, setAudioEnabled] = useState(true);

  /* ── Mobile tab switcher ─────────────────────────────────────────────── */
  const [mobileTab, setMobileTab] = useState<"chart" | "strategy">("chart");

  /* ── Derived ─────────────────────────────────────────────────────────── */
  const connRef = useRef<DerivConnection | null>(null);
  const symbol = useMemo(
    () => SYMBOLS.find((s) => s.code === symbolCode) ?? SYMBOLS[0],
    [symbolCode],
  );
  const price = prices[symbolCode] ?? candles.at(-1)?.close ?? symbol.basePrice;

  /* ── Today's realised loss tracker ──────────────────────────────────── */
  const todayLoss = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return history
      .filter((h) => h.closedAt >= todayStart.getTime() && h.pnl < 0)
      .reduce((acc, h) => acc + Math.abs(h.pnl), 0);
  }, [history]);

  /* ── WebSocket connect / reconnect ───────────────────────────────────── */
  useEffect(() => {
    const conn = connectWebSocket({
      appId: settings.appId,
      token: settings.token,
      accountType: settings.accountType,
    });
    connRef.current = conn;
    const offStatus = conn.onStatus(setStatus);
    const offAccount = conn.onAccount(setAccount);
    return () => {
      offStatus();
      offAccount();
      conn.disconnect();
    };
  }, [settings.appId, settings.token, settings.accountType]);

  /* ── Candle fetch ────────────────────────────────────────────────────── */
  const [seedPrice, setSeedPrice] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSeedPrice(null);
    connRef.current?.getCandles(symbolCode, timeframe, 300).then((c) => {
      if (cancelled) return;
      setCandles(c);
      setSeedPrice(c.at(-1)?.close ?? null);
    });
    return () => { cancelled = true; };
  }, [symbolCode, timeframe, status]);

  /* ── Tick subscription ───────────────────────────────────────────────── */
  useEffect(() => {
    const conn = connRef.current;
    if (!conn || status !== "connected" || seedPrice === null) return;
    const off = conn.subscribeTicks(
      symbolCode,
      (t) => {
        setPrices((p) => ({ ...p, [t.symbol]: t.quote }));
        setCandles((cs) => {
          if (!cs.length) return cs;
          const next = cs.slice();
          const last = { ...next[next.length - 1] };
          last.close = t.quote;
          last.high = Math.max(last.high, t.quote);
          last.low = Math.min(last.low, t.quote);
          next[next.length - 1] = last;
          return next;
        });
      },
      seedPrice,
    );
    return off;
  }, [symbolCode, status, seedPrice]);

  /* ── Position close helper ───────────────────────────────────────────── */
  const closePosition = useCallback(
    (id: string, exitPrice?: number, reason?: string) => {
      setPositions((cur) => {
        const p = cur.find((x) => x.id === id);
        if (!p) return cur;
        const exit = exitPrice ?? p.entry;
        const closed: ClosedTrade = { ...p, exit, pnl: pnlOf(p, exit), closedAt: Date.now() };
        setHistory((h) => [closed, ...h].slice(0, 100));
        if (reason) toast(`${p.label} closed — ${reason}`);
        return cur.filter((x) => x.id !== id);
      });
    },
    [],
  );

  /* ── SL / TP auto-monitor ────────────────────────────────────────────── */
  useEffect(() => {
    positions.forEach((p) => {
      const cur = prices[p.symbol];
      if (!cur) return;
      const hitTp = p.side === "BUY" ? cur >= p.takeProfit : cur <= p.takeProfit;
      const hitSl = p.side === "BUY" ? cur <= p.stopLoss : cur >= p.stopLoss;
      if (hitTp) closePosition(p.id, p.takeProfit, "take profit hit");
      else if (hitSl) closePosition(p.id, p.stopLoss, "stop loss hit");
    });
  }, [prices, positions, closePosition]);

  /* ── Manual analysis trigger ─────────────────────────────────────────── */
  function runAnalysis() {
    if (!candles.length) {
      toast.error("No candle data yet — waiting for live data to load.");
      return;
    }
    setAnalyzing(true);
    // Reset stale analysis first so the UI shows the spinner
    setAnalysis(null);
    setTimeout(() => {
      setAnalysis(analyzeMarket(candles, price));
      setAnalyzing(false);
    }, 600);
  }

  /* ── Core execute function ───────────────────────────────────────────── */
  async function execute(
    plan: ExecutionPlan,
  ): Promise<{ latencyMs?: number; contractId?: string }> {
    const conn = connRef.current;
    if (!conn || status !== "connected") {
      toast.error("Not connected to Deriv. Open API Settings and enter your credentials.");
      return {};
    }

    setExecuting(true);
    const targets = plan.tripleMode
      ? plan.targets
      : [plan.targets[Math.min(1, plan.targets.length - 1)]];

    let lastLatency: number | undefined;
    let lastContractId: string | undefined;

    try {
      for (let i = 0; i < targets.length; i++) {
        const tp = targets[i];
        const res = await conn.placeTrade({
          symbol: symbol.code,
          side: plan.side,
          lots: plan.lots,
          entry: price,
          stopLoss: plan.stopLoss,
          takeProfit: tp,
          label: plan.tripleMode ? `TP${i + 1}` : "TP",
        });

        if (!res.ok) {
          toast.error(res.message);
          continue;
        }

        lastLatency = res.latencyMs;
        lastContractId = res.contractId;

        setPositions((cur) => [
          ...cur,
          {
            id: res.id,
            symbol: symbol.code,
            symbolLabel: symbol.label,
            side: plan.side,
            lots: plan.lots,
            entry: price,
            stopLoss: plan.stopLoss,
            takeProfit: tp,
            label: plan.tripleMode ? `TP${i + 1}` : "TP",
            openedAt: res.openedAt,
            pipSize: symbol.pipSize,
            pipValuePerLot: symbol.pipValuePerLot,
          },
        ]);

        if (res.contractId) {
          conn.subscribeOpenContract(res.contractId, (update) => {
            if (update.status === "won") closePosition(res.id, update.currentSpot, "take profit hit");
            else if (update.status === "lost") closePosition(res.id, update.currentSpot, "stop loss hit");
          });
        }
      }

      if (audioEnabled) playExecutionConfirm();
      toast.success(
        `${plan.side} ${plan.lots.toFixed(2)} ${symbol.label}${plan.tripleMode ? " · triple-trade" : ""} executed${lastLatency ? ` (${lastLatency}ms)` : ""}`,
      );
    } finally {
      setExecuting(false);
    }

    return { latencyMs: lastLatency, contractId: lastContractId };
  }

  /* ── Auto-Pilot toggle ───────────────────────────────────────────────── */
  function handleToggleAutoPilot(next: boolean) {
    setAutoPilot(next);
    if (audioEnabled) {
      if (next) { playAutoPilotOn(); toast.success("Auto-Pilot ACTIVATED — engine scanning for confluences"); }
      else { playAutoPilotOff(); toast("Auto-Pilot STANDBY — returning to manual mode"); }
    } else {
      toast(next ? "Auto-Pilot ACTIVATED" : "Auto-Pilot STANDBY");
    }
  }

  /* ── Autonomous engine ───────────────────────────────────────────────── */
  const engine = useAutonomousEngine({
    autoPilot,
    config: autoPilotConfig,
    symbol,
    candles,
    price,
    positions,
    connection: connRef.current,
    todayLoss,
    onExecute: async (plan, _signal) => execute(plan),
    onSignalDetected: (signal: AutonomousSignal) => {
      if (!audioEnabled) return;
      if (signal.autoExecuted) playExecutionConfirm();
      else if (signal.outcome === "SKIPPED") playSignalAlert("BLOCK");
      else playSignalAlert(signal.side);
    },
  });

  /* ── Sync engine analysis into panel ────────────────────────────────── */
  useEffect(() => {
    if (engine.latestAnalysis && !analysis) setAnalysis(engine.latestAnalysis);
  }, [engine.latestAnalysis, analysis]);

  function closeAll() {
    positions.forEach((p) => closePosition(p.id, prices[p.symbol] ?? p.entry));
    toast("All positions closed");
  }

  /* ── Effective analysis (live analysis or engine fallback) ───────────── */
  const effectiveAnalysis = analysis ?? engine.latestAnalysis;

  /* ── Connection gate — show onboarding screen if no account linked ───── */
  const hasCredentials = !!(settings.appId || settings.token);
  const hasBrokerConnection = (() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = JSON.parse(localStorage.getItem("paltrade.connections.v1") || "[]");
      return Array.isArray(stored) && stored.length > 0;
    } catch { return false; }
  })();

  if (!hasCredentials && !hasBrokerConnection) {
    return <ConnectGate onUseSettings={() => setSettingsOpen(true)} settingsOpen={settingsOpen}
      settingsValues={settings} onCloseSettings={() => setSettingsOpen(false)}
      onSaveSettings={(v) => { setSettings(v); setSettingsOpen(false); }} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-right" richColors />

      <TerminalHeader
        status={status}
        account={account}
        autoPilot={autoPilot}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleAutoPilot={handleToggleAutoPilot}
        onOpenAutoPilotConfig={() => setAutoPilotConfigOpen(true)}
      />

      {/* ── Mobile tab bar — visible below lg only ─────────────────────── */}
      <MobileTabBar
        activeTab={mobileTab}
        audioEnabled={audioEnabled}
        onChange={setMobileTab}
        onToggleAudio={() => setAudioEnabled((v) => !v)}
      />

      <main className="mx-auto grid w-full max-w-[1600px] gap-4 px-2 py-3 sm:px-4 sm:py-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <h1 className="sr-only">PalTrade Deriv trading terminal for forex and synthetic indices</h1>

        {/* ── Left column ────────────────────────────────────────────────── */}
        <div className={`space-y-4 ${mobileTab === "strategy" ? "hidden lg:block" : "block"}`}>
          <ChartContainer
            candles={candles}
            symbol={symbol}
            timeframe={timeframe}
            price={price}
            showFib={overlays.fib}
            showEma={overlays.ema}
            showRsi={overlays.rsi}
            positions={positions}
            prices={prices}
            onSymbolChange={setSymbolCode}
            onTimeframeChange={setTimeframe}
            onToggle={(k) => setOverlays((o) => ({ ...o, [k]: !o[k] }))}
          />
          <TradeFeed
            symbol={symbol}
            prices={prices}
            positions={positions}
            history={history}
          />
          <PositionsTable
            positions={positions}
            history={history}
            prices={prices}
            symbol={symbol}
            onClose={(id) => closePosition(id, prices[symbolCode])}
            onCloseAll={closeAll}
          />
          <AuditLog
            signals={engine.signalFeed}
            stats={engine.stats}
            onClear={engine.clearFeed}
          />
        </div>

        {/* ── Right column ─────────────────────────────────────────────── */}
        <div className={mobileTab === "chart" ? "hidden lg:block" : "block"}>
          <StrategyPanel
            symbol={symbol}
            price={price}
            balance={account?.balance ?? 10000}
            analysis={effectiveAnalysis}
            analyzing={analyzing}
            tripleMode={tripleMode}
            executing={executing}
            onToggleTriple={setTripleMode}
            onAnalyze={() => { runAnalysis(); engine.triggerScan(); }}
            onExecute={execute}
          />
        </div>
      </main>

      {/* ── Modals / drawers ─────────────────────────────────────────────── */}
      <SettingsModal
        open={settingsOpen}
        values={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={(v) => {
          setSettings(v);
          setSettingsOpen(false);
          toast.success("Settings saved — reconnecting to Deriv");
        }}
      />

      <AutoPilotConfigDrawer
        open={autoPilotConfigOpen}
        config={autoPilotConfig}
        onClose={() => setAutoPilotConfigOpen(false)}
        onSave={(cfg) => {
          setAutoPilotConfig(cfg);
          toast.success("Auto-Pilot configuration updated");
        }}
      />
    </div>
  );
}

/* ── MobileTabBar ─────────────────────────────────────────────────────────── */
function MobileTabBar({
  activeTab,
  audioEnabled,
  onChange,
  onToggleAudio,
}: {
  activeTab: "chart" | "strategy";
  audioEnabled: boolean;
  onChange: (tab: "chart" | "strategy") => void;
  onToggleAudio: () => void;
}) {
  return (
    <div className="flex items-center gap-0 border-b border-border/60 bg-card/80 px-2 lg:hidden">
      <button
        onClick={() => onChange("chart")}
        className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
          activeTab === "chart"
            ? "border-b-2 border-signal text-signal"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <BarChart2 className="h-3.5 w-3.5" />
        Chart & Feed
      </button>

      <button
        onClick={() => onChange("strategy")}
        className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
          activeTab === "strategy"
            ? "border-b-2 border-signal text-signal"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Brain className="h-3.5 w-3.5" />
        AI Strategy
      </button>

      {/* Audio toggle — right side of tab bar */}
      <button
        onClick={onToggleAudio}
        aria-label={audioEnabled ? "Mute audio alerts" : "Enable audio alerts"}
        title={audioEnabled ? "Mute alerts" : "Enable alerts"}
        className={`ml-1 rounded-md border p-1.5 transition-colors ${
          audioEnabled
            ? "border-signal/40 bg-signal/10 text-signal"
            : "border-border text-muted-foreground"
        }`}
      >
        {audioEnabled
          ? <Volume2 className="h-3.5 w-3.5" />
          : <VolumeX className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/* ── ConnectGate ──────────────────────────────────────────────────────────── */
/**
 * Full-screen gate shown when no Deriv account is connected and no
 * API credentials have been saved in Settings. The user must either:
 *   1. Go to the Brokers page to add a Deriv connection, or
 *   2. Enter their App ID + token directly in API Settings.
 *
 * Once either action completes the gate checks localStorage / settings
 * state and disappears automatically because `hasCredentials` or
 * `hasBrokerConnection` will become truthy.
 */
function ConnectGate({
  onUseSettings,
  settingsOpen,
  settingsValues,
  onCloseSettings,
  onSaveSettings,
}: {
  onUseSettings: () => void;
  settingsOpen: boolean;
  settingsValues: import("@/components/terminal/SettingsModal").SettingsValues;
  onCloseSettings: () => void;
  onSaveSettings: (v: import("@/components/terminal/SettingsModal").SettingsValues) => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
      {/* Glow backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 40%, oklch(0.74 0.13 205 / 0.10) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md space-y-6 text-center">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <img
            src="/android-chrome-192x192.png"
            alt="PalTrade"
            className="h-16 w-16 rounded-2xl object-cover shadow-glow"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Pal<span className="text-signal">Trade</span> Terminal
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect a Deriv account to start trading
            </p>
          </div>
        </div>

        {/* Options card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card space-y-4 text-left">
          {/* Option 1 — Brokers page */}
          <Link
            to="/brokers"
            className="flex items-center gap-4 rounded-xl border border-signal/30 bg-signal/5 p-4 transition hover:bg-signal/10"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-signal/15 text-signal">
              <Plug className="h-5 w-5" />
            </span>
            <div>
              <div className="font-semibold text-sm">Connect via Brokers page</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Add your Deriv or Vantage account and return to the terminal.
              </div>
            </div>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/60" />
            <span className="text-[11px] text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border/60" />
          </div>

          {/* Option 2 — API Settings */}
          <button
            onClick={onUseSettings}
            className="flex w-full items-center gap-4 rounded-xl border border-border bg-background/40 p-4 transition hover:border-signal/30 hover:bg-signal/5"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <KeyRound className="h-5 w-5" />
            </span>
            <div className="text-left">
              <div className="font-semibold text-sm">Enter API credentials directly</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Paste your Deriv App ID and API token to connect without the Brokers page.
              </div>
            </div>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </div>

        {/* What you get */}
        <div className="rounded-xl border border-border/60 bg-card/40 p-4 text-left space-y-2">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            What you get after connecting
          </div>
          {[
            { icon: <Zap className="h-3.5 w-3.5 text-signal" />, text: "Live Deriv WebSocket price feed" },
            { icon: <Link2 className="h-3.5 w-3.5 text-profit" />, text: "Real account balance & equity" },
            { icon: <BarChart2 className="h-3.5 w-3.5 text-[var(--gold)]" />, text: "1-click & auto-pilot trade execution" },
          ].map((item) => (
            <div key={item.text} className="flex items-center gap-2 text-xs text-muted-foreground">
              {item.icon}
              {item.text}
            </div>
          ))}
        </div>

        {/* Back to home */}
        <Link
          to="/"
          className="inline-block text-xs text-muted-foreground hover:text-foreground transition"
        >
          ← Back to home
        </Link>
      </div>

      {/* Settings modal (for option 2) */}
      <SettingsModal
        open={settingsOpen}
        values={settingsValues}
        onClose={onCloseSettings}
        onSave={onSaveSettings}
      />
    </div>
  );
}
