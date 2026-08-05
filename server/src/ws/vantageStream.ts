/**
 * server/src/ws/vantageStream.ts
 *
 * Opens a MetaApi RPC connection to a provisioned MT5 account and
 * streams live account metrics + trade events to the client WebSocket.
 *
 * Uses the MetaApi Node.js SDK:
 *   https://github.com/metaapi/metaapi-node.js-sdk
 *
 * The metaAccountId (bridge_reference_id) is retrieved from the
 * linked_brokers table — the user NEVER re-enters their MT5 password.
 */
import MetaApi from "metaapi.cloud-sdk";
import { WebSocket } from "ws";
import { query } from "../db/client";
import { NormalisedFrame, AccountUpdate } from "./types";

function send(ws: WebSocket, frame: NormalisedFrame) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(frame));
  }
}

export async function startVantageStream(
  ws: WebSocket,
  linkedBrokerId: string,
  userId: string,
  onTradeClosed: (trade: Record<string, unknown>) => void,
): Promise<() => void> {
  const metaToken = process.env.METAAPI_TOKEN;
  if (!metaToken) throw new Error("METAAPI_TOKEN not configured");

  /* ── 1. Fetch bridge_reference_id from DB ────────────────────────────── */
  const rows = await query<{
    bridge_reference_id: string;
    broker_account_id: string;
    server_name: string;
    account_type: string;
  }>(
    `SELECT bridge_reference_id, broker_account_id, server_name, account_type
     FROM linked_brokers
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE
       AND broker_type = 'VANTAGE_MT5'`,
    [linkedBrokerId, userId],
  );

  if (!rows.length || !rows[0].bridge_reference_id) {
    throw new Error("Vantage account not found or not active.");
  }

  const { bridge_reference_id: metaAccountId } = rows[0];

  /* ── 2. Connect via MetaApi SDK ──────────────────────────────────────── */
  const api = new MetaApi(metaToken);
  const account = await api.metatraderAccountApi.getAccount(metaAccountId);

  if (account.state !== "DEPLOYED") {
    await account.deploy();
    await account.waitDeployed(60);
  }

  const connection = account.getRPCConnection();
  await connection.connect();
  await connection.waitSynchronized({ timeoutInSeconds: 60 });

  send(ws, {
    type: "connected",
    broker: "VANTAGE_MT5",
    timestamp: Date.now(),
    payload: {
      message: "MetaApi connection established",
      metaAccountId,
      loginId: rows[0].broker_account_id,
      server: rows[0].server_name,
    },
  });

  /* ── 3. Throttled account polling (3–5 s jitter, backoff, WAF halt) ─── */
  const stopPolling = startPollingLoop<AccountUpdate>({
    fetcher: async () => {
      const info = await connection.getAccountInformation();
      return {
        balance:     info.balance,
        equity:      info.equity,
        margin:      info.margin,
        freeMargin:  info.freeMargin,
        marginLevel: info.marginLevel ?? 0,
        currency:    info.currency,
        leverage:    info.leverage,
      };
    },
    onData: (update) => {
      send(ws, {
        type: "account_update",
        broker: "VANTAGE_MT5",
        timestamp: Date.now(),
        payload: update,
      });
    },
    onWafHalt: (verdict) => {
      // Fail-safe posture: stop polling entirely and tell the UI to renew IP.
      send(ws, {
        type: "error",
        broker: "VANTAGE_MT5",
        timestamp: Date.now(),
        payload: {
          message: verdict.clientMessage,
          action: "SWITCH_NETWORK_RENEW_IP",
          status: verdict.status,
          rayId: verdict.rayId ?? null,
        },
      });
    },
    onTransientError: (message) => {
      send(ws, {
        type: "error",
        broker: "VANTAGE_MT5",
        timestamp: Date.now(),
        payload: { message: "Failed to fetch account info", detail: message },
      });
    },
  });


  /* ── 4. Listen for position / deal events ────────────────────────────── */
  connection.addSynchronizationListener({
    onDealAdded: (_instanceIndex: string, deal: Record<string, unknown>) => {
      // Fire on every closed deal
      if (deal.type === "DEAL_TYPE_SELL" || deal.type === "DEAL_TYPE_BUY") {
        onTradeClosed({
          ticket_id:    deal.id,
          symbol:       deal.symbol,
          volume:       deal.volume,
          side:         deal.type === "DEAL_TYPE_BUY" ? "BUY" : "SELL",
          entry_price:  deal.price,
          profit_loss:  deal.profit,
          commission:   deal.commission ?? 0,
          swap:         deal.swap ?? 0,
          opened_at:    deal.time,
          closed_at:    deal.time,
          source_broker: "VANTAGE_MT5",
          raw_payload:  deal,
        });
      }
    },
  } as Parameters<typeof connection.addSynchronizationListener>[0]);

  /* ── 5. Cleanup function ──────────────────────────────────────────────── */
  return () => {
    clearInterval(interval);
    connection.close();
  };
}
