/**
 * ChartContainer.tsx — MT5-style interactive trading chart
 *
 * Features:
 *  • Mouse-wheel zoom (horizontal, candle-count based)
 *  • Click-drag pan (left/right scroll through history)
 *  • Crosshair cursor with price label on Y-axis and time label on X-axis
 *  • Price ruler (Y-axis) and time ruler (X-axis) with auto-scaled ticks
 *  • EMA 50/200 polyline overlays
 *  • RSI(14) sub-panel
 *  • Fibonacci retracement level lines
 *  • Trade markers: entry arrow, SL/TP dashed lines with labels
 *  • Horizontal line drawing tool (click to place, drag to move)
 *  • Measure tool (click-drag to measure pip distance and candle count)
 *  • Active-candle OHLC tooltip
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Crosshair,
  Minus,
  Move,
  Ruler,
  TrendingUp,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Candle, DerivSymbol, Timeframe } from "@/lib/derivApi";
import { SYMBOLS, ema, rsi, fibRetracement } from "@/lib/derivApi";
import type { Position } from "./PositionsTable";

const TIMEFRAMES: Timeframe[] = ["M1", "M5", "M15", "H1"];
const CHART_W = 1000;
const CHART_H = 420;
const RSI_H = 110;
const Y_AXIS_W = 72; // right-side price axis width
const X_AXIS_H = 24; // bottom time axis height
const MIN_VISIBLE = 20;
const MAX_VISIBLE = 300;

export type DrawTool = "none" | "hline" | "measure";

export interface HLine {
  id: string;
  price: number;
  color: string;
}

export interface MeasureRange {
  startIdx: number;
  endIdx: number;
  startPrice: number;
  endPrice: number;
}


export function ChartContainer({
  candles,
  symbol,
  timeframe,
  price,
  showFib,
  showEma,
  showRsi,
  positions = [],
  prices = {},
  onSymbolChange,
  onTimeframeChange,
  onToggle,
}: {
  candles: Candle[];
  symbol: DerivSymbol;
  timeframe: Timeframe;
  price: number;
  showFib: boolean;
  showEma: boolean;
  showRsi: boolean;
  positions?: Position[];
  prices?: Record<string, number>;
  onSymbolChange: (code: string) => void;
  onTimeframeChange: (t: Timeframe) => void;
  onToggle: (key: "fib" | "ema" | "rsi") => void;
}) {
  /* ── View state ─────────────────────────────────────────────────────── */
  const [visibleCount, setVisibleCount] = useState(90);
  const [offsetFromEnd, setOffsetFromEnd] = useState(0); // candles scrolled left
  const [activeTool, setActiveTool] = useState<DrawTool>("none");
  const [hlines, setHlines] = useState<HLine[]>([]);
  const [measure, setMeasure] = useState<MeasureRange | null>(null);
  const [draggingHline, setDraggingHline] = useState<string | null>(null);

  /* ── Crosshair state ────────────────────────────────────────────────── */
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);

  /* ── Pan/drag state ─────────────────────────────────────────────────── */
  const panRef = useRef<{ startX: number; startOffset: number } | null>(null);
  const measureRef = useRef<{ startX: number; startY: number; startIdx: number; startPrice: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);


  const decimals = symbol.pipSize < 0.001 ? 5 : symbol.pipSize < 0.1 ? 3 : 2;
  const fmt = (v: number) => v.toFixed(decimals);

  /* ── Derive visible window ──────────────────────────────────────────── */
  const view = useMemo(() => {
    const total = candles.length;
    const end = Math.max(0, total - offsetFromEnd);
    const start = Math.max(0, end - visibleCount);
    return candles.slice(start, end);
  }, [candles, visibleCount, offsetFromEnd]);

  const viewStartIdx = useMemo(() => {
    const total = candles.length;
    const end = Math.max(0, total - offsetFromEnd);
    return Math.max(0, end - visibleCount);
  }, [candles.length, visibleCount, offsetFromEnd]);

  /* ── Indicator series (computed over ALL candles, sliced to view) ───── */
  const closes = useMemo(() => candles.map((c) => c.close), [candles]);
  const e50Full = useMemo(() => ema(closes, 50), [closes]);
  const e200Full = useMemo(() => ema(closes, 200), [closes]);
  const rsiFullSeries = useMemo(() => rsi(closes, 14), [closes]);
  const fib = useMemo(() => fibRetracement(candles, 60), [candles]);

  const e50 = useMemo(() => e50Full.slice(viewStartIdx, viewStartIdx + view.length), [e50Full, viewStartIdx, view.length]);
  const e200 = useMemo(() => e200Full.slice(viewStartIdx, viewStartIdx + view.length), [e200Full, viewStartIdx, view.length]);
  const rsiSeries = useMemo(() => rsiFullSeries.slice(viewStartIdx, viewStartIdx + view.length), [rsiFullSeries, viewStartIdx, view.length]);


  /* ── Price scaling ──────────────────────────────────────────────────── */
  const fibPrices = showFib && fib ? fib.levels.map((l) => l.price) : [];
  const hlPrices = hlines.map((h) => h.price);
  const tradeLevel = positions.flatMap((p) => [p.entry, p.stopLoss, p.takeProfit]);

  const highs = view.map((c) => c.high);
  const lows = view.map((c) => c.low);
  const allPrices = [...highs, ...lows, ...fibPrices, ...hlPrices, ...tradeLevel, price];
  const rawMax = Math.max(...allPrices);
  const rawMin = Math.min(...allPrices);
  const pad = (rawMax - rawMin) * 0.08 || price * 0.002;
  const max = rawMax + pad;
  const min = rawMin - pad;
  const span = max - min || 1;

  const PLOT_W = CHART_W - Y_AXIS_W;
  const PLOT_H = CHART_H - X_AXIS_H;

  const y = useCallback((v: number) => ((max - v) / span) * PLOT_H, [max, span, PLOT_H]);
  const priceAtY = useCallback((py: number) => max - (py / PLOT_H) * span, [max, span, PLOT_H]);

  const bw = PLOT_W / Math.max(view.length, 1);
  const candleX = (i: number) => i * bw + bw / 2;
  const idxAtX = useCallback((px: number) => Math.round((px / PLOT_W) * (view.length - 1)), [PLOT_W, view.length]);

  /* ── SVG coordinate helpers ─────────────────────────────────────────── */
  function svgCoordsFromEvent(e: ReactPointerEvent<SVGSVGElement> | MouseEvent): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = CHART_W / rect.width;
    const scaleY = (CHART_H + (showRsi ? RSI_H : 0)) / rect.height;
    return {
      x: ((e as MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as MouseEvent).clientY - rect.top) * scaleY,
    };
  }


  /* ── Wheel zoom ─────────────────────────────────────────────────────── */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setVisibleCount((prev) => {
        const delta = e.deltaY > 0 ? Math.ceil(prev * 0.12) : -Math.ceil(prev * 0.12);
        return Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, prev + delta));
      });
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, []);

  /* ── Pointer move: crosshair + hovered candle ───────────────────────── */
  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const { x, y: py } = svgCoordsFromEvent(e);
    if (x > PLOT_W) { setCrosshair(null); return; }
    setCrosshair({ x, y: py });

    const idx = Math.floor(x / bw);
    if (idx >= 0 && idx < view.length) setHoveredCandle(view[idx]);

    // Drag pan
    if (panRef.current && activeTool === "none") {
      const dx = x - panRef.current.startX;
      const candlesDelta = Math.round(-dx / bw);
      const next = Math.max(0, Math.min(candles.length - visibleCount, panRef.current.startOffset + candlesDelta));
      setOffsetFromEnd(next);
    }

    // Drag hline
    if (draggingHline) {
      const p = priceAtY(py);
      setHlines((hl) => hl.map((h) => h.id === draggingHline ? { ...h, price: p } : h));
    }

    // Drag measure
    if (measureRef.current && activeTool === "measure") {
      const endIdx = Math.max(0, Math.min(view.length - 1, idxAtX(x)));
      const endPrice = priceAtY(py);
      setMeasure({ startIdx: measureRef.current.startIdx, endIdx, startPrice: measureRef.current.startPrice, endPrice });
    }
  }


  /* ── Pointer down ───────────────────────────────────────────────────── */
  function handlePointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    const { x, y: py } = svgCoordsFromEvent(e);
    if (x > PLOT_W) return;
    (e.target as SVGSVGElement).setPointerCapture(e.pointerId);

    if (activeTool === "none") {
      panRef.current = { startX: x, startOffset: offsetFromEnd };
      return;
    }
    if (activeTool === "hline") {
      const p = priceAtY(py);
      const id = `hl-${Date.now()}`;
      setHlines((prev) => [...prev, { id, price: p, color: "var(--signal)" }]);
      setDraggingHline(id);
      return;
    }
    if (activeTool === "measure") {
      const idx = Math.max(0, Math.min(view.length - 1, idxAtX(x)));
      measureRef.current = { startX: x, startY: py, startIdx: idx, startPrice: priceAtY(py) };
      setMeasure(null);
    }
  }

  /* ── Pointer up ─────────────────────────────────────────────────────── */
  function handlePointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    (e.target as SVGSVGElement).releasePointerCapture?.(e.pointerId);
    panRef.current = null;
    setDraggingHline(null);
    measureRef.current = null;
  }

  function handlePointerLeave() {
    setCrosshair(null);
    setHoveredCandle(null);
  }

  /* ── Price axis ticks ───────────────────────────────────────────────── */
  const yTicks = useMemo(() => {
    const tickCount = 8;
    return Array.from({ length: tickCount }, (_, i) => {
      const p = max - (i / (tickCount - 1)) * span;
      return { price: p, y: y(p) };
    });
  }, [max, span, y]);

  /* ── Time axis ticks ────────────────────────────────────────────────── */
  const xTicks = useMemo(() => {
    if (!view.length) return [];
    const step = Math.max(1, Math.round(view.length / 6));
    return view
      .filter((_, i) => i % step === 0)
      .map((c, _, arr) => {
        const i = view.indexOf(c);
        const d = new Date(c.time * 1000);
        const label = arr.length > 20
          ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : d.toLocaleDateString([], { month: "short", day: "numeric" });
        return { x: candleX(i), label };
      });
  }, [view, candleX]);


  /* ── EMA polyline builder ───────────────────────────────────────────── */
  const emaLine = (series: (number | null)[]) =>
    series
      .map((v, i) => (v === null ? null : `${candleX(i)},${y(v)}`))
      .filter(Boolean)
      .join(" ");

  /* ── RSI helpers ────────────────────────────────────────────────────── */
  const ry = (v: number) => RSI_H - (v / 100) * RSI_H;
  const rsiLine = rsiSeries
    .map((v, i) => (v === null ? null : `${candleX(i)},${ry(v)}`))
    .filter(Boolean)
    .join(" ");

  /* ── Measure annotations ────────────────────────────────────────────── */
  const measureAnnotation = useMemo(() => {
    if (!measure) return null;
    const x1 = candleX(measure.startIdx);
    const x2 = candleX(measure.endIdx);
    const y1 = y(measure.startPrice);
    const y2 = y(measure.endPrice);
    const pips = Math.abs(measure.endPrice - measure.startPrice) / symbol.pipSize;
    const candles_ = Math.abs(measure.endIdx - measure.startIdx);
    const bull = measure.endPrice >= measure.startPrice;
    return { x1, x2, y1, y2, pips, candles: candles_, bull };
  }, [measure, candleX, y, symbol.pipSize]);

  /* ── Crosshair price/time labels ────────────────────────────────────── */
  const crosshairPrice = crosshair ? priceAtY(crosshair.y) : null;
  const crosshairIdx = crosshair ? Math.floor(crosshair.x / bw) : -1;
  const crosshairCandle = crosshairIdx >= 0 && crosshairIdx < view.length ? view[crosshairIdx] : null;
  const crosshairTime = crosshairCandle
    ? new Date(crosshairCandle.time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  /* ── Visible positions (those belonging to this symbol) ─────────────── */
  const visiblePositions = positions.filter((p) => p.symbol === symbol.code);
  const totalHeight = CHART_H + (showRsi ? RSI_H : 0);


  return (
    <section className="rounded-2xl border border-border bg-card/60 shadow-card backdrop-blur">
      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <select
          value={symbol.code}
          onChange={(e) => onSymbolChange(e.target.value)}
          aria-label="Select trading symbol"
          className="rounded-md border border-border bg-input px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {SYMBOLS.map((s) => (
            <option key={s.code} value={s.code}>{s.label}</option>
          ))}
        </select>

        <div className="flex rounded-md bg-input p-0.5">
          {TIMEFRAMES.map((t) => (
            <button key={t} onClick={() => onTimeframeChange(t)}
              className={`rounded px-2.5 py-1 text-xs font-semibold ${timeframe === t ? "bg-signal/20 text-signal" : "text-muted-foreground hover:text-foreground"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Draw tools */}
        <div className="flex items-center gap-1 rounded-md bg-input p-0.5">
          <ToolBtn icon={<Move className="h-3.5 w-3.5" />} label="Pan" active={activeTool === "none"} onClick={() => setActiveTool("none")} />
          <ToolBtn icon={<Minus className="h-3.5 w-3.5" />} label="H-Line" active={activeTool === "hline"} onClick={() => setActiveTool("hline")} />
          <ToolBtn icon={<Ruler className="h-3.5 w-3.5" />} label="Measure" active={activeTool === "measure"} onClick={() => { setActiveTool("measure"); setMeasure(null); }} />
          {hlines.length > 0 && (
            <button onClick={() => setHlines([])} title="Clear all lines"
              className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:text-bear">✕ Lines</button>
          )}
        </div>

        {/* Zoom buttons */}
        <div className="flex items-center gap-1">
          <button onClick={() => setVisibleCount((v) => Math.max(MIN_VISIBLE, v - 10))} title="Zoom in" className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-signal"><ZoomIn className="h-3.5 w-3.5" /></button>
          <button onClick={() => setVisibleCount((v) => Math.min(MAX_VISIBLE, v + 10))} title="Zoom out" className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-signal"><ZoomOut className="h-3.5 w-3.5" /></button>
          <span className="text-[10px] text-muted-foreground">{visibleCount}c</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-lg font-semibold text-signal">{fmt(price)}</span>
          {([["ema", "EMA", showEma], ["rsi", "RSI", showRsi], ["fib", "Fib", showFib]] as const).map(([k, lbl, on]) => (
            <button key={k} onClick={() => onToggle(k)}
              className={`rounded-md border px-2.5 py-1 text-xs ${on ? "border-signal/50 bg-signal/10 text-signal" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>


      {/* ── OHLC Tooltip bar ──────────────────────────────────────────── */}
      {hoveredCandle && (
        <div className="flex items-center gap-4 border-b border-border/40 bg-background/60 px-4 py-1 font-mono text-[11px]">
          <span className="text-muted-foreground">O <span className="text-foreground">{fmt(hoveredCandle.open)}</span></span>
          <span className="text-profit">H <span>{fmt(hoveredCandle.high)}</span></span>
          <span className="text-bear">L <span>{fmt(hoveredCandle.low)}</span></span>
          <span className={hoveredCandle.close >= hoveredCandle.open ? "text-profit" : "text-bear"}>
            C {fmt(hoveredCandle.close)}
          </span>
          <span className="text-muted-foreground ml-auto">
            {new Date(hoveredCandle.time * 1000).toLocaleString()}
          </span>
        </div>
      )}

      {/* ── Main SVG chart ────────────────────────────────────────────── */}
      <div className="relative overflow-hidden select-none"
        style={{ cursor: activeTool === "hline" ? "crosshair" : activeTool === "measure" ? "cell" : panRef.current ? "grabbing" : "grab" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${totalHeight}`}
          className="w-full"
          style={{ height: showRsi ? "clamp(360px,55vh,560px)" : "clamp(260px,40vh,460px)" }}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${symbol.label} ${timeframe} interactive chart`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          {/* ── Background grid ─────────────────────────────────────── */}
          {yTicks.map((t) => (
            <line key={t.price} x1="0" x2={PLOT_W} y1={t.y} y2={t.y}
              stroke="var(--border)" strokeWidth="1" opacity="0.5" />
          ))}


          {/* ── Y-axis price ruler ───────────────────────────────────── */}
          <rect x={PLOT_W} y="0" width={Y_AXIS_W} height={CHART_H} fill="var(--card)" opacity="0.92" />
          {yTicks.map((t) => (
            <g key={`yt-${t.price}`}>
              <line x1={PLOT_W} x2={PLOT_W + 6} y1={t.y} y2={t.y} stroke="var(--border)" strokeWidth="1" />
              <text x={PLOT_W + 9} y={t.y + 4} fontSize="10" fill="var(--muted-foreground)" fontFamily="monospace">
                {fmt(t.price)}
              </text>
            </g>
          ))}

          {/* ── X-axis time ruler ───────────────────────────────────── */}
          <rect x="0" y={PLOT_H} width={PLOT_W} height={X_AXIS_H} fill="var(--card)" opacity="0.92" />
          {xTicks.map((t) => (
            <g key={`xt-${t.x}`}>
              <line x1={t.x} x2={t.x} y1={PLOT_H} y2={PLOT_H + 5} stroke="var(--border)" strokeWidth="1" />
              <text x={t.x} y={PLOT_H + 17} fontSize="10" fill="var(--muted-foreground)" fontFamily="monospace" textAnchor="middle">
                {t.label}
              </text>
            </g>
          ))}

          {/* ── Fibonacci levels ─────────────────────────────────────── */}
          {showFib && fib?.levels.map((l) => (
            <g key={l.level}>
              <line x1="0" x2={PLOT_W} y1={y(l.price)} y2={y(l.price)}
                stroke={l.level === 0.618 ? "var(--gold)" : "var(--signal)"}
                strokeDasharray="6 4" strokeWidth="1.5" opacity="0.7" />
              <text x="6" y={y(l.price) - 4} fontSize="11" fill={l.level === 0.618 ? "var(--gold)" : "var(--signal)"} fontFamily="monospace">
                {l.level} · {fmt(l.price)}
              </text>
            </g>
          ))}


          {/* ── Candlesticks ─────────────────────────────────────────── */}
          {view.map((c, i) => {
            const up = c.close >= c.open;
            const color = up ? "var(--profit)" : "var(--bear)";
            const cx = candleX(i);
            const bodyTop = y(Math.max(c.open, c.close));
            const bodyBot = y(Math.min(c.open, c.close));
            const bodyH = Math.max(bodyBot - bodyTop, 1);
            const wickW = Math.max(1, bw * 0.12);
            const bodyW = Math.max(bw * 0.62, 2);
            return (
              <g key={c.time}>
                {/* Wick */}
                <rect x={cx - wickW / 2} y={y(c.high)} width={wickW} height={Math.max(y(c.low) - y(c.high), 1)} fill={color} />
                {/* Body */}
                <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH}
                  fill={up ? "var(--profit)" : "var(--bear)"}
                  stroke={up ? "var(--profit)" : "var(--bear)"}
                  strokeWidth="0.5"
                  opacity={hoveredCandle?.time === c.time ? 1 : 0.88}
                />
              </g>
            );
          })}

          {/* ── EMA overlays ─────────────────────────────────────────── */}
          {showEma && (
            <>
              <polyline points={emaLine(e50)} fill="none" stroke="var(--signal)" strokeWidth="1.8" />
              <polyline points={emaLine(e200)} fill="none" stroke="var(--gold)" strokeWidth="1.8" />
              {/* EMA legend */}
              <rect x="8" y="6" width="80" height="14" rx="3" fill="var(--card)" opacity="0.7" />
              <text x="14" y="17" fontSize="10" fill="var(--signal)" fontFamily="monospace">EMA50</text>
              <rect x="72" y="6" width="82" height="14" rx="3" fill="var(--card)" opacity="0.7" />
              <text x="78" y="17" fontSize="10" fill="var(--gold)" fontFamily="monospace">EMA200</text>
            </>
          )}


          {/* ── Live price line ───────────────────────────────────────── */}
          <line x1="0" x2={PLOT_W} y1={y(price)} y2={y(price)}
            stroke="var(--foreground)" strokeDasharray="3 5" strokeWidth="1" opacity="0.7" />
          <rect x={PLOT_W} y={y(price) - 9} width={Y_AXIS_W} height="18" rx="3" fill="var(--signal)" />
          <text x={PLOT_W + Y_AXIS_W / 2} y={y(price) + 4} fontSize="11" fill="var(--background)"
            fontFamily="monospace" textAnchor="middle" fontWeight="bold">
            {fmt(price)}
          </text>

          {/* ── Trade markers (entry arrow, SL / TP lines) ───────────── */}
          {visiblePositions.map((pos) => {
            const entryY = y(pos.entry);
            const slY = y(pos.stopLoss);
            const tpY = y(pos.takeProfit);
            const isBuy = pos.side === "BUY";
            const cur = prices[pos.symbol] ?? pos.entry;
            const pnl = ((cur - pos.entry) / symbol.pipSize) * (isBuy ? 1 : -1) * symbol.pipValuePerLot * pos.lots;
            const pnlColor = pnl >= 0 ? "var(--profit)" : "var(--bear)";
            return (
              <g key={pos.id}>
                {/* SL dashed line */}
                <line x1="0" x2={PLOT_W} y1={slY} y2={slY}
                  stroke="var(--bear)" strokeDasharray="5 3" strokeWidth="1.5" opacity="0.85" />
                <rect x={PLOT_W - 44} y={slY - 9} width="44" height="17" rx="2" fill="var(--bear)" opacity="0.2" />
                <text x={PLOT_W - 22} y={slY + 4} fontSize="10" fill="var(--bear)"
                  fontFamily="monospace" textAnchor="middle">SL {fmt(pos.stopLoss)}</text>

                {/* TP dashed line */}
                <line x1="0" x2={PLOT_W} y1={tpY} y2={tpY}
                  stroke="var(--profit)" strokeDasharray="5 3" strokeWidth="1.5" opacity="0.85" />
                <rect x={PLOT_W - 44} y={tpY - 9} width="44" height="17" rx="2" fill="var(--profit)" opacity="0.2" />
                <text x={PLOT_W - 22} y={tpY + 4} fontSize="10" fill="var(--profit)"
                  fontFamily="monospace" textAnchor="middle">TP {fmt(pos.takeProfit)}</text>

                {/* Entry arrow + label */}
                <polygon
                  points={isBuy
                    ? `${PLOT_W * 0.02},${entryY} ${PLOT_W * 0.02 - 6},${entryY + 10} ${PLOT_W * 0.02 + 6},${entryY + 10}`
                    : `${PLOT_W * 0.02},${entryY} ${PLOT_W * 0.02 - 6},${entryY - 10} ${PLOT_W * 0.02 + 6},${entryY - 10}`}
                  fill={isBuy ? "var(--profit)" : "var(--bear)"}
                />
                <line x1={PLOT_W * 0.02 + 8} x2={PLOT_W - 60} y1={entryY} y2={entryY}
                  stroke={isBuy ? "var(--profit)" : "var(--bear)"} strokeWidth="1.5" opacity="0.6" />
                <rect x={PLOT_W - 95} y={entryY - 9} width="95" height="18" rx="3"
                  fill={isBuy ? "var(--profit)" : "var(--bear)"} opacity="0.18" />
                <text x={PLOT_W - 48} y={entryY + 4} fontSize="10"
                  fill={isBuy ? "var(--profit)" : "var(--bear)"}
                  fontFamily="monospace" textAnchor="middle">
                  {pos.side} {fmt(pos.entry)} {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                </text>
              </g>
            );
          })}


          {/* ── Horizontal drawn lines ────────────────────────────────── */}
          {hlines.map((hl) => (
            <g key={hl.id} style={{ cursor: "ns-resize" }}
              onPointerDown={(e) => { e.stopPropagation(); setDraggingHline(hl.id); }}>
              <line x1="0" x2={PLOT_W} y1={y(hl.price)} y2={y(hl.price)}
                stroke={hl.color} strokeWidth="1.5" strokeDasharray="8 4" opacity="0.9" />
              <rect x={PLOT_W} y={y(hl.price) - 9} width={Y_AXIS_W} height="18" rx="3"
                fill={hl.color} opacity="0.25" />
              <text x={PLOT_W + 6} y={y(hl.price) + 4} fontSize="10"
                fill={hl.color} fontFamily="monospace">{fmt(hl.price)}</text>
              {/* Delete button */}
              <text x={PLOT_W - 14} y={y(hl.price) + 4} fontSize="12"
                fill="var(--muted-foreground)"
                style={{ cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); setHlines((prev) => prev.filter((h) => h.id !== hl.id)); }}>
                ×
              </text>
            </g>
          ))}

          {/* ── Measure tool overlay ─────────────────────────────────── */}
          {measureAnnotation && (
            <g>
              <rect
                x={Math.min(measureAnnotation.x1, measureAnnotation.x2)}
                y={Math.min(measureAnnotation.y1, measureAnnotation.y2)}
                width={Math.abs(measureAnnotation.x2 - measureAnnotation.x1)}
                height={Math.abs(measureAnnotation.y2 - measureAnnotation.y1)}
                fill={measureAnnotation.bull ? "var(--profit)" : "var(--bear)"}
                opacity="0.1" stroke={measureAnnotation.bull ? "var(--profit)" : "var(--bear)"}
                strokeWidth="1" strokeDasharray="4 3"
              />
              <text
                x={(measureAnnotation.x1 + measureAnnotation.x2) / 2}
                y={(measureAnnotation.y1 + measureAnnotation.y2) / 2}
                fontSize="12" fill={measureAnnotation.bull ? "var(--profit)" : "var(--bear)"}
                fontFamily="monospace" textAnchor="middle" fontWeight="bold"
              >
                {measureAnnotation.pips.toFixed(1)} pips · {measureAnnotation.candles}c
              </text>
            </g>
          )}

          {/* ── Crosshair ────────────────────────────────────────────── */}
          {crosshair && crosshair.x <= PLOT_W && (
            <>
              {/* Vertical line */}
              <line x1={crosshair.x} x2={crosshair.x} y1="0" y2={PLOT_H}
                stroke="var(--muted-foreground)" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
              {/* Horizontal line */}
              <line x1="0" x2={PLOT_W} y1={crosshair.y} y2={crosshair.y}
                stroke="var(--muted-foreground)" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
              {/* Price label on Y axis */}
              {crosshairPrice !== null && (
                <>
                  <rect x={PLOT_W} y={crosshair.y - 9} width={Y_AXIS_W} height="18" rx="3"
                    fill="var(--muted-foreground)" opacity="0.8" />
                  <text x={PLOT_W + Y_AXIS_W / 2} y={crosshair.y + 4} fontSize="11"
                    fill="var(--background)" fontFamily="monospace" textAnchor="middle">
                    {fmt(crosshairPrice)}
                  </text>
                </>
              )}
              {/* Time label on X axis */}
              {crosshairTime && (
                <>
                  <rect x={crosshair.x - 28} y={PLOT_H + 2} width="56" height="16" rx="3"
                    fill="var(--muted-foreground)" opacity="0.8" />
                  <text x={crosshair.x} y={PLOT_H + 14} fontSize="10"
                    fill="var(--background)" fontFamily="monospace" textAnchor="middle">
                    {crosshairTime}
                  </text>
                </>
              )}
            </>
          )}


          {/* ── RSI sub-panel ────────────────────────────────────────── */}
          {showRsi && (
            <g transform={`translate(0, ${CHART_H})`}>
              <rect x="0" y="0" width={PLOT_W} height={RSI_H} fill="var(--background)" opacity="0.6" />
              <line x1="0" x2={PLOT_W} y1="0" y2="0" stroke="var(--border)" strokeWidth="1.5" />
              {/* OB/OS bands */}
              <rect x="0" y={ry(70)} width={PLOT_W} height={ry(30) - ry(70)}
                fill="var(--signal)" opacity="0.04" />
              <line x1="0" x2={PLOT_W} y1={ry(70)} y2={ry(70)}
                stroke="var(--bear)" strokeDasharray="4 4" strokeWidth="1" />
              <line x1="0" x2={PLOT_W} y1={ry(30)} y2={ry(30)}
                stroke="var(--profit)" strokeDasharray="4 4" strokeWidth="1" />
              <text x="6" y={ry(70) - 3} fontSize="9" fill="var(--bear)" fontFamily="monospace">70</text>
              <text x="6" y={ry(30) + 11} fontSize="9" fill="var(--profit)" fontFamily="monospace">30</text>
              {/* RSI line */}
              <polyline points={rsiLine} fill="none" stroke="var(--signal)" strokeWidth="1.8" />
              {/* Current RSI label */}
              {rsiSeries.at(-1) !== null && rsiSeries.at(-1) !== undefined && (
                <text x={PLOT_W - 4} y={ry(rsiSeries.at(-1) as number) + 4}
                  fontSize="10" fill="var(--signal)" fontFamily="monospace" textAnchor="end">
                  {(rsiSeries.at(-1) as number).toFixed(1)}
                </text>
              )}
              {/* RSI label */}
              <text x="6" y={RSI_H - 4} fontSize="10" fill="var(--muted-foreground)" fontFamily="monospace">RSI(14)</text>
              {/* Y-axis for RSI */}
              <rect x={PLOT_W} y="0" width={Y_AXIS_W} height={RSI_H} fill="var(--card)" opacity="0.92" />
              {[20, 50, 80].map((v) => (
                <text key={v} x={PLOT_W + 9} y={ry(v) + 4} fontSize="10"
                  fill="var(--muted-foreground)" fontFamily="monospace">{v}</text>
              ))}
            </g>
          )}

          {/* Tool hint overlay */}
          {activeTool !== "none" && (
            <g>
              <rect x="4" y={PLOT_H - 20} width="200" height="16" rx="3" fill="var(--card)" opacity="0.8" />
              <text x="10" y={PLOT_H - 8} fontSize="11" fill="var(--signal)" fontFamily="monospace">
                {activeTool === "hline" ? "Click to place horizontal line" : "Click & drag to measure"}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 border-t border-border/40 px-4 py-2 text-[11px] text-muted-foreground">
        <LegendDot color="bg-signal" label="EMA 50" />
        <LegendDot color="bg-[var(--gold)]" label="EMA 200 / Fib 61.8%" />
        {visiblePositions.length > 0 && (
          <span className="text-signal">{visiblePositions.length} open position{visiblePositions.length > 1 ? "s" : ""} plotted</span>
        )}
        <span className="ml-auto font-mono">
          Range {fmt(rawMin)} – {fmt(rawMax)}
          {offsetFromEnd > 0 && <span className="ml-2 text-[var(--gold)]">← {offsetFromEnd}c back</span>}
        </span>
      </div>
    </section>
  );
}


/* ── Sub-components ─────────────────────────────────────────────────────── */
function ToolBtn({
  icon, label, active, onClick,
}: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
        active ? "bg-signal/20 text-signal" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
