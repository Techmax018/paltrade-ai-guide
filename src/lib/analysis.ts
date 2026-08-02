import type { Candle } from "./derivApi";
import { ema, rsi, fibRetracement } from "./derivApi";

export type Bias = "BULLISH" | "BEARISH" | "NEUTRAL";

/** Direction of a market-structure shift. */
export type StructureShift = "BOS_BULL" | "BOS_BEAR" | "CHOCH_BULL" | "CHOCH_BEAR" | null;

export interface Gap {
  from: number;
  to: number;
  kind: "bullish" | "bearish";
  index: number;
}

/**
 * A swing point used for BOS / CHoCH detection.
 * `kind` = "high" means it is a local swing high; "low" is a local swing low.
 */
export interface SwingPoint {
  index: number;
  price: number;
  kind: "high" | "low";
}

export interface Analysis {
  bias: Bias;
  confidence: number;
  rsi: number | null;
  ema50: number | null;
  ema200: number | null;
  support: number;
  resistance: number;
  gaps: Gap[];
  fib: ReturnType<typeof fibRetracement>;
  strategy: string;
  rationale: string[];
  suggestedEntry: number;
  suggestedStop: number;
  targets: [number, number, number];
  /** Most recent market-structure event (BOS / CHoCH), or null. */
  structureShift: StructureShift;
  /** Last N swing highs/lows used for structure detection. */
  swingPoints: SwingPoint[];
  /** Composite autonomous score (-10 … +10). */
  autonomousScore: number;
  /** Whether ALL confluence rules are aligned for a high-probability signal. */
  confluenceAligned: boolean;
}

/* ── Swing-point detector ─────────────────────────────────────────────────── */
/**
 * Detects local swing highs and lows over the last `lookback` candles.
 * A swing high requires `strength` consecutive lower highs on each side.
 * A swing low requires `strength` consecutive higher lows on each side.
 */
export function detectSwingPoints(candles: Candle[], lookback = 80, strength = 3): SwingPoint[] {
  const slice = candles.slice(-lookback);
  const points: SwingPoint[] = [];
  for (let i = strength; i < slice.length - strength; i++) {
    const c = slice[i];
    // Swing high
    const isSwingHigh = Array.from({ length: strength }, (_, k) => k + 1).every(
      (k) => slice[i - k].high < c.high && slice[i + k].high < c.high,
    );
    // Swing low
    const isSwingLow = Array.from({ length: strength }, (_, k) => k + 1).every(
      (k) => slice[i - k].low > c.low && slice[i + k].low > c.low,
    );
    if (isSwingHigh) points.push({ index: candles.length - lookback + i, price: c.high, kind: "high" });
    if (isSwingLow) points.push({ index: candles.length - lookback + i, price: c.low, kind: "low" });
  }
  return points;
}

/* ── BOS / CHoCH detector ────────────────────────────────────────────────── */
/**
 * Break of Structure (BOS) — price closes beyond the most recent same-type
 * swing point, continuing the existing trend.
 *
 * Change of Character (CHoCH) — price closes beyond the most recent
 * opposite-type swing point, signalling a potential trend reversal.
 *
 * Returns the most recent structural event detected in the last `lookback`
 * candles, or null if none.
 */
export function detectStructureShift(candles: Candle[], swingPoints: SwingPoint[], lookback = 30): StructureShift {
  if (swingPoints.length < 2 || candles.length < 2) return null;

  const recent = candles.slice(-lookback);
  const lastClose = recent[recent.length - 1].close;
  const prevClose = recent[recent.length - 2].close;

  // Sort swing points by index descending (most recent first)
  const sorted = [...swingPoints].sort((a, b) => b.index - a.index);

  const lastHigh = sorted.find((p) => p.kind === "high");
  const lastLow = sorted.find((p) => p.kind === "low");
  const prevHigh = sorted.filter((p) => p.kind === "high")[1];
  const prevLow = sorted.filter((p) => p.kind === "low")[1];

  // Determine prior trend direction
  const priorUpTrend = lastHigh && prevLow ? lastHigh.index > prevLow.index : null;

  // BOS Bullish: price breaks above last swing high, continuing uptrend
  if (priorUpTrend === true && lastHigh && prevClose < lastHigh.price && lastClose > lastHigh.price) {
    return "BOS_BULL";
  }
  // BOS Bearish: price breaks below last swing low, continuing downtrend
  if (priorUpTrend === false && lastLow && prevClose > lastLow.price && lastClose < lastLow.price) {
    return "BOS_BEAR";
  }
  // CHoCH Bullish: was in downtrend, now breaks above a prior swing high (reversal)
  if (priorUpTrend === false && prevHigh && prevClose < prevHigh.price && lastClose > prevHigh.price) {
    return "CHOCH_BULL";
  }
  // CHoCH Bearish: was in uptrend, now breaks below a prior swing low (reversal)
  if (priorUpTrend === true && prevLow && prevClose > prevLow.price && lastClose < prevLow.price) {
    return "CHOCH_BEAR";
  }

  return null;
}

/* ── RSI divergence helper ───────────────────────────────────────────────── */
/**
 * Detects simple price / RSI divergence over the last `window` candles.
 * Returns "bullish" if price makes a lower low but RSI makes a higher low.
 * Returns "bearish" if price makes a higher high but RSI makes a lower high.
 */
export function detectRsiDivergence(
  candles: Candle[],
  rsiValues: (number | null)[],
  window = 20,
): "bullish" | "bearish" | null {
  const priceSlice = candles.slice(-window);
  const rsiSlice = rsiValues.slice(-window).filter((v): v is number => v !== null);
  if (priceSlice.length < window || rsiSlice.length < window) return null;

  const priceFirstHalf = priceSlice.slice(0, Math.floor(window / 2));
  const priceSecondHalf = priceSlice.slice(Math.floor(window / 2));
  const rsiFirstHalf = rsiSlice.slice(0, Math.floor(window / 2));
  const rsiSecondHalf = rsiSlice.slice(Math.floor(window / 2));

  const priceLow1 = Math.min(...priceFirstHalf.map((c) => c.low));
  const priceLow2 = Math.min(...priceSecondHalf.map((c) => c.low));
  const rsiLow1 = Math.min(...rsiFirstHalf);
  const rsiLow2 = Math.min(...rsiSecondHalf);

  const priceHigh1 = Math.max(...priceFirstHalf.map((c) => c.high));
  const priceHigh2 = Math.max(...priceSecondHalf.map((c) => c.high));
  const rsiHigh1 = Math.max(...rsiFirstHalf);
  const rsiHigh2 = Math.max(...rsiSecondHalf);

  if (priceLow2 < priceLow1 && rsiLow2 > rsiLow1) return "bullish";
  if (priceHigh2 > priceHigh1 && rsiHigh2 < rsiHigh1) return "bearish";

  return null;
}

/* ── Fair value gap detector ──────────────────────────────────────────────── */
/** Detect 3-candle fair value gaps (imbalances). */
export function findFairValueGaps(candles: Candle[], max = 3): Gap[] {
  const out: Gap[] = [];
  for (let i = candles.length - 2; i >= 2 && out.length < max; i--) {
    const a = candles[i - 2];
    const c = candles[i];
    if (a.high < c.low) out.push({ from: a.high, to: c.low, kind: "bullish", index: i });
    else if (a.low > c.high) out.push({ from: c.high, to: a.low, kind: "bearish", index: i });
  }
  return out;
}

/* ── Core market analysis ─────────────────────────────────────────────────── */
export function analyzeMarket(candles: Candle[], price: number): Analysis {
  const closes = candles.map((c) => c.close);
  const e50 = ema(closes, 50).at(-1) ?? null;
  const e200 = ema(closes, 200).at(-1) ?? null;
  const rsiSeries = rsi(closes, 14);
  const r = rsiSeries.at(-1) ?? null;
  const fib = fibRetracement(candles, 60);
  const recent = candles.slice(-60);
  const support = Math.min(...recent.map((c) => c.low));
  const resistance = Math.max(...recent.map((c) => c.high));
  const gaps = findFairValueGaps(candles);

  // Swing structure
  const swingPoints = detectSwingPoints(candles, 80, 3);
  const structureShift = detectStructureShift(candles, swingPoints, 30);
  const rsiDivergence = detectRsiDivergence(candles, rsiSeries, 20);

  let score = 0;
  const rationale: string[] = [];

  /* ── 1. EMA trend structure (±2) ───────────────────────────────────────── */
  if (e50 !== null && e200 !== null) {
    if (e50 > e200) {
      score += 2;
      rationale.push("50 EMA is above the 200 EMA — trend structure favours longs.");
    } else {
      score -= 2;
      rationale.push("50 EMA is below the 200 EMA — trend structure favours shorts.");
    }
  }

  /* ── 2. Price vs 50 EMA (±1) ───────────────────────────────────────────── */
  if (e50 !== null) {
    if (price > e50) {
      score += 1;
      rationale.push("Price is trading above the 50 EMA (momentum intact).");
    } else {
      score -= 1;
      rationale.push("Price is trading below the 50 EMA (momentum fading).");
    }
  }

  /* ── 3. RSI momentum (±2) ──────────────────────────────────────────────── */
  if (r !== null) {
    if (r < 30) {
      score += 2;
      rationale.push(`RSI(14) at ${r.toFixed(1)} — oversold, mean-reversion pressure upward.`);
    } else if (r > 70) {
      score -= 2;
      rationale.push(`RSI(14) at ${r.toFixed(1)} — overbought, exhaustion risk.`);
    } else {
      rationale.push(`RSI(14) at ${r.toFixed(1)} — neutral momentum band.`);
    }
  }

  /* ── 4. RSI divergence (±1) ────────────────────────────────────────────── */
  if (rsiDivergence === "bullish") {
    score += 1;
    rationale.push("Bullish RSI divergence detected — price weakness not confirmed by momentum.");
  } else if (rsiDivergence === "bearish") {
    score -= 1;
    rationale.push("Bearish RSI divergence detected — price strength fading vs momentum.");
  }

  /* ── 5. Fibonacci golden zone (±2) ─────────────────────────────────────── */
  const golden = fib?.levels.find((l) => l.level === 0.618);
  const range = resistance - support || price * 0.001;
  if (golden && Math.abs(price - golden.price) < range * 0.06) {
    score += fib!.upTrend ? 2 : -2;
    rationale.push("Price is reacting inside the 61.8% golden zone — high-probability confluence.");
  }

  /* ── 6. Fibonacci 50% zone (±1) ────────────────────────────────────────── */
  const fiftyPct = fib?.levels.find((l) => l.level === 0.5);
  if (fiftyPct && Math.abs(price - fiftyPct.price) < range * 0.04) {
    score += fib!.upTrend ? 1 : -1;
    rationale.push("Price is testing the 50% Fibonacci equilibrium level.");
  }

  /* ── 7. Fair value gaps (±1) ───────────────────────────────────────────── */
  if (gaps.length) {
    rationale.push(`${gaps.length} unfilled fair value gap${gaps.length > 1 ? "s" : ""} detected — expect magnet behaviour.`);
    score += gaps[0].kind === "bullish" ? 1 : -1;
  }

  /* ── 8. BOS / CHoCH structure (±2) ─────────────────────────────────────── */
  if (structureShift === "BOS_BULL") {
    score += 2;
    rationale.push("Break of Structure (BOS) to the upside — bullish continuation confirmed.");
  } else if (structureShift === "BOS_BEAR") {
    score -= 2;
    rationale.push("Break of Structure (BOS) to the downside — bearish continuation confirmed.");
  } else if (structureShift === "CHOCH_BULL") {
    score += 2;
    rationale.push("Change of Character (CHoCH) bullish — potential trend reversal to upside.");
  } else if (structureShift === "CHOCH_BEAR") {
    score -= 2;
    rationale.push("Change of Character (CHoCH) bearish — potential trend reversal to downside.");
  }

  /* ── Bias & confidence ──────────────────────────────────────────────────── */
  const bias: Bias = score >= 2 ? "BULLISH" : score <= -2 ? "BEARISH" : "NEUTRAL";
  const long = bias !== "BEARISH";

  /*
   * Confluence check: ALL of the following must align for a high-probability
   * autonomous entry signal:
   *   • EMA alignment (50 > 200 for bull, 50 < 200 for bear)
   *   • Price on correct side of 50 EMA
   *   • RSI not opposing bias (not overbought for bull, not oversold for bear)
   *   • At least one structural event OR golden-zone touch
   *   • abs(score) ≥ 4
   */
  const emaAligned = e50 !== null && e200 !== null && (long ? e50 > e200 : e50 < e200);
  const priceEmaOk = e50 !== null && (long ? price > e50 : price < e50);
  const rsiOk = r !== null && (long ? r < 70 : r > 30);
  const hasStructure = structureShift !== null;
  const hasGolden = !!(golden && Math.abs(price - golden.price) < range * 0.08);
  const confluenceAligned =
    bias !== "NEUTRAL" && emaAligned && priceEmaOk && rsiOk && (hasStructure || hasGolden) && Math.abs(score) >= 4;

  /* ── Strategy label ─────────────────────────────────────────────────────── */
  const strategy =
    structureShift?.startsWith("CHOCH")
      ? `CHoCH ${long ? "Bullish" : "Bearish"} Reversal — High Probability`
      : structureShift?.startsWith("BOS")
        ? `BOS ${long ? "Bullish" : "Bearish"} Continuation`
        : golden && Math.abs(price - golden.price) < range * 0.08
          ? `61.8% Golden Zone Retracement ${long ? "Buy" : "Sell"}`
          : r !== null && r < 30
            ? "Oversold RSI Reversal Buy"
            : r !== null && r > 70
              ? "Overbought RSI Reversal Sell"
              : e50 !== null && e200 !== null && e50 > e200
                ? "EMA Trend Continuation Buy on Pullback"
                : e50 !== null && e200 !== null && e50 < e200
                  ? "EMA Trend Continuation Sell on Rally"
                  : "Range Fade — wait for level rejection";

  /* ── Entry, SL, TP ──────────────────────────────────────────────────────── */
  const stopDistance = Math.max(range * 0.25, price * 0.0012);
  const suggestedStop = long ? price - stopDistance : price + stopDistance;
  const targets: [number, number, number] = long
    ? [price + stopDistance, price + stopDistance * 2, price + stopDistance * 3]
    : [price - stopDistance, price - stopDistance * 2, price - stopDistance * 3];

  // Clamp autonomous score to [-10, 10]
  const autonomousScore = Math.max(-10, Math.min(10, score));

  return {
    bias,
    confidence: Math.min(95, 45 + Math.abs(score) * 7),
    rsi: r,
    ema50: e50,
    ema200: e200,
    support,
    resistance,
    gaps,
    fib,
    strategy,
    rationale,
    suggestedEntry: price,
    suggestedStop,
    targets,
    structureShift,
    swingPoints,
    autonomousScore,
    confluenceAligned,
  };
}
