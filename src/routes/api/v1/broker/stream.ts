/**
 * GET /api/v1/broker/stream
 *
 * Server-Sent Events (SSE) endpoint that streams live MT5 account
 * metrics (Balance, Equity, Margin, Free Margin) from MetaApi
 * to the PalTrade dashboard.
 *
 * Why SSE instead of raw WebSocket?
 *   TanStack Start / Nitro runs on Cloudflare/Vercel edge runtimes that
 *   don't support upgrading HTTP to raw WebSocket in serverless handlers.
 *   SSE uses a single long-lived HTTP connection, works on all edge
 *   runtimes, and is just as real-time for read-only metric streaming.
 *   The frontend uses the native EventSource API to consume it.
 *
 * Authentication:
 *   Pass the session JWT from /api/v1/auth/connect-broker as a query
 *   param: ?token=<jwt>
 *   (Authorization header is not supported by EventSource in browsers)
 *
 * Environment variables required:
 *   METAAPI_TOKEN  — MetaApi.cloud API token
 *   JWT_SECRET     — Same secret used to sign tokens in connect-broker
 *
 * MetaApi account info endpoint:
 *   GET https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/{id}/account-information
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  controlledJson,
  isWafBlockedError,
  jitteredDelay,
  backoffDelay,
  sleep,
  WAF_CLIENT_MESSAGE,
} from "@/lib/wafFetch";

/* ── JWT verification (Edge-compatible, no external libs) ──────────────── */
async function verifyJWT(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts;
    const data = `${header}.${body}`;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    // Reconstruct signature bytes
    const sigPadded = sig.replace(/-/g, "+").replace(/_/g, "/") +
      "==".slice(0, (4 - (sig.length % 4)) % 4);
    const sigBytes = Uint8Array.from(atob(sigPadded), (c) => c.charCodeAt(0));

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(data),
    );
    if (!valid) return null;

    const payload = JSON.parse(atob(body)) as Record<string, unknown>;

    // Check expiry
    if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // expired
    }

    return payload;
  } catch {
    return null;
  }
}

/* ── MetaApi account information fetcher (WAF-hardened) ────────────────── */
const METAAPI_CLIENT_BASE =
  "https://mt-client-api-v1.london.agiliumtrade.ai";

interface MT5AccountInfo {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  currency: string;
  leverage: number;
  server: string;
  type: string;
  name: string;
  login: number;
}

async function fetchAccountInfo(
  metaToken: string,
  metaAccountId: string,
): Promise<MT5AccountInfo> {
  // controlledFetch adds an authentic browser signature, retries transient
  // failures with exponential backoff, and throws WafBlockedError on a
  // Cloudflare edge block so the caller can halt instead of hammering.
  return controlledJson<MT5AccountInfo>(
    `${METAAPI_CLIENT_BASE}/users/current/accounts/${metaAccountId}/account-information`,
    {
      headers: {
        "auth-token": metaToken,
        "Content-Type": "application/json",
      },
    },
  );
}


/* ── SSE helpers ─────────────────────────────────────────────────────────── */
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/* ── Main handler ────────────────────────────────────────────────────────── */
export const Route = createFileRoute("/api/v1/broker/stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const metaToken = process.env.METAAPI_TOKEN;
        const jwtSecret = process.env.JWT_SECRET;

        if (!metaToken || !jwtSecret) {
          return new Response("Server configuration error.", { status: 500 });
        }

        /* ── Authenticate via JWT query param ──────────────────────────── */
        const url = new URL(request.url);
        const token = url.searchParams.get("token");

        if (!token) {
          return new Response(
            sseEvent("error", { message: "Missing session token." }),
            {
              status: 401,
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
              },
            },
          );
        }

        const payload = await verifyJWT(token, jwtSecret);
        if (!payload) {
          return new Response(
            sseEvent("error", { message: "Invalid or expired session. Please reconnect." }),
            {
              status: 401,
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
              },
            },
          );
        }

        const metaAccountId = payload.metaAccountId as string;

        /* ── Throttled, self-halting SSE polling loop ────────────────────
         * Sequential requests with 3–5 s randomized jitter (never a static
         * 1 s tick), exponential backoff on transient errors, and a hard
         * stop on any Cloudflare/WAF block so we don't deepen the IP ban.
         */
        const encoder = new TextEncoder();
        let stopped = false;

        const stream = new ReadableStream({
          async start(controller) {
            const emit = (event: string, data: unknown) => {
              if (stopped) return;
              controller.enqueue(encoder.encode(sseEvent(event, data)));
            };

            emit("connected", {
              message: "MT5 stream established",
              accountId: metaAccountId,
              server: payload.server,
              loginId: payload.sub,
            });

            let failures = 0;

            while (!stopped) {
              try {
                const info = await fetchAccountInfo(metaToken!, metaAccountId);
                failures = 0;
                emit("account-update", {
                  timestamp: Date.now(),
                  balance: info.balance,
                  equity: info.equity,
                  margin: info.margin,
                  freeMargin: info.freeMargin,
                  marginLevel: info.marginLevel,
                  currency: info.currency,
                  leverage: info.leverage,
                  server: info.server,
                  name: info.name,
                });
              } catch (err) {
                if (isWafBlockedError(err)) {
                  // Fail-safe rejection posture: halt immediately.
                  emit("waf-blocked", {
                    message: WAF_CLIENT_MESSAGE,
                    action: "SWITCH_NETWORK_RENEW_IP",
                    status: err.verdict.status,
                    rayId: err.verdict.rayId ?? null,
                  });
                  stopped = true;
                  try { controller.close(); } catch { /* already closed */ }
                  return;
                }

                failures += 1;
                emit("error", {
                  message: "Failed to fetch account data. Backing off…",
                  detail: err instanceof Error ? err.message : String(err),
                  attempt: failures,
                });

                if (failures >= 6) {
                  emit("error", { message: "Too many consecutive failures — stream stopped." });
                  stopped = true;
                  try { controller.close(); } catch { /* already closed */ }
                  return;
                }

                await sleep(backoffDelay(failures));
                continue;
              }

              await sleep(jitteredDelay(3000, 5000));
            }
          },

          cancel() {
            // Client disconnected — stop the loop.
            stopped = true;
          },
        });


        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            // Required for SSE to work through proxies/Vercel
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
