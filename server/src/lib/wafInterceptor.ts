/**
 * server/src/lib/wafInterceptor.ts
 *
 * Error-handler interceptor for Cloudflare / WAF edge blocks.
 *
 * Responsibility:
 *  - Detect a WAF rejection from an HTTP response (status + body signature)
 *  - Convert it into a typed, non-throwing-in-a-loop error object
 *  - Give the caller a machine-readable action so the polling loop can HALT
 *    instead of hammering the edge (which escalates the IP block)
 */

export type WafAction = "HALT_AND_ROTATE_IP" | "BACKOFF" | "CONTINUE";

export interface WafVerdict {
  blocked: boolean;
  action: WafAction;
  status: number;
  rayId?: string;
  reason: string;
  /** Message intended for the client UI */
  clientMessage: string;
}

/** Cloudflare / generic WAF body fingerprints. */
const WAF_BODY_SIGNATURES = [
  "access denied",
  "attention required",
  "cf-ray",
  "cloudflare",
  "blocked by security systems",
  "unusual activity from your connection",
  "just a moment",
  "__cf_chl",
  "error code: 1020",
  "ddos protection by",
  "sorry, you have been blocked",
];

const HALT_STATUSES = new Set([401, 403, 406, 503, 1020]);

export class WafBlockedError extends Error {
  readonly name = "WafBlockedError";
  readonly verdict: WafVerdict;
  constructor(verdict: WafVerdict) {
    super(verdict.reason);
    this.verdict = verdict;
  }
}

export function isWafBlockedError(err: unknown): err is WafBlockedError {
  return err instanceof Error && err.name === "WafBlockedError";
}

const CLIENT_MESSAGE =
  "Connection blocked by the broker's edge firewall. Switch network connection / renew your IP address (toggle mobile hotspot, VPN or proxy) and reconnect.";

/**
 * Inspect a response. Reads the body ONLY when the status is suspicious,
 * so happy-path requests keep their stream intact for the caller.
 */
export async function inspectResponse(res: Response): Promise<WafVerdict> {
  const rayId = res.headers.get("cf-ray") ?? undefined;
  const server = (res.headers.get("server") ?? "").toLowerCase();
  const suspiciousStatus = HALT_STATUSES.has(res.status);

  if (!suspiciousStatus && res.ok) {
    return {
      blocked: false,
      action: "CONTINUE",
      status: res.status,
      ...(rayId ? { rayId } : {}),
      reason: "ok",
      clientMessage: "",
    };
  }

  let bodySample = "";
  try {
    bodySample = (await res.clone().text()).slice(0, 4000).toLowerCase();
  } catch {
    /* body already consumed or empty — fall back to header signals */
  }

  const bodyHit = WAF_BODY_SIGNATURES.some((s) => bodySample.includes(s));
  const edgeHit = server.includes("cloudflare") || Boolean(rayId);

  if ((res.status === 403 || res.status === 1020) && (bodyHit || edgeHit)) {
    return {
      blocked: true,
      action: "HALT_AND_ROTATE_IP",
      status: res.status,
      ...(rayId ? { rayId } : {}),
      reason: `Cloudflare WAF block (HTTP ${res.status})${rayId ? ` ray=${rayId}` : ""}`,
      clientMessage: CLIENT_MESSAGE,
    };
  }

  if (res.status === 403 || bodyHit) {
    return {
      blocked: true,
      action: "HALT_AND_ROTATE_IP",
      status: res.status,
      ...(rayId ? { rayId } : {}),
      reason: `Edge rejection (HTTP ${res.status})`,
      clientMessage: CLIENT_MESSAGE,
    };
  }

  // 429 / 5xx / transient — worth a backed-off retry, not a halt.
  return {
    blocked: false,
    action: res.ok ? "CONTINUE" : "BACKOFF",
    status: res.status,
    ...(rayId ? { rayId } : {}),
    reason: res.ok ? "ok" : `Transient upstream error (HTTP ${res.status})`,
    clientMessage: "",
  };
}

/**
 * Wrap any async task so a WAF event never freezes the execution thread:
 * it resolves to a discriminated result the caller can branch on.
 */
export async function guardWaf<T>(
  task: () => Promise<T>,
): Promise<
  | { ok: true; data: T }
  | { ok: false; halted: boolean; verdict?: WafVerdict; error: string }
> {
  try {
    return { ok: true, data: await task() };
  } catch (err) {
    if (isWafBlockedError(err)) {
      return { ok: false, halted: true, verdict: err.verdict, error: err.verdict.reason };
    }
    return { ok: false, halted: false, error: err instanceof Error ? err.message : String(err) };
  }
}
