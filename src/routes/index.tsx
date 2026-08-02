import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  BarChart2,
  Bot,
  ChevronRight,
  Cpu,
  DollarSign,
  Menu,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { getOrigin } from "../lib/og";

export const Route = createFileRoute("/")({
  loader: async () => ({ origin: await getOrigin() }),
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? "";
    const url = `${origin}/`;
    const img = `${origin}/og-home.jpg`;
    return {
      meta: [
        { title: "PalTrade — Autonomous Forex & Synthetic Trading Terminal" },
        {
          name: "description",
          content:
            "AI-powered autonomous trading. Auto-pilot engine scans live Deriv markets, detects BOS/CHoCH structure, and executes triple-position trades automatically.",
        },
        { property: "og:title", content: "PalTrade — Autonomous Trading Terminal" },
        { property: "og:description", content: "Auto-pilot AI engine, live Deriv execution, real-time market analysis." },
        { property: "og:url", content: url },
        { property: "og:image", content: img },
        { name: "twitter:image", content: img },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: Home,
});

/* ── Static market ticker data ─────────────────────────────────────── */
type Pair = { symbol: string; price: string; change: number };
const PAIRS: Pair[] = [
  { symbol: "XAU/USD",  price: "2358.10", change:  0.62 },
  { symbol: "EUR/USD",  price: "1.0872",  change:  0.24 },
  { symbol: "GBP/USD",  price: "1.2691",  change: -0.13 },
  { symbol: "USD/JPY",  price: "156.42",  change:  0.41 },
  { symbol: "VOL 100",  price: "1420.55", change:  1.14 },
  { symbol: "VOL 75",   price: "98450.2", change: -0.87 },
  { symbol: "BOOM1000", price: "9120.70", change:  0.33 },
  { symbol: "AUD/USD",  price: "0.6584",  change: -0.22 },
];

/* ── Feature cards ─────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: Bot,
    color: "text-signal",
    bg: "bg-signal/10 border-signal/20",
    title: "AI Auto-Pilot Engine",
    desc: "Scans live candles every 30 s, scores EMA trend, RSI momentum, BOS/CHoCH market structure and Fibonacci golden zone. Fires trades automatically when all rules align.",
  },
  {
    icon: Zap,
    color: "text-profit",
    bg: "bg-profit/10 border-profit/20",
    title: "1-Click & Auto Execution",
    desc: "2-step Deriv proposal→buy flow with execution latency tracking. Triple-trade mode splits one signal into 3 scaled positions targeting TP1, TP2 and TP3 automatically.",
  },
  {
    icon: Activity,
    color: "text-[var(--gold)]",
    bg: "bg-[var(--gold)]/10 border-[var(--gold)]/20",
    title: "Live Market Structure",
    desc: "Real-time BOS / CHoCH detection, RSI divergence, Fair Value Gap scanning and Fibonacci retracement levels drawn directly on the interactive chart.",
  },
  {
    icon: Shield,
    color: "text-bear",
    bg: "bg-bear/10 border-bear/20",
    title: "Risk & Drawdown Control",
    desc: "Configurable minimum confidence threshold, max daily drawdown limit, position cap, and trading time windows. The engine hard-stops if your drawdown ceiling is hit.",
  },
  {
    icon: BarChart2,
    color: "text-signal",
    bg: "bg-signal/10 border-signal/20",
    title: "Autonomous Audit Log",
    desc: "Every decision is logged: signal confidence, gate results, execution latency and outcome. Full traceability so you know exactly why the engine fired — or didn't.",
  },
  {
    icon: Cpu,
    color: "text-profit",
    bg: "bg-profit/10 border-profit/20",
    title: "Strategy Backtesting",
    desc: "Replay your strategy rules against historical candles. Get win rate, max drawdown, Sharpe ratio and equity curve — before you risk a single dollar live.",
  },
];

type ChatMsg = { role: "user" | "assistant"; content: string };

/* ── Root page component ──────────────────────────────────────────── */
function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Nav />
      <Ticker />
      <Hero />
      <Features />
      <HowItWorks />
      <AIAssistant />
      <Footer />
    </div>
  );
}

/* ── Navigation with hamburger menu ──────────────────────────────── */
function Nav() {
  const [open, setOpen] = useState(false);

  const links = [
    { label: "Terminal", href: "/terminal", isRoute: true },
    { label: "Backtest", href: "/backtest", isRoute: true },
    { label: "Brokers",  href: "/brokers",  isRoute: true },
    { label: "Calc",     href: "/calculator", isRoute: true },
    { label: "Features", href: "#features",  isRoute: false },
    { label: "AI Chat",  href: "#ai",        isRoute: false },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Logo */}
        <a href="#top" className="flex items-center gap-2">
          <img src="/android-chrome-192x192.png" alt="PalTrade" className="h-8 w-8 rounded-lg object-cover" />
          <span className="text-base font-bold tracking-tight">
            Pal<span className="text-primary">Trade</span>
          </span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) =>
            l.isRoute ? (
              <Link key={l.label} to={l.href as never}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground">
                {l.label}
              </Link>
            ) : (
              <a key={l.label} href={l.href}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground">
                {l.label}
              </a>
            )
          )}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-2 md:flex">
          <Link to="/terminal"
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110">
            <Zap className="h-3.5 w-3.5" /> Launch Terminal
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-border/60 bg-background/95 px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((l) =>
              l.isRoute ? (
                <Link key={l.label} to={l.href as never}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                  <ChevronRight className="h-3.5 w-3.5 text-signal" />
                  {l.label}
                </Link>
              ) : (
                <a key={l.label} href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                  <ChevronRight className="h-3.5 w-3.5 text-signal" />
                  {l.label}
                </a>
              )
            )}
            <Link to="/terminal" onClick={() => setOpen(false)}
              className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-glow">
              <Zap className="h-4 w-4" /> Launch Terminal
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

/* ── Scrolling ticker ─────────────────────────────────────────────── */
function Ticker() {
  const items = [...PAIRS, ...PAIRS];
  return (
    <div className="overflow-hidden border-b border-border/60 bg-card/40 py-2.5">
      <div className="flex w-max animate-ticker gap-8 whitespace-nowrap font-mono text-xs">
        {items.map((p, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{p.symbol}</span>
            <span className="text-foreground font-semibold">{p.price}</span>
            <span className={p.change >= 0 ? "text-bull" : "text-bear"}>
              {p.change >= 0 ? "▲" : "▼"} {Math.abs(p.change).toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section id="top" className="bg-hero border-b border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal/10 px-3 py-1 text-xs font-medium text-signal">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-signal" />
            Live Deriv WebSocket · Real-time execution
          </div>

          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Let AI trade for you —{" "}
            <span className="text-primary">autonomously.</span>
          </h1>

          <p className="mt-5 text-lg text-muted-foreground md:text-xl">
            PalTrade's Auto-Pilot engine scans live markets, detects high-confidence
            confluences, and executes Deriv positions automatically — with full risk control
            and a real-time audit trail.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/terminal"
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-glow transition hover:brightness-110">
              <Zap className="h-4 w-4" /> Open Trading Terminal
            </Link>
            <a href="#features"
              className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-6 py-3 text-sm font-semibold transition hover:bg-card">
              How it works <ChevronRight className="h-4 w-4" />
            </a>
          </div>

          {/* Stats row */}
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { value: "7",     label: "Confluence gates" },
              { value: "2-step", label: "Deriv execution" },
              { value: "3×",    label: "Triple-trade mode" },
              { value: "24/7",  label: "Auto-pilot scan" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-card/60 p-4 text-center shadow-card">
                <div className="font-mono text-2xl font-bold text-primary">{s.value}</div>
                <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Features grid ────────────────────────────────────────────────── */
function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-16 md:py-20">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
          <Sparkles className="h-4 w-4" /> Platform capabilities
        </div>
        <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
          Built to trade. Not just analyse.
        </h2>
        <p className="mt-3 text-muted-foreground">
          Every feature is designed around one goal — removing friction between
          a confirmed signal and a live executed position.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <article
              key={f.title}
              className={`group rounded-2xl border p-6 shadow-card transition hover:-translate-y-0.5 ${f.bg}`}
            >
              <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border ${f.bg}`}>
                <Icon className={`h-5 w-5 ${f.color}`} />
              </div>
              <h3 className="text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ── How it works ─────────────────────────────────────────────────── */
function HowItWorks() {
  const steps = [
    {
      n: "01",
      icon: Activity,
      title: "Connect to Deriv",
      desc: "Enter your Deriv App ID and token in API Settings. The terminal connects via WebSocket and streams live tick data immediately.",
    },
    {
      n: "02",
      icon: Bot,
      title: "Configure Auto-Pilot",
      desc: "Set your minimum confidence threshold, max drawdown, position cap, trading windows and allowed symbols. The engine respects every limit.",
    },
    {
      n: "03",
      icon: Zap,
      title: "Activate & Walk Away",
      desc: "Flip the Auto-Pilot switch. The engine scans every 30 s, detects confluence, logs every decision, and executes when all 7 gates pass.",
    },
    {
      n: "04",
      icon: DollarSign,
      title: "Monitor the Audit Log",
      desc: "Every signal is recorded with gate results, execution latency, contract ID and live P&L — win, loss or skipped. Full transparency.",
    },
  ];

  return (
    <section className="border-y border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
            <Cpu className="h-4 w-4" /> How it works
          </div>
          <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
            Four steps to autonomous execution
          </h2>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.n} className="relative rounded-2xl border border-border bg-card p-6 shadow-card">
                <div className="mb-4 flex items-center gap-3">
                  <span className="font-mono text-3xl font-bold text-primary/30">{s.n}</span>
                  <Icon className="h-5 w-5 text-signal" />
                </div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link to="/terminal"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3 text-sm font-bold text-primary-foreground shadow-glow transition hover:brightness-110">
            <Zap className="h-4 w-4" /> Start Trading Now
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── AI Assistant chat ────────────────────────────────────────────── */
function AIAssistant() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Hey — I'm the PalTrade AI assistant. Ask me about the auto-pilot engine, confluence rules, risk settings, or anything about the platform.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { reply: string };
      setMessages((m) => [...m, { role: "assistant", content: data.reply || "…" }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Assistant temporarily unavailable. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "How does the auto-pilot confluence engine work?",
    "What is BOS and CHoCH in market structure?",
    "How do I set up risk limits for auto-trading?",
    "Explain the triple-trade execution mode",
  ];

  return (
    <section id="ai" className="mx-auto max-w-6xl px-4 py-16 md:py-20">
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
          <Sparkles className="h-4 w-4" /> AI Assistant
        </div>
        <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
          Ask anything about the platform
        </h2>
        <p className="mt-3 text-muted-foreground">
          Questions about auto-pilot rules, risk settings, Deriv integration, or execution logic.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Chat window */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3 text-sm">
            <span className="h-2 w-2 animate-pulse-glow rounded-full bg-accent" />
            <span className="font-medium">PalTrade AI</span>
            <span className="text-muted-foreground">· online</span>
          </div>

          <div ref={scrollRef} className="no-scrollbar h-80 space-y-4 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-signal" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-signal" style={{ animationDelay: "0.15s" }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-signal" style={{ animationDelay: "0.3s" }} />
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-center gap-2 border-t border-border/60 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about auto-pilot, risk settings, execution…"
              aria-label="Chat with PalTrade AI"
              className="flex-1 rounded-lg bg-input px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
            <button type="submit" disabled={loading || !input.trim()}
              aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-glow transition disabled:opacity-50">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>

        {/* Suggestions + disclaimer */}
        <aside className="space-y-3">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Try asking</div>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)}
                  className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-left text-xs leading-snug transition hover:border-primary/50 hover:bg-background">
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground shadow-card">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <ShieldCheck className="h-4 w-4 text-accent" />
              <span className="font-medium">Risk disclaimer</span>
            </div>
            Trading forex and synthetic indices involves substantial risk of loss. PalTrade does not provide financial advice. Use auto-pilot at your own risk.
          </div>
        </aside>
      </div>
    </section>
  );
}

/* ── Footer ───────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="border-t border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/android-chrome-192x192.png" alt="PalTrade" className="h-6 w-6 rounded object-cover" />
            <span className="text-sm font-semibold">
              Pal<span className="text-primary">Trade</span>
            </span>
            <span className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} — Autonomous trading. Not financial advice.
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/terminal" className="hover:text-foreground">Terminal</Link>
            <Link to="/backtest" className="hover:text-foreground">Backtest</Link>
            <Link to="/brokers" className="hover:text-foreground">Brokers</Link>
            <Link to="/calculator" className="hover:text-foreground">Calculator</Link>
          </div>
        </div>

        {/* Install prompt hint */}
        <div className="mt-6 rounded-xl border border-signal/20 bg-signal/5 px-4 py-3 text-center text-xs text-muted-foreground">
          <span className="font-medium text-signal">📱 Install as app</span>
          {" — "}
          On iOS: tap <span className="text-foreground">Share → Add to Home Screen</span>.
          On Android: tap <span className="text-foreground">⋮ → Add to Home Screen</span>.
          PalTrade runs as a full-screen native-style app with no browser chrome.
        </div>
      </div>
    </footer>
  );
}
