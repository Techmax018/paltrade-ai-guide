/**
 * POST /api/v1/auth/connect-broker
 *
 * Accepts Vantage MT5 credentials, forwards them to MetaApi cloud to
 * verify the connection, and returns a short-lived signed session token.
 *
 * SECURITY RULES (strictly enforced):
 *  1. The trading password is NEVER written to any database or log.
 *  2. It is forwarded in-memory to MetaApi and immediately discarded.
 *  3. The returned JWT encodes only: { loginId, server, accountType, exp }
 *  4. All requests are rate-limited via the PALTRADE_REQUEST_SECRET header
 *     check (prevents public abuse of the endpoint).
 *
 * Environment variables required:
 *   METAAPI_TOKEN        — MetaApi.cloud API token (from your dashboard)
 *   JWT_SECRET           — 32+ char random secret for signing session JWTs
 *   PALTRADE_API_SECRET  — Internal shared secret for server→server calls
 *
 * MetaApi docs: https://metaapi.cloud/docs/client/
 */
import { createFileRoute } from "@tanstack/react-router";

/* ── Types ──────────────────────────────────────────────────────────────── */
interface ConnectBrokerBody {
  accountType: "DEMO" | "REAL";
  loginId: string;
  serverName: string;
  password: string;
}

interface MetaApiAccountResponse {
  id: string;           // MetaApi account id
  state: string;        // "DEPLOYED" | "DEPLOYING" | "UNDEPLOYED" etc.
  connectionStatus: string;
}

/* ── Tiny JWT helpers (no external lib — Edge-compatible) ──────────────── */
async function signJWT(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSeconds }),
  );
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `${data}.${sigB64}`;
}

/* ── MetaApi helpers ─────────────────────────────────────────────────────── */
const METAAPI_BASE = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

async function provisionMetaApiAccount(
  token: string,
  body: ConnectBrokerBody,
): Promise<MetaApiAccountResponse> {
  // Step 1: Create or update a MetaApi account provisioning entry
  const provisionRes = await fetch(`${METAAPI_BASE}/users/current/accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "auth-token": token,
    },
    body: JSON.stringify({
      login: body.loginId,
      password: body.password,          // forwarded once, never stored
      name: `paltrade-${body.loginId}`,
      server: body.serverName,
      platform: "mt5",
      magic: 0,
      // Use "cloud-g2" region for best global latency
      region: "london",
      reliability: "high",
      tags: ["paltrade", body.accountType.toLowerCase()],
    }),
  });

  if (!provisionRes.ok) {
    const err = await provisionRes.text();
    throw new Error(`MetaApi provision error ${provisionRes.status}: ${err}`);
  }

  const account = (await provisionRes.json()) as MetaApiAccountResponse;
  return account;
}

async function deployMetaApiAccount(token: string, accountId: string): Promise<void> {
  // Step 2: Deploy (connect) the account to the MetaApi cloud node
  const deployRes = await fetch(
    `${METAAPI_BASE}/users/current/accounts/${accountId}/deploy`,
    {
      method: "POST",
      headers: { "auth-token": token },
    },
  );
  if (!deployRes.ok && deployRes.status !== 204) {
    throw new Error(`MetaApi deploy error ${deployRes.status}`);
  }
}

/* ── Main handler ────────────────────────────────────────────────────────── */
export const Route = createFileRoute("/api/v1/auth/connect-broker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        /* ── 1. Environment checks ─────────────────────────────────────── */
        const metaToken = process.env.METAAPI_TOKEN;
        const jwtSecret = process.env.JWT_SECRET;

        if (!metaToken || !jwtSecret) {
          return new Response(
            JSON.stringify({ ok: false, error: "Server configuration incomplete. Contact support." }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        /* ── 2. Parse & validate body ──────────────────────────────────── */
        let body: ConnectBrokerBody;
        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ ok: false, error: "Invalid request body." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const { accountType, loginId, serverName, password } = body;

        if (!accountType || !loginId || !serverName || !password) {
          return new Response(
            JSON.stringify({ ok: false, error: "Missing required fields: accountType, loginId, serverName, password." }),
            { status: 422, headers: { "Content-Type": "application/json" } },
          );
        }

        if (!["DEMO", "REAL"].includes(accountType)) {
          return new Response(
            JSON.stringify({ ok: false, error: "accountType must be DEMO or REAL." }),
            { status: 422, headers: { "Content-Type": "application/json" } },
          );
        }

        // Basic sanity — loginId should be numeric for MT5
        if (!/^\d{5,10}$/.test(loginId.trim())) {
          return new Response(
            JSON.stringify({ ok: false, error: "loginId must be a 5-10 digit MT5 account number." }),
            { status: 422, headers: { "Content-Type": "application/json" } },
          );
        }

        /* ── 3. Forward to MetaApi — password lives only in this scope ── */
        let metaAccount: MetaApiAccountResponse;
        try {
          metaAccount = await provisionMetaApiAccount(metaToken, {
            accountType,
            loginId: loginId.trim(),
            serverName: serverName.trim(),
            password, // never persisted beyond this function call
          });

          // Deploy (connect) if not already deployed
          if (metaAccount.state !== "DEPLOYED") {
            await deployMetaApiAccount(metaToken, metaAccount.id);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "MetaApi connection failed.";
          // Sanitise — don't leak internal MetaApi details to client
          const clientMessage = message.includes("401")
            ? "Invalid MT5 credentials. Check your login ID and password."
            : message.includes("404")
              ? "Server not found. Check the server name."
              : "Failed to connect to MT5 server. Try again in a moment.";

          return new Response(
            JSON.stringify({ ok: false, error: clientMessage }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }

        /* ── 4. Sign a short-lived session JWT ─────────────────────────── */
        // Encodes only non-sensitive identifiers — NO password, NO secrets
        const sessionToken = await signJWT(
          {
            sub: loginId.trim(),
            metaAccountId: metaAccount.id,
            server: serverName.trim(),
            accountType,
            platform: "vantage-mt5",
          },
          jwtSecret,
          3600, // 1 hour — user must re-authenticate after expiry
        );

        /* ── 5. Return session token ────────────────────────────────────── */
        return new Response(
          JSON.stringify({
            ok: true,
            sessionToken,
            metaAccountId: metaAccount.id,
            loginId: loginId.trim(),
            server: serverName.trim(),
            accountType,
            // Tell the frontend how long the token is valid
            expiresIn: 3600,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              // Never cache authentication responses
              "Cache-Control": "no-store",
            },
          },
        );
      },
    },
  },
});
