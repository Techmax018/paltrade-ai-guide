/**
 * POST /api/v1/trade-log   — write a closed trade (called by WS engine)
 * GET  /api/v1/trade-log   — fetch user's trade history
 */
import { Router, Request, Response } from "express";
import { query } from "../db/client";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();
router.use(requireAuth);

/* ── Write a single closed trade ────────────────────────────────────────── */
router.post("/", async (req: Request, res: Response) => {
  const userId = res.locals.user.sub as string;
  const {
    broker_account_id, ticket_id, symbol, volume, side,
    entry_price, exit_price, profit_loss, commission = 0, swap = 0,
    opened_at, closed_at, source_broker, raw_payload,
  } = req.body;

  if (!broker_account_id || !ticket_id || !symbol || !volume || !side ||
      !entry_price || !source_broker || !opened_at) {
    res.status(422).json({ ok: false, error: "Missing required trade fields." });
    return;
  }

  await query(
    `INSERT INTO trade_logs
       (user_id, broker_account_id, ticket_id, symbol, volume, side,
        entry_price, exit_price, profit_loss, commission, swap,
        opened_at, closed_at, source_broker, raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (broker_account_id, ticket_id) DO NOTHING`,
    [userId, broker_account_id, ticket_id, symbol, volume, side,
     entry_price, exit_price ?? null, profit_loss ?? null,
     commission, swap, opened_at, closed_at ?? null,
     source_broker, raw_payload ? JSON.stringify(raw_payload) : null],
  );

  res.status(201).json({ ok: true });
});

/* ── Fetch trade history ─────────────────────────────────────────────────── */
router.get("/", async (req: Request, res: Response) => {
  const userId = res.locals.user.sub as string;
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const offset = Number(req.query.offset ?? 0);

  const rows = await query(
    `SELECT id, broker_account_id, ticket_id, symbol, volume, side,
            entry_price, exit_price, profit_loss, commission, swap,
            opened_at, closed_at, source_broker, created_at
     FROM trade_logs
     WHERE user_id = $1
     ORDER BY COALESCE(closed_at, opened_at) DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  res.json({ ok: true, trades: rows, limit, offset });
});

export default router;
