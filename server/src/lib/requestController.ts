/**
 * server/src/lib/requestController.ts
 *
 * Hardened outbound HTTP controller for broker endpoints (Deriv / Vantage /
 * MetaApi) that sit behind Cloudflare.
 *
 * Design goals:
 *  1. Throttling + randomized jitter (3000–5000 ms) and exponential backoff so
 *     retry patterns never resemble a brute-force / DDoS signature.
 *  2. Authentic browser signature on EVERY outbound request.
 *  3. Fail-safe rejection posture: on 403 / Cloudflare body signature we HALT
 *     the loop and surface a "renew IP" instruction instead of retrying.
 *  4. Optional residential proxy rotation via a single config block.
 */
import {
  inspectResponse,
  WafBlockedError,
  type WafVerdict,
} from "./wafInterceptor";

export { WAF_CLIENT_HINT, WafBlockedError, isWafBlockedError } from "./wafInterceptor";
export type { WafVerdict } from "./wafInterceptor";

/* ─────────────────────────────────────────────────────────────────────────
 * 1. Browser signature
 * ────────────────────────────────────────────────────────────────────── */

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
];

/** Complete, authentic desktop-Chrome request signature. */
export function browserHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
  return {
    "User-Agent": ua,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Google Chrome";v="127"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": ua.includes("Macintosh") ? '"macOS"' : '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "Upgrade-Insecure-Requests": "1",
    DNT: "1",
    ...extra,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. Optional residential proxy rotation
 *    Set PROXY_POOL to a comma-separated list of proxy URLs, e.g.
 *      http://user:pass@gw.residential-provider.io:7000
 *    Dirty/flagged IPs are quarantined and the pool cycles automatically.
 * ────────────────────────────────────────────────────────────────────── */

export interface ProxyConfig {
  enabled: boolean;
  pool: string[];
  /** ms an IP stays quarantined after a WAF hit */
  quarantineMs: number;
}

export const proxyConfig: ProxyConfig = {
  enabled: String(process.env.PROXY_ENABLED ?? "false") === "true",
  pool: (process.env.PROXY_POOL ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean),
  quarantineMs: Number(process.env.PROXY_QUARANTINE_MS ?? 10 * 60_000),
};

const quarantined = new Map<string, number>();
let cursor = 0;

function nextProxy(): string | null {
  if (!proxyConfig.enabled || proxyConfig.pool.length === 0) return null;
  const now = Date.now();
  for (let i = 0; i < proxyConfig.pool.length; i++) {
    const candidate = proxyConfig.pool[(cursor + i) % proxyConfig.pool.length]!;
    const until = quarantined.get(candidate) ?? 0;
    if (until < now) {
      cursor = (cursor + i + 1) % proxyConfig.pool.length;
      return candidate;
    }
  }
  return null; // whole pool is dirty
}

export function markProxyDirty(proxyUrl: string | null) {
  if (proxyUrl) quarantined.set(proxyUrl, Date.now() + proxyConfig.quarantineMs);
}

/**
 * Node 20+ exposes an undici ProxyAgent. Loaded lazily so the module stays
 * usable when proxying is disabled or undici is unavailable.
 */
async function proxyDispatcher(proxyUrl: string): Promise<unknown | null> {
  try {
    const undici = (await import("undici")) as unknown as {
      ProxyAgent: new (uri: string) => unknown;
    };
    return new undici.ProxyAgent(proxyUrl);
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. Throttling: jitter + exponential backoff
 * ────────────────────────────────────────────────────────────────────── */

export const JITTER_MIN_MS = 3000;
export const JITTER_MAX_MS = 5000;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Randomized human-ish poll interval — never a static 1s tick. */
export function jitteredDelay(min = JITTER_MIN_MS, max = JITTER_MAX_MS): number {
  return Math.floor(min + Math.random() * (max - min));
}

/** Exponential backoff with full jitter, capped. */
export function backoffDelay(attempt: number, baseMs = JITTER_MIN_MS, capMs = 120_000): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.floor(exp / 2 + Math.random() * (exp / 2));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. The request controller
 * ────────────────────────────────────────────────────────────────────── */

export interface ControlledRequestOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  /** Max attempts for transient (non-WAF) failures. Default 4. */
  maxAttempts?: number;
  /** Per-request timeout. Default 20s. */
  timeoutMs?: number;
}

/**
 * Performs a single outbound request with full browser signature, optional
 * proxy routing, timeout, and WAF inspection.
 * Throws WafBlockedError on an edge block — callers MUST halt their loop.
 */
export async function controlledFetch(
  url: string,
  options: ControlledRequestOptions = {},
): Promise<Response> {
  const { maxAttempts = 4, timeoutMs = 20_000, headers, ...init } = options;

  let lastError = "Request failed";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const proxyUrl = nextProxy();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const dispatcher = proxyUrl ? await proxyDispatcher(proxyUrl) : null;

      const res = await fetch(url, {
        ...init,
        headers: browserHeaders(headers),
        signal: controller.signal,
        ...(dispatcher ? ({ dispatcher } as Record<string, unknown>) : {}),
      } as RequestInit);

      const verdict: WafVerdict = await inspectResponse(res);

      if (verdict.blocked) {
        // Fail-safe posture: quarantine this exit IP and HALT. No blind retries.
        markProxyDirty(proxyUrl);
        throw new WafBlockedError(verdict);
      }

      if (verdict.action === "CONTINUE") return res;

      // Transient upstream error → exponential backoff, then retry.
      lastError = verdict.reason;
      if (attempt === maxAttempts) return res;
      await sleep(backoffDelay(attempt));
      continue;
    } catch (err) {
      if (err instanceof WafBlockedError) throw err;
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === maxAttempts) break;
      await sleep(backoffDelay(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(lastError);
}

/** Convenience JSON wrapper. */
export async function controlledJson<T>(
  url: string,
  options: ControlledRequestOptions = {},
): Promise<T> {
  const res = await controlledFetch(url, options);
  if (!res.ok) throw new Error(`Upstream responded ${res.status}`);
  return (await res.json()) as T;
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. Throttled polling loop with self-halting WAF posture
 * ────────────────────────────────────────────────────────────────────── */

export interface PollLoopHandlers<T> {
  fetcher: () => Promise<T>;
  onData: (data: T) => void;
  /** Called once, then the loop stops permanently. */
  onWafHalt: (verdict: WafVerdict) => void;
  onTransientError?: (message: string) => void;
  minDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Replacement for `setInterval(fetch, 1000)`.
 * Sequential, jittered (3–5s), backs off on failure, halts on WAF block.
 * Returns a stop() function.
 */
export function startPollingLoop<T>(h: PollLoopHandlers<T>): () => void {
  let stopped = false;
  let failures = 0;

  (async () => {
    while (!stopped) {
      try {
        const data = await h.fetcher();
        failures = 0;
        if (!stopped) h.onData(data);
      } catch (err) {
        if (err instanceof WafBlockedError) {
          h.onWafHalt(err.verdict);
          return; // HARD STOP — retrying worsens the IP block.
        }
        failures += 1;
        h.onTransientError?.(err instanceof Error ? err.message : String(err));
        if (failures >= 6) {
          h.onTransientError?.("Too many consecutive failures — stopping stream.");
          return;
        }
        await sleep(backoffDelay(failures));
        continue;
      }
      await sleep(jitteredDelay(h.minDelayMs, h.maxDelayMs));
    }
  })();

  return () => {
    stopped = true;
  };
}
