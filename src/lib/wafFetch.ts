/**
 * src/lib/wafFetch.ts
 *
 * Edge-runtime-safe outbound request controller (Cloudflare Workers).
 * Mirrors server/src/lib/requestController.ts but with no Node-only deps.
 *
 *  - Authentic browser headers on every request
 *  - Randomized jitter (3–5s) + exponential backoff for polling loops
 *  - Fail-safe: HTTP 403 / Cloudflare body signature => HALT, never retry
 *  - Optional residential-proxy routing config block
 */

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
];

export function browserHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
  return {
    "User-Agent": ua,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Connection: "keep-alive",
    "Cache-Control": "no-cache",
    "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Google Chrome";v="127"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": ua.includes("Macintosh") ? '"macOS"' : '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    ...extra,
  };
}

/* ── Optional residential proxy routing ────────────────────────────────────
 * Workers cannot open raw proxy tunnels, so route via an HTTPS forward-proxy
 * gateway that accepts the target URL. Configure:
 *   PROXY_ENABLED=true
 *   PROXY_GATEWAY=https://gateway.provider.io/fetch?url=
 *   PROXY_AUTH=<api key sent as x-proxy-auth>
 * Leave disabled to call brokers directly.
 */
export interface EdgeProxyConfig {
  enabled: boolean;
  gateway: string;
  auth: string;
}

export function readProxyConfig(): EdgeProxyConfig {
  return {
    enabled: String(process.env.PROXY_ENABLED ?? "false") === "true",
    gateway: process.env.PROXY_GATEWAY ?? "",
    auth: process.env.PROXY_AUTH ?? "",
  };
}

function applyProxy(url: string, cfg: EdgeProxyConfig): { url: string; headers: Record<string, string> } {
  if (!cfg.enabled || !cfg.gateway) return { url, headers: {} };
  return {
    url: `${cfg.gateway}${encodeURIComponent(url)}`,
    headers: cfg.auth ? { "x-proxy-auth": cfg.auth } : {},
  };
}

/* ── WAF detection ───────────────────────────────────────────────────────── */

const WAF_SIGNATURES = [
  "access denied",
  "attention required",
  "cloudflare",
  "blocked by security systems",
  "unusual activity from your connection",
  "just a moment",
  "__cf_chl",
  "error code: 1020",
  "sorry, you have been blocked",
];

export const WAF_CLIENT_MESSAGE =
  "Broker edge firewall blocked this server. Switch network connection / renew your IP address, then reconnect.";

export interface WafVerdict {
  blocked: boolean;
  status: number;
  rayId?: string;
  reason: string;
  clientMessage: string;
}

export class WafBlockedError extends Error {
  override readonly name = "WafBlockedError";
  readonly verdict: WafVerdict;
  constructor(verdict: WafVerdict) {
    super(verdict.reason);
    this.verdict = verdict;
  }
}

export function isWafBlockedError(err: unknown): err is WafBlockedError {
  return err instanceof Error && err.name === "WafBlockedError";
}

async function inspect(res: Response): Promise<WafVerdict> {
  const rayId = res.headers.get("cf-ray") ?? undefined;
  if (res.ok) {
    return { blocked: false, status: res.status, reason: "ok", clientMessage: "" };
  }

  let body = "";
  try {
    body = (await res.clone().text()).slice(0, 4000).toLowerCase();
  } catch {
    /* ignore */
  }
  const hit = WAF_SIGNATURES.some((s) => body.includes(s));
  const blocked = res.status === 403 || hit || (res.status === 503 && Boolean(rayId));

  return {
    blocked,
    status: res.status,
    ...(rayId ? { rayId } : {}),
    reason: blocked
      ? `WAF edge block (HTTP ${res.status})${rayId ? ` ray=${rayId}` : ""}`
      : `Upstream error (HTTP ${res.status})`,
    clientMessage: blocked ? WAF_CLIENT_MESSAGE : "",
  };
}

/* ── Timing helpers ──────────────────────────────────────────────────────── */

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Randomized 3000–5000 ms poll interval — never a static 1s tick. */
export function jitteredDelay(min = 3000, max = 5000): number {
  return Math.floor(min + Math.random() * (max - min));
}

/** Exponential backoff with full jitter, capped at 2 minutes. */
export function backoffDelay(attempt: number, baseMs = 3000, capMs = 120_000): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.floor(exp / 2 + Math.random() * (exp / 2));
}

/* ── Controlled fetch ────────────────────────────────────────────────────── */

export interface ControlledOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  maxAttempts?: number;
  timeoutMs?: number;
}

export async function controlledFetch(
  target: string,
  options: ControlledOptions = {},
): Promise<Response> {
  const { maxAttempts = 3, timeoutMs = 20_000, headers, ...init } = options;
  const cfg = readProxyConfig();
  const routed = applyProxy(target, cfg);

  let lastError = "Request failed";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(routed.url, {
        ...init,
        headers: browserHeaders({ ...headers, ...routed.headers }),
        signal: controller.signal,
      });

      const verdict = await inspect(res);
      if (verdict.blocked) throw new WafBlockedError(verdict);
      if (res.ok) return res;

      lastError = verdict.reason;
      if (attempt === maxAttempts) return res;
      await sleep(backoffDelay(attempt));
    } catch (err) {
      if (isWafBlockedError(err)) throw err;
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === maxAttempts) break;
      await sleep(backoffDelay(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(lastError);
}

export async function controlledJson<T>(url: string, options: ControlledOptions = {}): Promise<T> {
  const res = await controlledFetch(url, options);
  if (!res.ok) throw new Error(`Upstream responded ${res.status}`);
  return (await res.json()) as T;
}
