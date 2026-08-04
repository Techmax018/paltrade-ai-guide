/**
 * server/src/ws/derivStream.ts
 *
 * Opens a native wss://ws.derivws.com connection for a linked Deriv account.
 * Retrieves and decrypts the stored OAuth token from linked_brokers —
 * the user NEVER re-enters credentials after the initial OAuth flow.
 *
 * Protocol:
 *  1. authorize  → exchange token for session
 *  2. balance    → subscribe to real-time balance updates
 *  3. proposal_open_contract → stream live P&L for open positions
 */
import WebSocket from "ws";
import { query } from "../db/client";
import { decrypt } from "../lib/auth";
import { NormalisedFrame, AccountUpdate } from "./types";

const DERIV_WS = "wss://ws.derivws.com/websockets/v3";
const DERIV_APP_ID = process.env.VITE_DERIV_APP_ID ?? "1089";

function sendToClient(clientWs: WebSocket, frame: NormalisedFrame) {
  if (clientWs.readyState === WebSocket.OPEN) {
    clientWs.send(JSON.stringify(frame));
  }
}

export async function startDerivStream(
  clientWs: WebSocket,
  linkedBrokerId: string,
  userId: string,
  onTradeClosed: (trade: Record<string, unknown>) => void,
): Promise<() => void> {

  /* ── 1. Fetch + decrypt the Deriv token from DB ──────────────────────── */
  const rows = await query<{
    broker_account_id: string;
    oauth_access_token: string;
    account_type: string;
  }>(
    `SELECT broker_account_id, oauth_access_token, account_type
     FROM linked_brokers
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE
       AND broker_type = 'DERIV'`,
    [linkedBrokerId, userId],
  );

  if (!rows.length || !rows[0].oauth_access_token) {
    throw new Error("Deriv account not found or not active.");
  }

  let derivToken: string;
  try {
    derivToken = decrypt(rows[0].oauth_access_token);
  } catch {
    throw new Error("Failed to decrypt Deriv token. Re-connect your account.");
  }

  /* ── 2. Open Deriv WebSocket ─────────────────────────────────────────── */
  const derivWs = new WebSocket(`${DERIV_WS}?app_id=${DERIV_APP_ID}`);
  let reqId = 1;

  function sendDeriv(payload: Record<string, unknown>) {
    if (derivWs.readyState === WebSocket.OPEN) {
      derivWs.send(JSON.stringify({ ...payload, req_id: reqId++ }));
    }
  }

  let currentBalance = 0;
  let currentCurrency = "USD";

  derivWs.on("open", () => {
    // Step 1: Authorise with stored token
    sendDeriv({ authorize: derivToken });
  });

  derivWs.on("message", (raw) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw.toString()); }
    catch { return; }

    const msgType = msg.msg_type as string;

    if (msgType === "authorize") {
      const auth = msg.authorize as Record<string, unknown>;
      currentCurrency = (auth.currency as string) ?? "USD";
      currentBalance  = (auth.balance as number) ?? 0;

      sendToClient(clientWs, {
        type: "connected",
        broker: "DERIV",
        timestamp: Date.now(),
        payload: {
          loginId:     auth.loginid,
          currency:    currentCurrency,
          accountType: rows[0].account_type,
        },
      });

      // Step 2: Subscribe to real-time balance updates
      sendDeriv({ balance: 1, subscribe: 1 });
      // Step 3: Subscribe to open contracts for P&L
      sendDeriv({ proposal_open_contract: 1, subscribe: 1 });
    }

    if (msgType === "balance") {
      const b = msg.balance as Record<string, unknown>;
      currentBalance = b.balance as number;

      // Deriv balance API doesn't expose equity/margin directly —
      // synthesise a normalised frame with available data
      const update: AccountUpdate = {
        balance:     currentBalance,
        equity:      currentBalance, // refined by open contracts below
        margin:      0,
        freeMargin:  currentBalance,
        marginLevel: 100,
        currency:    currentCurrency,
        leverage:    (b.loginid as string)?.startsWith("VR") ? 500 : 200,
      };

      sendToClient(clientWs, {
        type: "account_update",
        broker: "DERIV",
        timestamp: Date.now(),
        payload: update,
      });
    }

    if (msgType === "proposal_open_contract") {
      const poc = msg.proposal_open_contract as Record<string, unknown>;

      sendToClient(clientWs, {
        type: "position_update",
        broker: "DERIV",
        timestamp: Date.now(),
        payload: {
          contractId:  poc.contract_id,
          symbol:      poc.underlying,
          profit:      poc.profit,
          entrySpot:   poc.entry_spot,
          currentSpot: poc.current_spot,
          status:      poc.status,
        },
      });

      // If the contract is sold/won/lost → log closed trade
      const status = poc.status as string;
      if (status === "sold" || status === "won" || status === "lost") {
        const side = (poc.contract_type as string)?.includes("CALL") ? "BUY" : "SELL";
        onTradeClosed({
          ticket_id:    String(poc.contract_id),
          symbol:       poc.underlying,
          volume:       poc.buy_price,
          side,
          entry_price:  poc.entry_spot ?? 0,
          exit_price:   poc.exit_spot ?? poc.current_spot ?? 0,
          profit_loss:  poc.profit,
          opened_at:    new Date((poc.date_start as number) * 1000).toISOString(),
          closed_at:    new Date((poc.date_expiry as number) * 1000).toISOString(),
          source_broker: "DERIV",
          raw_payload:  poc,
        });
      }
    }

    if (msg.error) {
      sendToClient(clientWs, {
        type: "error",
        broker: "DERIV",
        timestamp: Date.now(),
        payload: { message: (msg.error as Record<string,unknown>).message ?? "Deriv error" },
      });
    }
  });

  derivWs.on("error", (err) => {
    sendToClient(clientWs, {
      type: "error",
      broker: "DERIV",
      timestamp: Date.now(),
      payload: { message: "Deriv WebSocket error", detail: err.message },
    });
  });

  derivWs.on("close", () => {
    sendToClient(clientWs, {
      type: "error",
      broker: "DERIV",
      timestamp: Date.now(),
      payload: { message: "Deriv connection closed." },
    });
  });

  /* ── Cleanup ──────────────────────────────────────────────────────────── */
  return () => {
    derivWs.close();
  };
}
