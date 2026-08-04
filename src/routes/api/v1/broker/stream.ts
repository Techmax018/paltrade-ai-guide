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

/* ── MetaApi account information fetcher ───────────────────────────────── */
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
  const res = await fetch(
    `${METAAPI_CLIENT_BASE}/users/current/accounts/${metaAccountId}/account-information`,
    {
      headers: {
        "auth-token": metaToken,
        "Content-Type": "application/json",
      },
    },
  );

  if (!res.ok) {
    throw new Error(`MetaApi account-info ${res.status}`);
  }

  return (await res.json()) as MT5AccountInfo;
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

        /* ── Stream account metrics every 3 seconds via SSE ─────────────── */
        const encoder = new TextEncoder();
        let intervalId: ReturnType<typeof setInterval> | null = null;

        const stream = new ReadableStream({
          async start(controller) {
            // Send initial connected event
            controller.enqueue(
              encoder.encode(
                sseEvent("connected", {
                  message: "MT5 stream established",
                  accountId: metaAccountId,
                  server: payload.server,
                  loginId: payload.sub,
                }),
              ),
            );

            // Poll MetaApi every 3 s and push account-info events
            async function pushUpdate() {
              try {
                const info = await fetchAccountInfo(metaToken!, metaAccountId);
                controller.enqueue(
                  encoder.encode(
                    sseEvent("account-update", {
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
                    }),
                  ),
                );
              } catch (err) {
                controller.enqueue(
                  encoder.encode(
                    sseEvent("error", {
                      message: "Failed to fetch account data. Retrying…",
                      detail: err instanceof Error ? err.message : String(err),
                    }),
                  ),
                );
              }
            }

            // First push immediately
            await pushUpdate();

            // Then every 3 s
            intervalId = setInterval(pushUpdate, 3000);
          },

          cancel() {
            // Client disconnected — clean up the polling interval
            if (intervalId) clearInterval(intervalId);
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
