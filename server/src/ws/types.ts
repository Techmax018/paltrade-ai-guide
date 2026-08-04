/**
 * Normalised message frame sent to the frontend regardless of broker source.
 * Both VANTAGE_MT5 and DERIV produce identical shapes here — the frontend
 * never needs to know which broker is behind the numbers.
 */
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
  timestamp: number;         // epoch ms
  payload: Record<string, unknown>;
}

export interface AccountUpdate {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  currency: string;
  leverage: number;
}

export interface WsInitMessage {
  action: "init";
  linkedBrokerId: string;  // UUID from linked_brokers table
  token: string;           // PalTrade JWT
}
