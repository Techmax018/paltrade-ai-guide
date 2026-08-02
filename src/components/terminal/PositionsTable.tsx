import { AlertOctagon, CheckCircle2, History, X, XCircle } from "lucide-react";
import type { DerivSymbol } from "@/lib/derivApi";

export interface Position {
  id: string;
  symbol: string;
  symbolLabel: string;
  side: "BUY" | "SELL";
  lots: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  label: string;
  openedAt: number;
  pipSize: number;
  pipValuePerLot: number;
}

export interface ClosedTrade extends Position {
  exit: number;
  pnl: number;
  closedAt: number;
}

export function pnlOf(p: Position, price: number) {
  const dir = p.side === "BUY" ? 1 : -1;
  const pips = ((price - p.entry) / p.pipSize) * dir;
  return pips * p.pipValuePerLot * p.lots;
}

export function PositionsTable({
  positions,
  history,
  prices,
  symbol,
  onClose,
  onCloseAll,
}: {
  positions: Position[];
  history: ClosedTrade[];
  prices: Record<string, number>;
  symbol: DerivSymbol;
  onClose: (id: string) => void;
  onCloseAll: () => void;
}) {
  const decimals = symbol.pipSize < 0.001 ? 5 : symbol.pipSize < 0.1 ? 3 : 2;
  const totalPnl = positions.reduce((a, p) => a + pnlOf(p, prices[p.symbol] ?? p.entry), 0);
  const wins = history.filter((h) => h.pnl > 0).length;
  const winRate = history.length ? (wins / history.length) * 100 : 0;
  const netProfit = history.reduce((a, h) => a + h.pnl, 0);

  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 shadow-card backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Active Positions ({positions.length})</h2>
        <div className="flex items-center gap-3">
          <span className={`font-mono text-sm ${totalPnl >= 0 ? "text-profit" : "text-bear"}`}>
            Floating P&L ${totalPnl.toFixed(2)}
          </span>
          <button
            onClick={onCloseAll}
            disabled={!positions.length}
            className="inline-flex items-center gap-1.5 rounded-md bg-bear px-3 py-1.5 text-xs font-bold text-background disabled:opacity-40"
          >
            <AlertOctagon className="h-3.5 w-3.5" /> Close All
          </button>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-2">Symbol</th>
              <th>Side</th>
              <th>Lots</th>
              <th>Entry</th>
              <th>Current</th>
              <th>SL</th>
              <th>TP</th>
              <th>P&L</th>
              <th />
            </tr>
          </thead>
          <tbody className="font-mono">
            {positions.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center font-sans text-muted-foreground">
                  No open positions. Execute a trade from the strategy panel.
                </td>
              </tr>
            )}
            {positions.map((p) => {
              const cur = prices[p.symbol] ?? p.entry;
              const pnl = pnlOf(p, cur);
              return (
                <tr key={p.id} className="border-t border-border/50">
                  <td className="py-2">
                    {p.symbolLabel}
                    <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">{p.label}</span>
                  </td>
                  <td className={p.side === "BUY" ? "text-profit" : "text-bear"}>{p.side}</td>
                  <td>{p.lots.toFixed(2)}</td>
                  <td>{p.entry.toFixed(decimals)}</td>
                  <td>{cur.toFixed(decimals)}</td>
                  <td className="text-bear">{p.stopLoss.toFixed(decimals)}</td>
                  <td className="text-profit">{p.takeProfit.toFixed(decimals)}</td>
                  <td className={pnl >= 0 ? "text-profit" : "text-bear"}>${pnl.toFixed(2)}</td>
                  <td>
                    <button onClick={() => onClose(p.id)} aria-label="Close position" className="rounded p-1 text-muted-foreground hover:text-bear">
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 border-t border-border/60 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-signal" /> Trade History
          </h3>
          <div className="flex gap-4 text-xs">
            <span className="text-muted-foreground">Trades <b className="font-mono text-foreground">{history.length}</b></span>
            <span className="text-muted-foreground">Win rate <b className="font-mono text-signal">{winRate.toFixed(1)}%</b></span>
            <span className="text-muted-foreground">
              Net <b className={`font-mono ${netProfit >= 0 ? "text-profit" : "text-bear"}`}>${netProfit.toFixed(2)}</b>
            </span>
          </div>
        </div>
        <div className="mt-2 max-h-52 overflow-y-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-1.5">Status</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Lots</th>
                <th>Entry → Exit</th>
                <th>P&L</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {history.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center font-sans text-muted-foreground">No closed trades yet.</td>
                </tr>
              )}
              {history.map((h) => (
                <tr key={h.id} className="border-t border-border/40">
                  <td className="py-2 pr-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="inline-flex w-fit items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                        CLOSED
                      </span>
                      {h.pnl >= 0
                        ? <span className="inline-flex w-fit items-center gap-1 rounded-md border border-profit/30 bg-profit/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-profit">
                            <CheckCircle2 className="h-2.5 w-2.5" /> WIN
                          </span>
                        : <span className="inline-flex w-fit items-center gap-1 rounded-md border border-bear/30 bg-bear/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-bear">
                            <XCircle className="h-2.5 w-2.5" /> LOSS
                          </span>}
                    </div>
                  </td>
                  <td className="py-2">{h.symbolLabel}</td>
                  <td className={h.side === "BUY" ? "text-profit" : "text-bear"}>{h.side}</td>
                  <td>{h.lots.toFixed(2)}</td>
                  <td>{h.entry.toFixed(decimals)} → {h.exit.toFixed(decimals)}</td>
                  <td className={h.pnl >= 0 ? "text-profit" : "text-bear"}>${h.pnl.toFixed(2)}</td>
                  <td className="font-sans text-muted-foreground">{new Date(h.closedAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
