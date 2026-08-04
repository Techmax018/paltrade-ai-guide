/**
 * server/src/index.ts — PalTrade Backend Entry Point
 *
 * Serves:
 *   HTTP  — Express REST API (auth, broker connect, trade logs)
 *   WS    — Unified broker streaming engine (Vantage + Deriv)
 *
 * Deploy target: Render (persistent web service, not serverless)
 */
import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { WebSocketServer, WebSocket } from "ws";

import authRouter     from "./routes/auth";
import connectRouter  from "./routes/connect";
import tradeLogRouter from "./routes/tradeLogs";
import serversRouter  from "./routes/servers";
import { verifyToken } from "./lib/auth";
import { startVantageStream } from "./ws/vantageStream";
import { startDerivStream }   from "./ws/derivStream";
import { WsInitMessage, NormalisedFrame } from "./ws/types";
import { query, queryOne } from "./db/client";
import { runMigration } from "./db/migrate";

const app  = express();
const PORT = Number(process.env.PORT ?? 4000);

/* ─────────────────────── Security middleware ─────────────────────────────── */
app.use(helmet());
app.use(cors({
  origin: (process.env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.use(express.json({ limit: "64kb" }));

/* ─────────────────────── Rate limiting ──────────────────────────────────── */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Try again in 15 minutes." },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,   // stricter for auth endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many auth attempts. Try again in 15 minutes." },
});
app.use("/api/", limiter);
app.use("/api/v1/auth/", authLimiter);

/* ─────────────────────── Routes ─────────────────────────────────────────── */
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use("/api/v1/auth",          authRouter);
app.use("/api/v1/connect",       connectRouter);
app.use("/api/v1/trade-log",     tradeLogRouter);
app.use("/api/v1/broker",        serversRouter);

app.use((_req, res) => res.status(404).json({ ok: false, error: "Not found." }));

/* ─────────────────────── HTTP server ────────────────────────────────────── */
const server = http.createServer(app);

/* ─────────────────────── WebSocket server ───────────────────────────────── */
const wss = new WebSocketServer({ server, path: "/ws" });

function sendFrame(ws: WebSocket, frame: NormalisedFrame) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
}

wss.on("connection", (ws) => {
  let cleanup: (() => void) | null = null;
  let userId: string | null = null;

  // Each client must send an "init" message within 10 s or be disconnected
  const initTimeout = setTimeout(() => {
    if (!userId) ws.close(4001, "Init message not received within 10s");
  }, 10_000);

  ws.on("message", async (raw) => {
    let msg: WsInitMessage;
    try { msg = JSON.parse(raw.toString()); }
    catch {
      sendFrame(ws, { type: "error", broker: "DERIV", timestamp: Date.now(),
        payload: { message: "Invalid JSON message." } });
      return;
    }

    if (msg.action !== "init") return;

    clearTimeout(initTimeout);

    /* ── Authenticate JWT ──────────────────────────────────────────────── */
    let payload: { sub: string; email: string };
    try {
      payload = verifyToken(msg.token);
    } catch {
      ws.close(4003, "Invalid or expired token");
      return;
    }

    userId = payload.sub;
    const { linkedBrokerId } = msg;

    /* ── Determine broker type from DB ────────────────────────────────── */
    const broker = await queryOne<{ broker_type: string }>(
      `SELECT broker_type FROM linked_brokers
       WHERE id = $1 AND user_id = $2 AND is_active = TRUE`,
      [linkedBrokerId, userId],
    );

    if (!broker) {
      ws.close(4004, "Broker account not found");
      return;
    }

    /* ── Shared trade-close handler (writes to DB) ────────────────────── */
    async function handleTradeClosed(trade: Record<string, unknown>) {
      try {
        await query(
          `INSERT INTO trade_logs
             (user_id, broker_account_id, ticket_id, symbol, volume, side,
              entry_price, exit_price, profit_loss, commission, swap,
              opened_at, closed_at, source_broker, raw_payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (broker_account_id, ticket_id) DO NOTHING`,
          [
            userId,
            linkedBrokerId,
            trade.ticket_id,
            trade.symbol,
            trade.volume,
            trade.side,
            trade.entry_price,
            trade.exit_price ?? null,
            trade.profit_loss ?? null,
            trade.commission ?? 0,
            trade.swap ?? 0,
            trade.opened_at,
            trade.closed_at ?? null,
            trade.source_broker,
            trade.raw_payload ? JSON.stringify(trade.raw_payload) : null,
          ],
        );
        sendFrame(ws, {
          type: "trade_closed",
          broker: broker.broker_type as "VANTAGE_MT5" | "DERIV",
          timestamp: Date.now(),
          payload: trade,
        });
      } catch (err) {
        console.error("[ws] Failed to write trade log:", err);
      }
    }

    /* ── Start the appropriate broker stream ─────────────────────────── */
    try {
      if (broker.broker_type === "VANTAGE_MT5") {
        cleanup = await startVantageStream(ws, linkedBrokerId, userId, handleTradeClosed);
      } else if (broker.broker_type === "DERIV") {
        cleanup = await startDerivStream(ws, linkedBrokerId, userId, handleTradeClosed);
      } else {
        ws.close(4005, "Unsupported broker type");
      }
    } catch (err) {
      sendFrame(ws, {
        type: "error",
        broker: broker.broker_type as "VANTAGE_MT5" | "DERIV",
        timestamp: Date.now(),
        payload: { message: (err as Error).message },
      });
      ws.close();
    }
  });

  ws.on("close", () => { cleanup?.(); });
  ws.on("error", (err) => { console.error("[ws] Socket error:", err.message); cleanup?.(); });
});

/* ─────────────────────── Start ──────────────────────────────────────────── */
// Run schema migration on every startup — idempotent, safe to repeat
runMigration()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`[server] PalTrade backend running on :${PORT}`);
      console.log(`[server] Database: ${process.env.DATABASE_URL?.split("@")[1] ?? "connected"}`);
      console.log(`[server] Env: ${process.env.NODE_ENV}`);
    });
  })
  .catch((err) => {
    console.error("[server] Cannot start — migration failed:", err.message);
    process.exit(1);
  });
