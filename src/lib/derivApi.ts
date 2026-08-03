/**
 * derivApi.ts — Deriv WebSocket API adapter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DROP-IN POINT FOR LIVE CREDENTIALS
 * Replace `DERIV_APP_ID` (or pass appId at connect time) and flip
 * `USE_MOCK` to false once you're ready to hit the live endpoint.
 * Live endpoint: wss://ws.derivws.com/websockets/v3?app_id=<APP_ID>
 *
 * Execution flow (live):
 *   1. authorize  → exchange token for session
 *   2. proposal   → request contract quote
 *   3. buy        → execute with proposal id + price
 *   4. proposal_open_contract → stream real-time P&L
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const DERIV_WS_ENDPOINT = "wss://ws.derivws.com/websockets/v3";

/**
 * Deriv App ID — read from VITE_DERIV_APP_ID environment variable.
 * Set in Vercel project settings (already configured).
 * Falls back to 1089 (Deriv public demo) for local dev without a .env file.
 */
export const DERIV_APP_ID: string =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_DERIV_APP_ID) ||
  "1089";

/** false = use the real Deriv WebSocket (live prices + account on login) */
export const USE_MOCK = false;

export type ConnectionStatus = "disconnected" | "connecting" | "reconnecting" | "connected" | "error";
export type AccountType = "demo" | "real";
export type Timeframe = "M1" | "M5" | "M15" | "H1";
export type Side = "BUY" | "SELL";
export type ContractType = "CALL" | "PUT"; // Deriv Rise/Fall

export interface DerivSymbol {
  code: string;
  label: string;
  kind: "forex" | "synthetic" | "metal";
  pipSize: number;
  pipValuePerLot: number; // USD per pip per 1.00 lot
  basePrice: number;
  volatility: number;
}

export const SYMBOLS: DerivSymbol[] = [
  { code: "frxXAUUSD", label: "Gold XAU/USD", kind: "metal", pipSize: 0.1, pipValuePerLot: 10, basePrice: 2338.4, volatility: 1.6 },
  { code: "frxEURUSD", label: "EUR/USD", kind: "forex", pipSize: 0.0001, pipValuePerLot: 10, basePrice: 1.0842, volatility: 0.9 },
  { code: "frxGBPUSD", label: "GBP/USD", kind: "forex", pipSize: 0.0001, pipValuePerLot: 10, basePrice: 1.2715, volatility: 1.1 },
  { code: "frxUSDJPY", label: "USD/JPY", kind: "forex", pipSize: 0.01, pipValuePerLot: 9.1, basePrice: 156.32, volatility: 1.0 },
  { code: "R_100", label: "Volatility 100 Index", kind: "synthetic", pipSize: 0.01, pipValuePerLot: 10, basePrice: 1420.55, volatility: 3.4 },
  { code: "R_75", label: "Volatility 75 Index", kind: "synthetic", pipSize: 0.01, pipValuePerLot: 10, basePrice: 98450.2, volatility: 2.8 },
  { code: "BOOM1000", label: "Boom 1000 Index", kind: "synthetic", pipSize: 0.01, pipValuePerLot: 10, basePrice: 9120.7, volatility: 2.2 },
];

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = { M1: 60, M5: 300, M15: 900, H1: 3600 };

export interface Candle {
  time: number; // epoch seconds (candle open)
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Tick {
  symbol: string;
  time: number;
  quote: number;
}

export interface AccountInfo {
  loginid: string;
  accountType: AccountType;
  currency: string;
  balance: number;
  equity: number;
  leverage: number;
}

export interface TradeRequest {
  symbol: string;
  side: Side;
  lots: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  label?: string;
}

export interface TradeResult {
  id: string;
  ok: boolean;
  message: string;
  request: TradeRequest;
  openedAt: number;
  /** Execution latency in ms (proposal → buy round-trip) */
  latencyMs?: number;
  /** Deriv contract ID if live */
  contractId?: string;
}

/**
 * ProposalRequest — maps to the Deriv `proposal` WebSocket message.
 * https://api.deriv.com/api-explorer/#proposal
 */
export interface ProposalRequest {
  symbol: string;
  contractType: ContractType;
  stake: number; // USD amount
  duration: number; // e.g. 5
  durationUnit: "t" | "s" | "m" | "h" | "d";
  currency?: string;
  basis?: "stake" | "payout";
}

export interface ProposalResponse {
  id: string; // proposal id
  askPrice: number;
  displayValue: string;
  payout: number;
  longcode: string;
}

/**
 * OpenContractUpdate — streamed by `proposal_open_contract`.
 */
export interface OpenContractUpdate {
  contractId: string;
  currentSpot: number;
  entrySpot: number;
  profit: number;
  status: "open" | "won" | "lost" | "sold";
}

export interface ConnectOptions {
  appId: string;
  token: string;
  accountType: AccountType;
}

export interface DerivConnection {
  onStatus(cb: (s: ConnectionStatus) => void): () => void;
  onAccount(cb: (a: AccountInfo) => void): () => void;
  subscribeTicks(symbol: string, cb: (t: Tick) => void, startPrice?: number): () => void;
  getCandles(symbol: string, timeframe: Timeframe, count: number): Promise<Candle[]>;
  /**
   * 2-step execution: proposal → buy.
   * Returns timing metadata alongside the fill result.
   */
  placeTrade(req: TradeRequest): Promise<TradeResult>;
  /**
   * Request a contract quote without executing.
   * Useful for pre-flight validation and price display.
   */
  requestProposal(req: ProposalRequest): Promise<ProposalResponse>;
  /**
   * Subscribe to live P&L updates for an open contract.
   * Returns an unsubscribe function.
   */
  subscribeOpenContract(contractId: string, cb: (u: OpenContractUpdate) => void): () => void;
  closeTrade(id: string): Promise<{ ok: boolean }>;
  disconnect(): void;
}

/* ── deterministic pseudo-random helpers (stable candle history) ───────────── */
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCandles(symbol: string, timeframe: Timeframe, count: number): Candle[] {
  const meta = SYMBOLS.find((s) => s.code === symbol) ?? SYMBOLS[0];
  const step = TIMEFRAME_SECONDS[timeframe];
  const rand = mulberry(hashSeed(symbol + timeframe));
  const now = Math.floor(Date.now() / 1000);
  const start = now - (now % step) - step * (count - 1);
  const scale = meta.basePrice * 0.0006 * meta.volatility;
  let price = meta.basePrice;
  const out: Candle[] = [];
  let drift = 0;
  for (let i = 0; i < count; i++) {
    drift = drift * 0.94 + (rand() - 0.5) * scale * 0.9;
    const open = price;
    const close = open + drift + (rand() - 0.5) * scale;
    const high = Math.max(open, close) + rand() * scale * 0.8;
    const low = Math.min(open, close) - rand() * scale * 0.8;
    out.push({ time: start + i * step, open, high, low, close });
    price = close;
  }
  return out;
}

/* ── mock connection ───────────────────────────────────────────────────────── */
class MockDerivConnection implements DerivConnection {
  private statusCbs = new Set<(s: ConnectionStatus) => void>();
  private accountCbs = new Set<(a: AccountInfo) => void>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private contractCbs = new Map<string, Set<(u: OpenContractUpdate) => void>>();
  private status: ConnectionStatus = "connecting";
  private account: AccountInfo;
  private prices = new Map<string, number>();

  constructor(opts: ConnectOptions) {
    this.account = {
      loginid: (opts.accountType === "demo" ? "VRTC" : "CR") + String(1000000 + (hashSeed(opts.token || "demo") % 899999)),
      accountType: opts.accountType,
      currency: "USD",
      balance: opts.accountType === "demo" ? 10000 : 2485.63,
      equity: opts.accountType === "demo" ? 10000 : 2485.63,
      leverage: opts.accountType === "demo" ? 500 : 200,
    };
    setTimeout(() => this.setStatus("connected"), 700);
    setTimeout(() => this.emitAccount(), 800);
    // periodic equity heartbeat
    this.timers.push(
      setInterval(() => {
        this.account = { ...this.account, equity: this.account.equity + (Math.random() - 0.48) * 2 };
        this.emitAccount();
      }, 4000),
    );
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.statusCbs.forEach((cb) => cb(s));
  }
  private emitAccount() {
    this.accountCbs.forEach((cb) => cb(this.account));
  }

  onStatus(cb: (s: ConnectionStatus) => void) {
    this.statusCbs.add(cb);
    cb(this.status);
    return () => this.statusCbs.delete(cb) as unknown as void;
  }
  onAccount(cb: (a: AccountInfo) => void) {
    this.accountCbs.add(cb);
    cb(this.account);
    return () => this.accountCbs.delete(cb) as unknown as void;
  }

  subscribeTicks(symbol: string, cb: (t: Tick) => void, startPrice?: number) {
    const meta = SYMBOLS.find((s) => s.code === symbol) ?? SYMBOLS[0];
    if (startPrice !== undefined) this.prices.set(symbol, startPrice);
    if (!this.prices.has(symbol)) {
      const hist = generateCandles(symbol, "M1", 120);
      this.prices.set(symbol, hist[hist.length - 1].close);
    }
    const id = setInterval(() => {
      const last = this.prices.get(symbol)!;
      const next = last + (Math.random() - 0.5) * meta.basePrice * 0.0004 * meta.volatility;
      this.prices.set(symbol, next);
      cb({ symbol, time: Math.floor(Date.now() / 1000), quote: next });
      // stream open contract updates
      this.contractCbs.forEach((cbs, contractId) => {
        cbs.forEach((update) =>
          update({
            contractId,
            currentSpot: next,
            entrySpot: next + (Math.random() - 0.5) * meta.pipSize * 5,
            profit: (Math.random() - 0.45) * 10,
            status: "open",
          }),
        );
      });
    }, 1000);
    this.timers.push(id);
    return () => clearInterval(id);
  }

  async getCandles(symbol: string, timeframe: Timeframe, count: number) {
    await new Promise((r) => setTimeout(r, 120));
    return generateCandles(symbol, timeframe, count);
  }

  async requestProposal(req: ProposalRequest): Promise<ProposalResponse> {
    // Simulate ~180ms round-trip for proposal
    await new Promise((r) => setTimeout(r, 180));
    const payout = req.stake * (1.8 + Math.random() * 0.4);
    return {
      id: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      askPrice: req.stake,
      displayValue: req.stake.toFixed(2),
      payout,
      longcode: `Win payout if ${req.symbol} ${req.contractType === "CALL" ? "rises" : "falls"} after ${req.duration}${req.durationUnit}`,
    };
  }

  async placeTrade(req: TradeRequest): Promise<TradeResult> {
    const t0 = performance.now();
    // Step 1: proposal (simulated ~180ms)
    const contractType: ContractType = req.side === "BUY" ? "CALL" : "PUT";
    const _proposal = await this.requestProposal({
      symbol: req.symbol,
      contractType,
      stake: req.lots * 100,
      duration: 5,
      durationUnit: "m",
    });
    // Step 2: buy (simulated ~120ms)
    await new Promise((r) => setTimeout(r, 120));
    const contractId = `contract-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const latencyMs = Math.round(performance.now() - t0);
    return {
      id: contractId,
      ok: true,
      message: `${req.side} ${req.lots.toFixed(2)} ${req.symbol} filled at ${req.entry}`,
      request: req,
      openedAt: Date.now(),
      latencyMs,
      contractId,
    };
  }

  subscribeOpenContract(contractId: string, cb: (u: OpenContractUpdate) => void) {
    if (!this.contractCbs.has(contractId)) {
      this.contractCbs.set(contractId, new Set());
    }
    this.contractCbs.get(contractId)!.add(cb);
    return () => {
      const set = this.contractCbs.get(contractId);
      if (set) {
        set.delete(cb);
        if (!set.size) this.contractCbs.delete(contractId);
      }
    };
  }

  async closeTrade() {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  disconnect() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.contractCbs.clear();
    this.setStatus("disconnected");
  }
}

/* ── live WebSocket connection ─────────────────────────────────────────────── */
class LiveDerivConnection implements DerivConnection {
  private ws: WebSocket;
  private statusCbs = new Set<(s: ConnectionStatus) => void>();
  private accountCbs = new Set<(a: AccountInfo) => void>();
  private pendingRequests = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  private tickCbs = new Map<string, Set<(t: Tick) => void>>();
  private contractCbs = new Map<string, Set<(u: OpenContractUpdate) => void>>();
  private reqId = 1;
  private account: AccountInfo | null = null;
  private opts: ConnectOptions;

  constructor(opts: ConnectOptions) {
    this.opts = opts;
    this.setStatus("connecting");
    this.ws = new WebSocket(`${DERIV_WS_ENDPOINT}?app_id=${opts.appId}`);
    this.ws.onopen = () => {
      this.setStatus("connecting");
      // Only authorize if a token was provided; otherwise just mark connected
      if (opts.token) {
        this.send({ authorize: opts.token });
      } else {
        // Public market data mode — no account, but prices and candles work
        this.setStatus("connected");
      }
    };
    this.ws.onmessage = (e) => this.handleMessage(JSON.parse(e.data));
    this.ws.onerror = () => this.setStatus("error");
    this.ws.onclose = () => this.setStatus("disconnected");
  }

  private nextId() {
    return this.reqId++;
  }

  private send(payload: Record<string, unknown>) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private sendReq(payload: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId();
      this.pendingRequests.set(id, { resolve, reject });
      this.send({ ...payload, req_id: id });
      // timeout after 15s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Deriv API request timed out"));
        }
      }, 15000);
    });
  }

  private setStatus(s: ConnectionStatus) {
    this.statusCbs.forEach((cb) => cb(s));
  }

  private handleMessage(msg: Record<string, unknown>) {
    const reqId = msg.req_id as number | undefined;
    if (reqId !== undefined && this.pendingRequests.has(reqId)) {
      const { resolve, reject } = this.pendingRequests.get(reqId)!;
      this.pendingRequests.delete(reqId);
      if (msg.error) reject(new Error((msg.error as { message: string }).message));
      else resolve(msg);
      return;
    }
    const msgType = msg.msg_type as string;
    if (msgType === "authorize") {
      const auth = msg.authorize as Record<string, unknown>;
      this.setStatus("connected");
      this.account = {
        loginid: auth.loginid as string,
        accountType: this.opts.accountType,
        currency: (auth.currency as string) ?? "USD",
        balance: auth.balance as number,
        equity: auth.balance as number,
        leverage: 100,
      };
      this.accountCbs.forEach((cb) => cb(this.account!));
    }
    if (msgType === "tick") {
      const tick = msg.tick as Record<string, unknown>;
      const t: Tick = { symbol: tick.symbol as string, time: tick.epoch as number, quote: tick.quote as number };
      this.tickCbs.get(t.symbol)?.forEach((cb) => cb(t));
    }
    if (msgType === "proposal_open_contract") {
      const poc = msg.proposal_open_contract as Record<string, unknown>;
      const id = String(poc.contract_id);
      const update: OpenContractUpdate = {
        contractId: id,
        currentSpot: poc.current_spot as number,
        entrySpot: poc.entry_spot as number,
        profit: poc.profit as number,
        status: poc.status as OpenContractUpdate["status"],
      };
      this.contractCbs.get(id)?.forEach((cb) => cb(update));
    }
  }

  onStatus(cb: (s: ConnectionStatus) => void) {
    this.statusCbs.add(cb);
    return () => this.statusCbs.delete(cb) as unknown as void;
  }
  onAccount(cb: (a: AccountInfo) => void) {
    this.accountCbs.add(cb);
    if (this.account) cb(this.account);
    return () => this.accountCbs.delete(cb) as unknown as void;
  }

  subscribeTicks(symbol: string, cb: (t: Tick) => void, _startPrice?: number) {
    if (!this.tickCbs.has(symbol)) {
      this.tickCbs.set(symbol, new Set());
      this.send({ ticks: symbol, subscribe: 1 });
    }
    this.tickCbs.get(symbol)!.add(cb);
    return () => {
      const set = this.tickCbs.get(symbol);
      if (set) {
        set.delete(cb);
        if (!set.size) {
          this.tickCbs.delete(symbol);
          this.send({ forget_all: "ticks" });
        }
      }
    };
  }

  async getCandles(symbol: string, timeframe: Timeframe, count: number): Promise<Candle[]> {
    const granularity = TIMEFRAME_SECONDS[timeframe];
    try {
      const res = await this.sendReq({
        ticks_history: symbol,
        adjust_start_time: 1,
        count,
        end: "latest",
        granularity,
        style: "candles",
      });
      const r = res as Record<string, unknown>;
      // Deriv returns candles array for granularity > 0
      if (r.candles && Array.isArray(r.candles)) {
        return (r.candles as Array<{ epoch: number; open: string; high: string; low: string; close: string }>).map((c) => ({
          time: c.epoch,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
        }));
      }
      return [];
    } catch {
      // Fallback to generated candles if this symbol doesn't support history
      return generateCandles(symbol, timeframe, count);
    }
  }

  async requestProposal(req: ProposalRequest): Promise<ProposalResponse> {
    const res = (await this.sendReq({
      proposal: 1,
      amount: req.stake,
      basis: req.basis ?? "stake",
      contract_type: req.contractType,
      currency: req.currency ?? "USD",
      duration: req.duration,
      duration_unit: req.durationUnit,
      symbol: req.symbol,
    })) as { proposal: { id: string; ask_price: number; display_value: string; payout: number; longcode: string } };
    return {
      id: res.proposal.id,
      askPrice: res.proposal.ask_price,
      displayValue: res.proposal.display_value,
      payout: res.proposal.payout,
      longcode: res.proposal.longcode,
    };
  }

  async placeTrade(req: TradeRequest): Promise<TradeResult> {
    const t0 = performance.now();
    const contractType: ContractType = req.side === "BUY" ? "CALL" : "PUT";
    // Step 1: proposal
    const proposal = await this.requestProposal({
      symbol: req.symbol,
      contractType,
      stake: req.lots * 100,
      duration: 5,
      durationUnit: "m",
    });
    // Step 2: buy
    const buyRes = (await this.sendReq({
      buy: proposal.id,
      price: proposal.askPrice,
    })) as { buy: { contract_id: number; buy_price: number; start_time: number; longcode: string } };
    const latencyMs = Math.round(performance.now() - t0);
    const contractId = String(buyRes.buy.contract_id);
    return {
      id: contractId,
      ok: true,
      message: `${req.side} ${req.lots.toFixed(2)} ${req.symbol} filled at ${req.entry} (${latencyMs}ms)`,
      request: req,
      openedAt: buyRes.buy.start_time * 1000,
      latencyMs,
      contractId,
    };
  }

  subscribeOpenContract(contractId: string, cb: (u: OpenContractUpdate) => void) {
    if (!this.contractCbs.has(contractId)) {
      this.contractCbs.set(contractId, new Set());
      this.send({ proposal_open_contract: 1, contract_id: Number(contractId), subscribe: 1 });
    }
    this.contractCbs.get(contractId)!.add(cb);
    return () => {
      const set = this.contractCbs.get(contractId);
      if (set) {
        set.delete(cb);
        if (!set.size) this.contractCbs.delete(contractId);
      }
    };
  }

  async closeTrade(id: string) {
    try {
      await this.sendReq({ sell: Number(id), price: 0 });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  disconnect() {
    this.ws.close();
  }
}

/**
 * connectWebSocket — connects to Deriv WebSocket.
 *
 * Priority:
 *  1. USE_MOCK = true → always use mock (for offline dev)
 *  2. appId from opts or DERIV_APP_ID env var → real LiveDerivConnection
 *     - With token → full account access (balance, trading)
 *     - Without token → market data only (ticks, candles)
 *  3. No appId → mock
 */
export function connectWebSocket(opts: ConnectOptions): DerivConnection {
  if (USE_MOCK) {
    return new MockDerivConnection(opts);
  }
  const appId = opts.appId || DERIV_APP_ID;
  if (appId) {
    return new LiveDerivConnection({ ...opts, appId });
  }
  return new MockDerivConnection(opts);
}

/* ── indicators ────────────────────────────────────────────────────────────── */
export function ema(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  values.forEach((v, i) => {
    if (i < period - 1) {
      out.push(null);
      return;
    }
    if (prev === null) {
      const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
      prev = seed;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out.push(prev);
  });
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [];
  let gain = 0;
  let loss = 0;
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const diff = values[i] - values[i - 1];
    const up = Math.max(diff, 0);
    const dn = Math.max(-diff, 0);
    if (i <= period) {
      gain += up;
      loss += dn;
      if (i < period) {
        out.push(null);
        continue;
      }
      gain /= period;
      loss /= period;
    } else {
      gain = (gain * (period - 1) + up) / period;
      loss = (loss * (period - 1) + dn) / period;
    }
    out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  }
  return out;
}

export const FIB_LEVELS = [0.382, 0.5, 0.618, 0.786] as const;

export function fibRetracement(candles: Candle[], lookback = 60) {
  const slice = candles.slice(-lookback);
  if (!slice.length) return null;
  const high = Math.max(...slice.map((c) => c.high));
  const low = Math.min(...slice.map((c) => c.low));
  const upTrend = slice[slice.length - 1].close >= (high + low) / 2;
  const levels = FIB_LEVELS.map((l) => ({
    level: l,
    price: upTrend ? high - (high - low) * l : low + (high - low) * l,
  }));
  return { high, low, upTrend, levels };
}
