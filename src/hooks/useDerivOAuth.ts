/**
 * useDerivOAuth.ts
 *
 * Handles the full Deriv OAuth 2.0 redirect flow.
 *
 * Flow:
 *  1. User clicks "Login with Deriv" → redirected to Deriv OAuth consent page
 *  2. After approval, Deriv redirects back to our app with URL params:
 *       ?acct1=CR123456&token1=a1-xxx&cur1=USD
 *       &acct2=VRTC999&token2=a1-yyy&cur2=USD   (virtual account if exists)
 *  3. This hook reads those params, picks the best account (real > virtual),
 *     persists the session to localStorage, and cleans the URL.
 *
 * Security:
 *  - Tokens are stored in localStorage under STORAGE_KEY.
 *  - They are short-lived Deriv read+trade tokens — not passwords.
 *  - The hook never logs token values to the console.
 *  - Call `logout()` to wipe all stored session data.
 *
 * Usage:
 *   const { session, accounts, activeAccount, setActiveAccount, logout } = useDerivOAuth();
 */

import { useEffect, useState } from "react";

/* ── Constants ──────────────────────────────────────────────────────────── */
const STORAGE_KEY = "paltrade.deriv.session.v1";
const CONNECTIONS_KEY = "paltrade.connections.v1";

/**
 * Build the Deriv OAuth URL.
 * Reads VITE_DERIV_APP_ID from the environment (set in Vercel project settings).
 * Falls back to 1089 for local dev.
 */
export function buildDerivOAuthUrl(): string {
  const appId =
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: Record<string, string> }).env
        ?.VITE_DERIV_APP_ID) ||
    "1089";
  // redirect_uri must point to /login so the OAuth callback is handled there
  const origin = typeof window !== "undefined" ? window.location.origin : "https://paltrade-ai-guide.vercel.app";
  const redirectUri = encodeURIComponent(`${origin}/login`);
  return `https://oauth.deriv.com/oauth2/authorize?app_id=${appId}&redirect_uri=${redirectUri}`;
}

/* ── Types ──────────────────────────────────────────────────────────────── */
export interface DerivOAuthAccount {
  loginid: string;
  token: string;
  currency: string;
  /** "real" | "virtual" derived from loginid prefix */
  type: "real" | "virtual";
}

export interface DerivOAuthSession {
  accounts: DerivOAuthAccount[];
  /** loginid of the currently active account */
  activeLoginId: string;
  savedAt: number;
}

export interface UseDerivOAuthResult {
  /** All accounts returned by the OAuth redirect */
  accounts: DerivOAuthAccount[];
  /** The currently selected account (the one used for WebSocket auth) */
  activeAccount: DerivOAuthAccount | null;
  /** Switch the active account (e.g. real ↔ virtual) */
  setActiveAccount: (loginid: string) => void;
  /** True if a valid session exists in localStorage */
  isAuthenticated: boolean;
  /** True while the hook is parsing the URL / reading storage on first render */
  loading: boolean;
  /** Wipe the session and connections from localStorage */
  logout: () => void;
}

/* ── localStorage helpers ────────────────────────────────────────────────── */
function loadSession(): DerivOAuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DerivOAuthSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: DerivOAuthSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(CONNECTIONS_KEY);
}

/* ── URL param parser ───────────────────────────────────────────────────── */
/**
 * Deriv appends up to N account pairs to the redirect URL:
 *   acct1, token1, cur1, acct2, token2, cur2, …
 * Returns them as an array of DerivOAuthAccount, sorted real-first.
 */
function parseDerivRedirectParams(search: string): DerivOAuthAccount[] {
  const params = new URLSearchParams(search);
  const accounts: DerivOAuthAccount[] = [];

  let i = 1;
  while (params.has(`acct${i}`)) {
    const loginid = params.get(`acct${i}`) ?? "";
    const token = params.get(`token${i}`) ?? "";
    const currency = params.get(`cur${i}`) ?? "USD";

    if (loginid && token) {
      // Deriv virtual accounts start with "VR" prefix
      const type: "real" | "virtual" = /^VR/i.test(loginid) ? "virtual" : "real";
      accounts.push({ loginid, token, currency, type });
    }
    i++;
  }

  // Sort: real accounts first, then virtual
  return accounts.sort((a, b) => {
    if (a.type === b.type) return 0;
    return a.type === "real" ? -1 : 1;
  });
}

/* ── Main hook ──────────────────────────────────────────────────────────── */
export function useDerivOAuth(): UseDerivOAuthResult {
  const [session, setSession] = useState<DerivOAuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check if this page load is a Deriv OAuth redirect
    const search = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(search);

    if (params.has("acct1") && params.has("token1")) {
      // ── OAuth redirect received ──────────────────────────────────────
      const accounts = parseDerivRedirectParams(search);

      if (accounts.length > 0) {
        // Prefer the first real account; fall back to first virtual
        const preferred = accounts.find((a) => a.type === "real") ?? accounts[0];

        const newSession: DerivOAuthSession = {
          accounts,
          activeLoginId: preferred.loginid,
          savedAt: Date.now(),
        };

        saveSession(newSession);

        // Also write to paltrade.connections.v1 so ConnectGate passes
        const connections = accounts.map((a) => ({
          broker: "deriv",
          account: a.loginid,
          currency: a.currency,
          connectedAt: Date.now(),
        }));
        localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections));

        setSession(newSession);

        // Clean OAuth params from the URL without a page reload
        const clean = new URL(window.location.href);
        ["acct1", "token1", "cur1", "acct2", "token2", "cur2",
         "acct3", "token3", "cur3"].forEach((k) => clean.searchParams.delete(k));
        window.history.replaceState({}, "", clean.toString());
      }
    } else {
      // ── Normal page load — try to restore saved session ──────────────
      const saved = loadSession();
      if (saved) setSession(saved);
    }

    setLoading(false);
  }, []);

  function setActiveAccount(loginid: string) {
    if (!session) return;
    const updated: DerivOAuthSession = { ...session, activeLoginId: loginid };
    saveSession(updated);
    setSession(updated);
  }

  function logout() {
    clearSession();
    setSession(null);
  }

  const accounts = session?.accounts ?? [];
  const activeAccount =
    accounts.find((a) => a.loginid === session?.activeLoginId) ?? accounts[0] ?? null;

  return {
    accounts,
    activeAccount,
    setActiveAccount,
    isAuthenticated: !!activeAccount,
    loading,
    logout,
  };
}
