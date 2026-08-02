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
  const [audioEnabled, setAudioEnabled] = useState(true);

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
    return () => {
      cancelled = true;
    };
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
        const closed: ClosedTrade = {
          ...p,
          exit,
          pnl: pnlOf(p, exit),
          closedAt: Date.now(),
        };
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
    if (!candles.length) return;
    setAnalyzing(true);
    setTimeout(() => {
      setAnalysis(analyzeMarket(candles, price));
      setAnalyzing(false);
    }, 600);
  }

  /* ── Core execute function (used by both manual and auto-pilot) ──────── */
  async function execute(
    plan: ExecutionPlan,
  ): Promise<{ latencyMs?: number; contractId?: string }> {
    const conn = connRef.current;
    if (!conn || status !== "connected") {
      toast.error("Not connected to Deriv. Check your API settings.");
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

        // Subscribe to live P&L stream for this contract
        if (res.contractId) {
          conn.subscribeOpenContract(res.contractId, (update) => {
            if (update.status === "won") {
              closePosition(res.id, update.currentSpot, "take profit hit");
            } else if (update.status === "lost") {
              closePosition(res.id, update.currentSpot, "stop loss hit");
            }
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

  /* ── Auto-Pilot toggle handler (with audio) ──────────────────────────── */
  function handleToggleAutoPilot(next: boolean) {
    setAutoPilot(next);
    if (audioEnabled) {
      if (next) {
        playAutoPilotOn();
        toast.success("Auto-Pilot ACTIVATED — engine scanning for confluences");
      } else {
        playAutoPilotOff();
        toast("Auto-Pilot STANDBY — returning to manual mode");
      }
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
    onExecute: async (plan, _signal) => {
      return execute(plan);
    },
    onSignalDetected: (signal: AutonomousSignal) => {
      if (!audioEnabled) return;
      if (signal.autoExecuted) {
        playExecutionConfirm();
      } else if (signal.outcome === "SKIPPED") {
        playSignalAlert("BLOCK");
      } else {
        playSignalAlert(signal.side);
      }
    },
  });

  /* ── Sync engine's latest analysis into the panel analysis state ─────── */
  useEffect(() => {
    if (engine.latestAnalysis && !analysis) {
      setAnalysis(engine.latestAnalysis);
    }
  }, [engine.latestAnalysis, analysis]);

  function closeAll() {
    positions.forEach((p) => closePosition(p.id, prices[p.symbol] ?? p.entry));
    toast("All positions closed");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster />

      {/* ── Header with Auto-Pilot controls ──────────────────────────────── */}
      <TerminalHeader
        status={status}
        account={account}
        autoPilot={autoPilot}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleAutoPilot={handleToggleAutoPilot}
        onOpenAutoPilotConfig={() => setAutoPilotConfigOpen(true)}
      />

      <main className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <h1 className="sr-only">
          PalTrade Deriv trading terminal for forex and synthetic indices
        </h1>

        {/* ── Left column ────────────────────────────────────────────────── */}
        <div className="space-y-4">
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

          {/* ── MT5-style live trade feed ─────────────────────────────── */}
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

          {/* ── Audit log — full width below positions ────────────────────── */}
          <AuditLog
            signals={engine.signalFeed}
            stats={engine.stats}
            onClear={engine.clearFeed}
          />
        </div>

        {/* ── Right column — strategy & AI panel ───────────────────────── */}
        <StrategyPanel
          symbol={symbol}
          price={price}
          balance={account?.balance ?? 10000}
          analysis={analysis ?? engine.latestAnalysis}
          analyzing={analyzing}
          tripleMode={tripleMode}
          executing={executing}
          onToggleTriple={setTripleMode}
          onAnalyze={() => {
            runAnalysis();
            // Also trigger the engine scanner so its analysis stays in sync
            engine.triggerScan();
          }}
          onExecute={execute}
        />
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
