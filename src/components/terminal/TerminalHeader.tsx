import { Link } from "@tanstack/react-router";
import {
  Activity,
  Bot,
  RefreshCw,
  Settings,
  Settings2,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { AccountInfo, ConnectionStatus } from "@/lib/derivApi";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
  error: "Connection error",
};

export function TerminalHeader({
  status,
  account,
  autoPilot,
  onOpenSettings,
  onToggleAutoPilot,
  onOpenAutoPilotConfig,
}: {
  status: ConnectionStatus;
  account: AccountInfo | null;
  autoPilot: boolean;
  onOpenSettings: () => void;
  onToggleAutoPilot: (v: boolean) => void;
  onOpenAutoPilotConfig: () => void;
}) {
  const tone =
    status === "connected" ? "text-profit"
    : status === "disconnected" || status === "error" ? "text-bear"
    : "text-signal";
  const ConnIcon =
    status === "connected" ? Wifi
    : status === "disconnected" || status === "error" ? WifiOff
    : RefreshCw;

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-card/50 backdrop-blur-xl">
      {/* ── Row 1: logo · connection · auto-pilot · actions ── */}
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 overflow-x-auto px-3 py-2 sm:gap-3 sm:px-4 sm:py-3 no-scrollbar">

        {/* Logo */}
        <Link to="/" className="flex shrink-0 items-center gap-1.5">
          <img
            src="/android-chrome-192x192.png"
            alt="PalTrade"
            className="h-7 w-7 rounded-lg object-cover sm:h-8 sm:w-8"
          />
          <span className="text-sm font-bold tracking-tight whitespace-nowrap">
            Pal<span className="text-signal">Trade</span>
          </span>
          <span className="hidden sm:inline rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Terminal
          </span>
        </Link>

        {/* Connection */}
        <div className={`flex shrink-0 items-center gap-1 rounded-full border border-border bg-background/50 px-2 py-1 text-[11px] sm:px-3 sm:text-xs ${tone}`}>
          <ConnIcon className={`h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5 ${status === "connecting" || status === "reconnecting" ? "animate-spin" : ""}`} />
          <span className="hidden xs:inline">{STATUS_LABEL[status]}</span>
        </div>

        {/* Auto-Pilot */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-all sm:gap-1.5 sm:px-3 sm:text-[11px] ${
            autoPilot
              ? "animate-autopilot-pulse border-profit/50 bg-profit/10 text-profit"
              : "border-border bg-background/50 text-muted-foreground"
          }`}>
            <Bot className={`h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5 ${autoPilot ? "animate-pulse" : ""}`} />
            <span className="hidden md:inline">{autoPilot ? "AUTO-TRADING ACTIVE" : "STANDBY"}</span>
          </span>
          {/* Toggle */}
          <button
            role="switch"
            aria-checked={autoPilot}
            aria-label="Toggle Auto-Pilot"
            onClick={() => onToggleAutoPilot(!autoPilot)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 transition-colors sm:h-6 sm:w-11 ${
              autoPilot ? "border-profit bg-profit" : "border-border bg-muted"
            }`}
          >
            <span className={`block h-3 w-3 rounded-full bg-background shadow-sm transition-transform sm:h-4 sm:w-4 ${
              autoPilot ? "translate-x-4 sm:translate-x-5" : "translate-x-0.5"
            }`} />
          </button>
          {/* Config cog */}
          <button
            onClick={onOpenAutoPilotConfig}
            aria-label="Configure Auto-Pilot"
            className={`rounded-md border p-1.5 transition-colors ${
              autoPilot ? "border-signal/40 bg-signal/10 text-signal" : "border-border text-muted-foreground hover:text-signal"
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Account — right-aligned, hides on small screens */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {account && (
            <>
              <Stat label="Bal" value={`$${account.balance.toFixed(0)}`} className="hidden sm:flex" />
              <Stat label="Eq" value={`$${account.equity.toFixed(0)}`} accent className="hidden md:flex" />
            </>
          )}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1.5 text-[11px] font-medium hover:border-signal/50 hover:text-signal sm:px-3"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>

      {/* ── Sub-bar ── */}
      <div className="flex items-center gap-1 border-t border-border/40 px-4 py-1 text-[10px] text-muted-foreground sm:text-[11px]">
        <Activity className="h-3 w-3 shrink-0 text-signal" />
        <span className="truncate">Deriv WebSocket · Forex & Synthetics</span>
        {autoPilot && (
          <span className="ml-auto flex shrink-0 items-center gap-1 text-profit">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-profit" />
            <span className="hidden sm:inline">Engine scanning…</span>
          </span>
        )}
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  accent,
  className = "",
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-border bg-background/40 px-2 py-1 sm:px-3 ${className}`}>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground sm:text-[10px]">{label}</div>
      <div className={`font-mono text-[11px] sm:text-xs ${accent ? "text-profit" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
