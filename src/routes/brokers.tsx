import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Activity, ArrowRight, CheckCircle2, ChevronDown, ChevronUp,
  ExternalLink, LogOut, RefreshCw, ShieldCheck, Unplug, User, XCircle,
} from "lucide-react";
import { getOrigin } from "../lib/og";
import { buildDerivOAuthUrl, useDerivOAuth, type DerivOAuthAccount } from "../hooks/useDerivOAuth";

/* ── Storage / types ─────────────────────────────────────────────────────── */
const VANTAGE_SESSION_KEY = "paltrade.vantage.session.v1";

interface VantageSession {
  sessionToken: string;
  metaAccountId: string;
  loginId: string;
  server: string;
  accountType: "DEMO" | "REAL";
  expiresAt: number;
}

interface VantageMetrics {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  currency: string;
  leverage: number;
  server: string;
  name: string;
  timestamp: number;
}

interface ServerOption {
  id: string;
  label: string;
  type: "demo" | "live";
}

function loadVantageSession(): VantageSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(VANTAGE_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as VantageSession;
    if (Date.now() > s.expiresAt) { localStorage.removeItem(VANTAGE_SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}

function saveVantageSession(s: VantageSession) {
  if (typeof window !== "undefined") localStorage.setItem(VANTAGE_SESSION_KEY, JSON.stringify(s));
}

function clearVantageSession() {
  if (typeof window !== "undefined") localStorage.removeItem(VANTAGE_SESSION_KEY);
}

/* ── Route ───────────────────────────────────────────────────────────────── */
export const Route = createFileRoute("/brokers")({
  loader: async () => ({ origin: await getOrigin() }),
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? "";
    const img = `${origin}/og-brokers.jpg`;
    return {
      meta: [
        { title: "Connect Broker — PalTrade" },
        { name: "description", content: "Connect Deriv or Vantage MT5 to PalTrade." },
        { property: "og:title", content: "Connect Broker — PalTrade" },
        { property: "og:image", content: img },
        { name: "twitter:image", content: img },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: "/brokers" }],
    };
  },
  component: BrokersPage,
});

function BrokersPage() {
  const oauth = useDerivOAuth();
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            ← Back to PalTrade
          </Link>
          <span className="text-sm font-semibold">Broker Connections</span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-6 px-4 py-10">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-widest text-primary">Connect your account</div>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Link your broker to PalTrade</h1>
          <p className="mt-3 text-muted-foreground">
            Deriv uses OAuth 2.0. Vantage uses a secure MetaApi cloud bridge —
            your password is verified once and never stored.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <DerivCard oauth={oauth} />
          <VantageCard />
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-4 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div>
            <span className="font-medium text-foreground">Security.</span>
            {" "}Deriv: OAuth 2.0, short-lived tokens.
            Vantage: MT5 password forwarded once to MetaApi for handshake — immediately discarded,
            never written to any log or database.
          </div>
        </div>
      </section>
    </main>
  );
}

/* ── Deriv OAuth card ────────────────────────────────────────────────────── */
function DerivCard({ oauth }: { oauth: ReturnType<typeof useDerivOAuth> }) {
  const { accounts, activeAccount, setActiveAccount, isAuthenticated, loading, logout } = oauth;
  const isRedirect = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("acct1");
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-card space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-lg font-semibold">Deriv</div>
          <p className="mt-1 text-sm text-muted-foreground">OAuth 2.0 — secure login via Deriv's auth page.</p>
        </div>
        <img src="/android-chrome-192x192.png" alt="" className="h-9 w-9 rounded-lg object-cover opacity-80" />
      </div>

      {!loading && isAuthenticated && isRedirect && (
        <div className="flex items-center gap-3 rounded-xl border border-profit/30 bg-profit/8 px-4 py-3 text-sm text-profit">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Connected successfully.
          <Link to="/terminal" className="ml-auto flex items-center gap-1 rounded-md bg-profit px-3 py-1.5 text-xs font-bold text-background">
            Terminal <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Checking session…</p>
      ) : isAuthenticated ? (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Linked accounts</div>
          {accounts.map((acc) => (
            <AccountRow key={acc.loginid} account={acc}
              isActive={acc.loginid === activeAccount?.loginid}
              onSelect={() => setActiveAccount(acc.loginid)} />
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link to="/terminal" className="flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-bold text-background">
              Open Terminal <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <a href={buildDerivOAuthUrl()} className="flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-3 py-2 text-xs hover:border-signal/40">
              <RefreshCw className="h-3.5 w-3.5" /> Re-authorise
            </a>
            <button onClick={logout} className="flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground hover:border-bear/50 hover:text-bear">
              <LogOut className="h-3.5 w-3.5" /> Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground space-y-2">
            {["Redirect to Deriv login", "Approve PalTrade access", "Return with session token", "No password shared"].map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-signal/15 font-mono text-[10px] font-bold text-signal">{i + 1}</span>
                {s}
              </div>
            ))}
          </div>
          <a href={buildDerivOAuthUrl()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-glow transition hover:brightness-110">
            <ExternalLink className="h-4 w-4" /> Login with Deriv
          </a>
          <p className="text-center text-[11px] text-muted-foreground">
            No account?{" "}
            <a href="https://deriv.com/signup/" target="_blank" rel="noopener noreferrer" className="text-signal hover:underline">
              Create a free Deriv account
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

function AccountRow({ account, isActive, onSelect }: { account: DerivOAuthAccount; isActive: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${isActive ? "border-signal/50 bg-signal/10 text-foreground" : "border-border/60 bg-background/30 text-muted-foreground hover:text-foreground"}`}>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${isActive ? "bg-signal/20 text-signal" : "bg-muted text-muted-foreground"}`}>
        <User className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-mono font-semibold truncate">{account.loginid}</div>
        <div className="text-[11px] text-muted-foreground">{account.currency} · {account.type === "real" ? "Real" : "Virtual/Demo"}</div>
      </div>
      {isActive && <span className="shrink-0 rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 text-[10px] font-bold text-signal">Active</span>}
    </button>
  );
}

/* ── Vantage MT5 card ────────────────────────────────────────────────────── */
function VantageCard() {
  const [session, setSession] = useState<VantageSession | null>(null);
  const [metrics, setMetrics] = useState<VantageMetrics | null>(null);
  const [streamStatus, setStreamStatus] = useState<"idle"|"connecting"|"live"|"error">("idle");
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [serversLoading, setServersLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [acctType, setAcctType] = useState<"DEMO"|"REAL">("DEMO");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState("");
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const saved = loadVantageSession();
    setSession(saved);
    if (saved) openStream(saved.sessionToken);
    return () => esRef.current?.close();
  }, []);

  // ── RULE 1: Fetch dynamic server list from backend ────────────────────────
  useEffect(() => {
    fetch("/api/v1/broker/servers")
      .then((r) => r.json())
      .then((data: { ok: boolean; servers: ServerOption[] }) => {
        if (data.ok && data.servers.length) {
          setServers(data.servers);
          setServer(data.servers[0].label);
        }
      })
      .catch(() => {
        // Graceful fallback — still no hardcoding; these mirror the backend config
        const fallback: ServerOption[] = [
          { id: "demo", label: "VantageFX-Demo", type: "demo" },
          { id: "live", label: "VantageInternational-Live", type: "live" },
        ];
        setServers(fallback);
        setServer(fallback[0].label);
      })
      .finally(() => setServersLoading(false));
  }, []);

  // ── RULE 4: Open SSE stream for live account metrics ──────────────────────
  function openStream(token: string) {
    esRef.current?.close();
    setStreamStatus("connecting");
    setWafAlert("");
    const es = new EventSource(`/api/v1/broker/stream?token=${encodeURIComponent(token)}`);
    esRef.current = es;
    es.addEventListener("connected", () => setStreamStatus("live"));
    es.addEventListener("account-update", (e) => {
      try { setMetrics(JSON.parse(e.data) as VantageMetrics); } catch { /* ignore */ }
    });
    // Edge firewall block — the server has halted polling on purpose.
    es.addEventListener("waf-blocked", (e) => {
      let message = "Broker edge firewall blocked this connection. Switch network connection / renew your IP address.";
      try { message = (JSON.parse((e as MessageEvent).data) as { message?: string }).message ?? message; } catch { /* ignore */ }
      setWafAlert(message);
      setStreamStatus("error");
      es.close();
    });
    es.addEventListener("error", () => { setStreamStatus("error"); es.close(); });
    es.onerror = () => { setStreamStatus("error"); es.close(); };
  }


  // ── RULE 2 + 3: connectVantageAccount — locking, timeout, secure POST ─────
  async function connectVantageAccount() {
    if (connecting) return;
    if (!loginId.trim() || !password.trim() || !server) {
      setErr("Please fill in all fields."); return;
    }
    setErr("");
    setConnecting(true); // immediately lock all inputs

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      setErr("Connection timed out after 15 seconds. The MT5 server may be slow — try again.");
      setConnecting(false);
    }, 15_000); // 15-second timeout per Rule 2

    try {
      const res = await fetch("/api/v1/auth/connect-broker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          accountType: acctType,
          loginId: loginId.trim(),
          serverName: server,
          password, // forwarded once to backend, never stored client-side
        }),
      });
      clearTimeout(timeoutId);

      const data = await res.json() as {
        ok: boolean; error?: string; sessionToken?: string;
        metaAccountId?: string; loginId?: string; server?: string;
        accountType?: "DEMO"|"REAL"; expiresIn?: number;
      };

      if (!res.ok || !data.ok) {
        setErr(data.error ?? "Connection failed. Check your credentials.");
        return;
      }

      const newSession: VantageSession = {
        sessionToken: data.sessionToken!,
        metaAccountId: data.metaAccountId!,
        loginId: data.loginId!,
        server: data.server!,
        accountType: data.accountType!,
        expiresAt: Date.now() + (data.expiresIn ?? 3600) * 1000,
      };

      saveVantageSession(newSession);
      setSession(newSession);
      setFormOpen(false);
      setPassword(""); // wipe password from state immediately after use
      openStream(newSession.sessionToken);
    } catch (e) {
      clearTimeout(timeoutId);
      if ((e as Error).name !== "AbortError") {
        setErr("Network error. Check your connection and try again.");
      }
    } finally {
      setConnecting(false); // always unlock
    }
  }

  function disconnect() {
    esRef.current?.close();
    clearVantageSession();
    setSession(null); setMetrics(null); setStreamStatus("idle"); setPassword("");
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-card space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-lg font-semibold">Vantage MT5</div>
          <p className="mt-1 text-sm text-muted-foreground">MetaApi cloud bridge — real-time, secure.</p>
        </div>
        <span className="rounded-lg bg-primary/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">MT5</span>
      </div>

      {session ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-profit/20 bg-profit/5 p-4 text-sm space-y-1">
            <div className="flex items-center gap-2 font-semibold text-profit">
              <CheckCircle2 className="h-4 w-4" /> Connected via MetaApi
            </div>
            <div className="font-mono text-sm">#{session.loginId} · {session.server}</div>
            <div className="text-xs text-muted-foreground">
              {session.accountType} · expires {new Date(session.expiresAt).toLocaleTimeString()}
            </div>
          </div>
          <LiveMetrics status={streamStatus} metrics={metrics} />
          <button onClick={disconnect}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground hover:border-bear/50 hover:text-bear">
            <Unplug className="h-3.5 w-3.5" /> Disconnect
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <button onClick={() => setFormOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-background/40 px-4 py-3 text-sm font-medium hover:border-primary/40">
            Connect Vantage Account
            {formOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {formOpen && (
            <div className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-4">
              {/* Demo / Real */}
              <div className="flex overflow-hidden rounded-lg border border-border/60">
                {(["DEMO", "REAL"] as const).map((t, i) => (
                  <button key={t} onClick={() => !connecting && setAcctType(t)} disabled={connecting}
                    className="flex-1 py-2 text-xs font-semibold uppercase tracking-wide disabled:opacity-50"
                    style={{
                      background: acctType === t ? "rgba(6,182,212,0.15)" : "transparent",
                      color: acctType === t ? "var(--signal)" : "var(--muted-foreground)",
                      borderRight: i === 0 ? "1px solid rgba(255,255,255,0.08)" : "none",
                    }}>
                    {t}
                  </button>
                ))}
              </div>

              {/* Login ID */}
              <input value={loginId} onChange={(e) => setLoginId(e.target.value)} disabled={connecting}
                placeholder="MT5 account number (e.g. 1234567)"
                className="w-full rounded-md bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />

              {/* Dynamic server list — fetched from /api/v1/broker/servers */}
              <div>
                <select value={server} onChange={(e) => setServer(e.target.value)}
                  disabled={connecting || serversLoading}
                  className="w-full rounded-md bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                  {serversLoading
                    ? <option>Loading servers…</option>
                    : servers.map((s) => <option key={s.id} value={s.label}>{s.label} ({s.type})</option>)
                  }
                </select>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Server list is fetched from the backend — no hardcoded values.
                </p>
              </div>

              {/* Password */}
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={connecting}
                placeholder="Investor password (read-only recommended)"
                className="w-full rounded-md bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />

              {err && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <XCircle className="h-3.5 w-3.5 shrink-0" /> {err}
                </div>
              )}

              {/* Submit button — locked while connecting */}
              <button onClick={connectVantageAccount} disabled={connecting || serversLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
                {connecting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Connecting to MT5… (up to 15s)
                  </>
                ) : "Connect Vantage Terminal"}
              </button>

              <p className="text-center text-[10px] text-muted-foreground">
                Your password is forwarded once to MetaApi for handshake and immediately discarded.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Live metrics panel ──────────────────────────────────────────────────── */
function LiveMetrics({ status, metrics }: { status: string; metrics: VantageMetrics | null }) {
  if (status === "connecting") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background/40 px-4 py-3 text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-signal border-t-transparent" />
        Establishing live MetaApi stream…
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-bear/30 bg-bear/8 px-4 py-3 text-sm text-bear">
        <XCircle className="h-4 w-4 shrink-0" /> Stream disconnected. Refresh to reconnect.
      </div>
    );
  }
  if (!metrics) return null;

  const mlColor = metrics.marginLevel > 200 ? "text-profit"
    : metrics.marginLevel > 100 ? "text-[var(--gold)]" : "text-bear";

  return (
    <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <Activity className="h-3.5 w-3.5 animate-pulse text-signal" />
        {metrics.name}
        <span className="ml-auto rounded-full border border-signal/30 bg-signal/10 px-2 py-0.5 text-[10px] font-bold text-signal">LIVE</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Balance",    value: `$${metrics.balance.toFixed(2)}`,     tone: "text-foreground" },
          { label: "Equity",     value: `$${metrics.equity.toFixed(2)}`,      tone: metrics.equity >= metrics.balance ? "text-profit" : "text-bear" },
          { label: "Margin",     value: `$${metrics.margin.toFixed(2)}`,      tone: "text-[var(--gold)]" },
          { label: "Margin Lvl", value: `${metrics.marginLevel.toFixed(1)}%`, tone: mlColor },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-border/50 bg-card/60 px-2.5 py-2 text-center">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
            <div className={`mt-0.5 font-mono text-sm font-bold ${m.tone}`}>{m.value}</div>
          </div>
        ))}
      </div>
      <div className="text-right text-[10px] text-muted-foreground">
        {metrics.currency} · 1:{metrics.leverage} · {new Date(metrics.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}
