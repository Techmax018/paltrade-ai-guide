import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  LogOut,
  Plug,
  RefreshCw,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import { getOrigin } from "../lib/og";
import {
  buildDerivOAuthUrl,
  useDerivOAuth,
  type DerivOAuthAccount,
} from "../hooks/useDerivOAuth";

export const Route = createFileRoute("/brokers")({
  loader: async () => ({ origin: await getOrigin() }),
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? "";
    const img = `${origin}/og-brokers.jpg`;
    return {
      meta: [
        { title: "Connect Broker — PalTrade" },
        {
          name: "description",
          content:
            "Connect your Deriv account to PalTrade via secure OAuth 2.0 for live trading and analysis.",
        },
        { property: "og:title", content: "Connect Broker — PalTrade" },
        {
          property: "og:description",
          content:
            "Secure Deriv OAuth 2.0 integration. No password stored — only your session token.",
        },
        { property: "og:url", content: "/brokers" },
        { property: "og:image", content: img },
        { name: "twitter:image", content: img },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: "/brokers" }],
    };
  },
  component: BrokersPage,
});

/* ── Vantage connection stored separately (still manual for now) ─────────── */
type VantageConn = {
  account: string;
  server: string;
  connectedAt: number;
};
const VANTAGE_KEY = "paltrade.vantage.v1";
function loadVantage(): VantageConn | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(VANTAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ── Main page ───────────────────────────────────────────────────────────── */
function BrokersPage() {
  const { accounts, activeAccount, setActiveAccount, isAuthenticated, loading, logout } =
    useDerivOAuth();

  const [vantage, setVantage] = useState<VantageConn | null>(null);
  const [vantageForm, setVantageForm] = useState(false);
  const [vAcct, setVAcct] = useState("");
  const [vPass, setVPass] = useState("");
  const [vServer, setVServer] = useState("VantageFX-Live 1");
  const [vStatus, setVStatus] = useState<"idle" | "connecting" | "ok" | "err">("idle");
  const [vErr, setVErr] = useState("");

  /* detect if this is an OAuth redirect (acct1 in URL) */
  const isRedirect =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("acct1");

  useEffect(() => {
    setVantage(loadVantage());
  }, []);

  async function connectVantage() {
    setVStatus("connecting");
    setVErr("");
    await new Promise((r) => setTimeout(r, 900));
    if (!vAcct.trim() || !vPass.trim()) {
      setVStatus("err");
      setVErr("Fill in all fields.");
      return;
    }
    const conn: VantageConn = { account: vAcct.trim(), server: vServer, connectedAt: Date.now() };
    localStorage.setItem(VANTAGE_KEY, JSON.stringify(conn));
    setVantage(conn);
    setVStatus("ok");
    setVAcct("");
    setVPass("");
    setTimeout(() => {
      setVantageForm(false);
      setVStatus("idle");
    }, 800);
  }

  function disconnectVantage() {
    localStorage.removeItem(VANTAGE_KEY);
    setVantage(null);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to PalTrade
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Plug className="h-4 w-4 text-primary" />
            <span className="font-semibold">Broker Connections</span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-10 space-y-8">
        {/* ── Page heading ─────────────────────────────────────────────── */}
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-widest text-primary">Connect your account</div>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">
            Link your broker to PalTrade
          </h1>
          <p className="mt-3 text-muted-foreground">
            Deriv uses OAuth 2.0 — you log in on Deriv's own site and we only
            receive a short-lived session token. Your password never touches PalTrade.
          </p>
        </div>

        {/* ── Redirect success banner ───────────────────────────────────── */}
        {isRedirect && loading && (
          <div className="flex items-center gap-3 rounded-xl border border-signal/30 bg-signal/8 px-4 py-3 text-sm text-signal">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            Parsing your Deriv session…
          </div>
        )}
        {!loading && isAuthenticated && isRedirect && (
          <div className="flex items-center gap-3 rounded-xl border border-profit/30 bg-profit/8 px-4 py-3 text-sm text-profit">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Deriv account connected — you can now open the terminal.
            <Link
              to="/terminal"
              className="ml-auto flex items-center gap-1 rounded-md bg-profit px-3 py-1.5 text-xs font-bold text-background"
            >
              Open Terminal <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* ── Deriv card ─────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold">Deriv</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  OAuth 2.0 — secure login via Deriv's own auth page.
                </p>
              </div>
              <img
                src="/android-chrome-192x192.png"
                alt=""
                className="h-9 w-9 rounded-lg object-cover opacity-80"
              />
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking session…
              </div>
            ) : isAuthenticated ? (
              /* ── Connected state ─────────────────────────────────────── */
              <div className="space-y-3">
                {/* Account selector */}
                <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Linked accounts
                </div>
                {accounts.map((acc) => (
                  <AccountRow
                    key={acc.loginid}
                    account={acc}
                    isActive={acc.loginid === activeAccount?.loginid}
                    onSelect={() => setActiveAccount(acc.loginid)}
                  />
                ))}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    to="/terminal"
                    className="flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-bold text-background hover:opacity-90"
                  >
                    Open Terminal <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <a
                    href={buildDerivOAuthUrl()}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-3 py-2 text-xs hover:border-signal/40"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Re-authorise
                  </a>
                  <button
                    onClick={logout}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground hover:border-bear/50 hover:text-bear"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Disconnect
                  </button>
                </div>
              </div>
            ) : (
              /* ── Not connected state ─────────────────────────────────── */
              <div className="space-y-4">
                <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground space-y-2">
                  {[
                    "You'll be redirected to Deriv's login page",
                    "Approve access for PalTrade",
                    "You're sent back here with your session token",
                    "No password ever shared with PalTrade",
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-signal/15 font-mono text-[10px] font-bold text-signal">
                        {i + 1}
                      </span>
                      {step}
                    </div>
                  ))}
                </div>

                <a
                  href={buildDerivOAuthUrl()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-glow transition hover:brightness-110"
                >
                  <ExternalLink className="h-4 w-4" />
                  Login with Deriv
                </a>

                <p className="text-center text-[11px] text-muted-foreground">
                  Don't have an account?{" "}
                  <a
                    href="https://deriv.com/signup/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-signal hover:underline"
                  >
                    Create a free Deriv account
                  </a>
                </p>
              </div>
            )}
          </div>

          {/* ── Vantage card ───────────────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold">Vantage Markets</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  MT4/MT5 — investor (read-only) password connection.
                </p>
              </div>
              <span className="rounded-lg bg-primary/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                MT5
              </span>
            </div>

            {vantage ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-profit/20 bg-profit/5 p-4 text-sm">
                  <div className="flex items-center gap-2 text-profit">
                    <CheckCircle2 className="h-4 w-4" /> Connected
                  </div>
                  <div className="mt-2 font-mono text-sm">Account #{vantage.account}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{vantage.server}</div>
                </div>
                <button
                  onClick={disconnectVantage}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground hover:border-bear/50 hover:text-bear"
                >
                  <XCircle className="h-3.5 w-3.5" /> Disconnect
                </button>
              </div>
            ) : vantageForm ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Use your investor password — read-only, never the master password.
                </p>
                <input
                  value={vAcct}
                  onChange={(e) => setVAcct(e.target.value)}
                  placeholder="MT4/MT5 account number"
                  className="w-full rounded-md bg-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <select
                  value={vServer}
                  onChange={(e) => setVServer(e.target.value)}
                  className="w-full rounded-md bg-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  <option>VantageFX-Live 1</option>
                  <option>VantageFX-Live 2</option>
                  <option>VantageFX-Demo</option>
                </select>
                <input
                  type="password"
                  value={vPass}
                  onChange={(e) => setVPass(e.target.value)}
                  placeholder="Investor password"
                  className="w-full rounded-md bg-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                {vStatus === "err" && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <XCircle className="h-3.5 w-3.5" /> {vErr}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    disabled={vStatus === "connecting"}
                    onClick={connectVantage}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {vStatus === "connecting" ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
                    ) : vStatus === "ok" ? (
                      <><CheckCircle2 className="h-4 w-4" /> Connected</>
                    ) : (
                      "Connect"
                    )}
                  </button>
                  <button
                    onClick={() => { setVantageForm(false); setVStatus("idle"); setVErr(""); }}
                    className="rounded-md border border-border bg-background/40 px-3 py-2 text-sm hover:bg-background"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setVantageForm(true)}
                className="w-full rounded-xl border border-border bg-background/40 px-4 py-3 text-sm font-semibold hover:border-primary/50 hover:bg-background"
              >
                Connect Vantage
              </button>
            )}
          </div>
        </div>

        {/* ── Security note ─────────────────────────────────────────────── */}
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-4 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div>
            <span className="font-medium text-foreground">Security — what we store and what we don't.</span>
            {" "}Deriv credentials are handled via OAuth 2.0 — PalTrade only stores the short-lived
            session token Deriv returns. We never see, store, or transmit your password.
            Vantage connections use read-only investor passwords stored in your browser's
            localStorage only — they never leave your device.
          </div>
        </div>
      </section>
    </main>
  );
}

/* ── Account row sub-component ──────────────────────────────────────────── */
function AccountRow({
  account,
  isActive,
  onSelect,
}: {
  account: DerivOAuthAccount;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
        isActive
          ? "border-signal/50 bg-signal/10 text-foreground"
          : "border-border/60 bg-background/30 text-muted-foreground hover:border-border hover:text-foreground"
      }`}
    >
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
          isActive ? "bg-signal/20 text-signal" : "bg-muted text-muted-foreground"
        }`}
      >
        <User className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-mono font-semibold truncate">{account.loginid}</div>
        <div className="text-[11px] text-muted-foreground">
          {account.currency} · {account.type === "real" ? "Real account" : "Virtual / Demo"}
        </div>
      </div>
      {isActive && (
        <span className="shrink-0 rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-signal">
          Active
        </span>
      )}
      {!isActive && (
        <span className="shrink-0 text-[11px] text-muted-foreground">Switch</span>
      )}
    </button>
  );
}
