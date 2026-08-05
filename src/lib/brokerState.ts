/**
 * src/lib/brokerState.ts
 *
 * Frontend unified broker state manager.
 *
 * Responsibilities:
 *  1. connectVantageAccount() — form locking, 15-second timeout,
 *     POST to /api/v1/connect/vantage, returns session data
 *  2. connectDerivCallback()  — POST parsed OAuth accounts to Render backend
 *  3. openBrokerStream()      — opens WebSocket to Render, consumes
 *     normalised NormalisedFrame messages, dispatches to UI callbacks
 *  4. closeBrokerStream()     — clean teardown
 *
 * The Render backend URL comes from VITE_BACKEND_URL environment variable.
 * Set in Vercel project settings and in .env.local for local dev.
 */

/* ── Types ──────────────────────────────────────────────────────────────── */
export type BrokerType = "VANTAGE_MT5" | "DERIV";
export type FrameType =
  | "connected"
  | "account_update"
  | "position_update"
  | "trade_closed"
  | "error"
  | "ping";

export interface NormalisedFrame {
  type: FrameType;
  broker: BrokerType;
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface AccountMetrics {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  currency: string;
  leverage: number;
}

export interface BrokerStreamHandlers {
  onConnected?: (payload: Record<string, unknown>) => void;
  onAccountUpdate?: (metrics: AccountMetrics) => void;
  onPositionUpdate?: (payload: Record<string, unknown>) => void;
  onTradeClosed?: (payload: Record<string, unknown>) => void;
  onError?: (message: string) => void;
  onDisconnected?: () => void;
}

/* ── Config ──────────────────────────────────────────────────────────────── */
const BACKEND_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_BACKEND_URL ?? "https://paltrade-backend.onrender.com";

const REQUEST_TIMEOUT_MS = 15_000;

/* ── Auth token helpers ──────────────────────────────────────────────────── */
const TOKEN_KEY = "paltrade.jwt";
export const saveToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const loadToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

/* ─────────────────────────────────────────────────────────────────────────
   connectVantageAccount
   
   Implements all 4 frontend submission rules:
     Rule 1 — Lock inputs immediately
     Rule 2 — 15-second AbortController timeout
     Rule 3 — POST to secure backend endpoint
     Rule 4 — Wipe password from memory after use
   ───────────────────────────────────────────────────────────────────────── */
export async function connectVantageAccount(params: {
  loginId: string;
  serverName: string;
  accountType: "DEMO" | "REAL";
  password: string;
  /** Called immediately to lock the form UI */
  onLock: () => void;
  /** Called when the request resolves (success or failure) */
  onUnlock: () => void;
}): Promise<{ ok: true; linkedBrokerId: string; metaAccountId: string } |
             { ok: false; error: string }> {
  const token = loadToken();
  if (!token) return { ok: false, error: "Not signed in. Please log in first." };

  // Rule 1: Lock inputs immediately on call
  params.onLock();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/connect/vantage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        loginId:     params.loginId,
        serverName:  params.serverName,
        accountType: params.accountType,
        password:    params.password, // forwarded once, not stored
      }),
    });

    clearTimeout(timeoutId);
    // Rule 4: password reference ends here — reassign to prevent lingering
    (params as Record<string, unknown>).password = "";

    const data = await res.json() as {
      ok: boolean;
      error?: string;
      linkedBrokerId?: string;
      metaAccountId?: string;
    };

    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? "Connection failed." };
    }
    return { ok: true, linkedBrokerId: data.linkedBrokerId!, metaAccountId: data.metaAccountId! };

  } catch (e) {
    clearTimeout(timeoutId);
    (params as Record<string, unknown>).password = "";
    if ((e as Error).name === "AbortError") {
      return { ok: false, error: "Connection timed out after 15 seconds. MT5 server may be slow — try again." };
    }
    return { ok: false, error: "Network error. Check your connection." };
  } finally {
    params.onUnlock();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   connectDerivCallback
   
   Called after the Deriv OAuth redirect when the frontend has parsed
   acct1/token1/cur1 params. Sends them to the Render backend for
   encryption + storage.
   ───────────────────────────────────────────────────────────────────────── */
export async function connectDerivCallback(
  accounts: Array<{ loginid: string; token: string; currency: string; type: "real" | "virtual" }>,
): Promise<{ ok: boolean; error?: string; linked?: number }> {
  const token = loadToken();
  if (!token) return { ok: false, error: "Not signed in." };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/connect/deriv-callback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      signal: controller.signal,
      body: JSON.stringify({ accounts }),
    });
    clearTimeout(timeoutId);
    return await res.json();
  } catch (e) {
    clearTimeout(timeoutId);
    if ((e as Error).name === "AbortError") return { ok: false, error: "Request timed out." };
    return { ok: false, error: "Network error." };
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   openBrokerStream
   
   Opens a WebSocket to the Render backend, sends an init frame
   identifying which linked broker to stream, and routes all incoming
   normalised frames to the appropriate callback handlers.
   ───────────────────────────────────────────────────────────────────────── */
export function openBrokerStream(
  linkedBrokerId: string,
  handlers: BrokerStreamHandlers,
): { close: () => void } {
  const jwtToken = loadToken();
  if (!jwtToken) {
    handlers.onError?.("Not authenticated. Please sign in.");
    return { close: () => {} };
  }

  const wsUrl = BACKEND_URL.replace(/^http/, "ws") + "/ws";
  const ws = new globalThis.WebSocket(wsUrl);

  ws.onopen = () => {
    // Send init frame — backend authenticates JWT and starts the broker stream
    ws.send(JSON.stringify({
      action: "init",
      linkedBrokerId,
      token: jwtToken,
    }));
  };

  ws.onmessage = (event) => {
    let frame: NormalisedFrame;
    try { frame = JSON.parse(event.data); }
    catch { return; }

    switch (frame.type) {
      case "connected":
        handlers.onConnected?.(frame.payload);
        break;

      case "account_update":
        handlers.onAccountUpdate?.(frame.payload as unknown as AccountMetrics);
        break;

      case "position_update":
        handlers.onPositionUpdate?.(frame.payload);
        break;

      case "trade_closed":
        handlers.onTradeClosed?.(frame.payload);
        break;

      case "error":
        handlers.onError?.(
          (frame.payload.message as string) ?? "Unknown broker error",
        );
        break;
    }
  };

  ws.onclose = () => handlers.onDisconnected?.();
  ws.onerror = () => handlers.onError?.("WebSocket connection error.");

  return {
    close: () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   registerUser / loginUser — simple auth helpers for frontend use
   ───────────────────────────────────────────────────────────────────────── */
export async function registerUser(email: string, password: string) {
  const res = await fetch(`${BACKEND_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json() as { ok: boolean; token?: string; error?: string; user?: { id: string; email: string } };
  if (data.ok && data.token) saveToken(data.token);
  return data;
}

export async function loginUser(email: string, password: string) {
  const res = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json() as { ok: boolean; token?: string; error?: string; user?: { id: string; email: string } };
  if (data.ok && data.token) saveToken(data.token);
  return data;
}
