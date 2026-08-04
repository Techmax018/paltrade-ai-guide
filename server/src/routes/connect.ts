/**
 * POST /api/v1/connect/vantage
 * POST /api/v1/connect/deriv-callback
 * GET  /api/v1/connect/brokers
 * DELETE /api/v1/connect/brokers/:id
 */
import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { query, queryOne } from "../db/client";
import { encrypt } from "../lib/auth";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();
router.use(requireAuth); // All connect routes require authentication

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/v1/connect/vantage
   
   1. Receives { loginId, serverName, accountType, password }
   2. Calls MetaApi provisioning API to create/deploy the MT5 account
   3. Stores { broker_type, broker_account_id, bridge_reference_id,
              server_name, account_type } in linked_brokers
   4. Returns metaAccountId — password is NEVER stored
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/vantage", async (req: Request, res: Response) => {
  const userId = res.locals.user.sub as string;
  const { loginId, serverName, accountType, password } =
    req.body as {
      loginId?: string;
      serverName?: string;
      accountType?: "DEMO" | "REAL";
      password?: string;
    };

  if (!loginId || !serverName || !accountType || !password) {
    res.status(422).json({ ok: false, error: "loginId, serverName, accountType and password are required." });
    return;
  }
  if (!["DEMO", "REAL"].includes(accountType)) {
    res.status(422).json({ ok: false, error: "accountType must be DEMO or REAL." });
    return;
  }

  const metaToken = process.env.METAAPI_TOKEN;
  if (!metaToken) {
    res.status(500).json({ ok: false, error: "MetaApi token not configured. Contact support." });
    return;
  }

  /* ── Step 1: Provision account with MetaApi ─────────────────────────── */
  let metaAccountId: string;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const provRes = await fetch(
      "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "auth-token": metaToken },
        signal: controller.signal,
        body: JSON.stringify({
          login: loginId,
          password,           // forwarded once — discarded after this fetch
          name: `paltrade-${loginId}`,
          server: serverName,
          platform: "mt5",
          magic: 0,
          region: "london",
          reliability: "high",
          tags: ["paltrade", accountType.toLowerCase()],
        }),
      },
    );
    clearTimeout(timeout);

    if (!provRes.ok) {
      const msg = await provRes.text();
      const clientMsg = provRes.status === 401
        ? "Invalid MT5 credentials."
        : provRes.status === 404
          ? "Server not found. Check the server name."
          : "Failed to connect to MT5 server.";
      console.error(`[connect/vantage] MetaApi error ${provRes.status}: ${msg}`);
      res.status(502).json({ ok: false, error: clientMsg });
      return;
    }

    const account = await provRes.json() as { id: string; state: string };
    metaAccountId = account.id;

    // Deploy if not already
    if (account.state !== "DEPLOYED") {
      await fetch(
        `https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/${metaAccountId}/deploy`,
        { method: "POST", headers: { "auth-token": metaToken } },
      );
    }
  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error).name === "AbortError") {
      res.status(504).json({ ok: false, error: "MetaApi handshake timed out (15s). Try again." });
      return;
    }
    res.status(502).json({ ok: false, error: "Network error contacting MetaApi." });
    return;
  }
  // ← password reference ends here; it is NOT used below

  /* ── Step 2: Upsert into linked_brokers ─────────────────────────────── */
  const row = await queryOne<{ id: string }>(
    `INSERT INTO linked_brokers
       (user_id, broker_type, broker_account_id, account_type,
        bridge_reference_id, server_name, is_active)
     VALUES ($1, 'VANTAGE_MT5', $2, $3, $4, $5, TRUE)
     ON CONFLICT (user_id, broker_type, broker_account_id)
       DO UPDATE SET
         bridge_reference_id = EXCLUDED.bridge_reference_id,
         server_name         = EXCLUDED.server_name,
         account_type        = EXCLUDED.account_type,
         is_active           = TRUE,
         updated_at          = NOW()
     RETURNING id`,
    [userId, loginId, accountType, metaAccountId, serverName],
  );

  res.status(201).json({
    ok: true,
    linkedBrokerId: row!.id,
    metaAccountId,
    loginId,
    server: serverName,
    accountType,
    message: "Vantage MT5 account connected successfully.",
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/v1/connect/deriv-callback
   
   Called by the frontend after Deriv OAuth redirect.
   Receives the accounts array parsed from the redirect URL params.
   Encrypts the Deriv token and stores it in linked_brokers.
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/deriv-callback", async (req: Request, res: Response) => {
  const userId = res.locals.user.sub as string;
  const { accounts } = req.body as {
    accounts?: Array<{
      loginid: string;
      token: string;
      currency: string;
      type: "real" | "virtual";
    }>;
  };

  if (!Array.isArray(accounts) || accounts.length === 0) {
    res.status(422).json({ ok: false, error: "accounts array is required." });
    return;
  }

  const inserted: string[] = [];

  for (const acc of accounts) {
    if (!acc.loginid || !acc.token) continue;

    const accountType: "DEMO" | "REAL" = acc.type === "real" ? "REAL" : "DEMO";
    // Encrypt the Deriv token before storing — key lives only in Render env
    const encryptedToken = encrypt(acc.token);

    const row = await queryOne<{ id: string }>(
      `INSERT INTO linked_brokers
         (user_id, broker_type, broker_account_id, account_type,
          oauth_access_token, is_active)
       VALUES ($1, 'DERIV', $2, $3, $4, TRUE)
       ON CONFLICT (user_id, broker_type, broker_account_id)
         DO UPDATE SET
           oauth_access_token = EXCLUDED.oauth_access_token,
           account_type       = EXCLUDED.account_type,
           is_active          = TRUE,
           updated_at         = NOW()
       RETURNING id`,
      [userId, acc.loginid, accountType, encryptedToken],
    );

    if (row) inserted.push(row.id);
  }

  res.status(201).json({
    ok: true,
    linked: inserted.length,
    message: "Deriv accounts linked successfully.",
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/v1/connect/brokers
   Returns all linked broker accounts for the authenticated user.
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/brokers", async (_req: Request, res: Response) => {
  const userId = res.locals.user.sub as string;
  const rows = await query<{
    id: string;
    broker_type: string;
    broker_account_id: string;
    account_type: string;
    bridge_reference_id: string | null;
    server_name: string | null;
    is_active: boolean;
    created_at: string;
  }>(
    `SELECT id, broker_type, broker_account_id, account_type,
            bridge_reference_id, server_name, is_active, created_at
     FROM linked_brokers
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  // NOTE: oauth_access_token is intentionally excluded from this response
  res.json({ ok: true, brokers: rows });
});

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/v1/connect/brokers/:id
   ═══════════════════════════════════════════════════════════════════════════ */
router.delete("/brokers/:id", async (req: Request, res: Response) => {
  const userId = res.locals.user.sub as string;
  const { id } = req.params;
  await query(
    "UPDATE linked_brokers SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND user_id = $2",
    [id, userId],
  );
  res.json({ ok: true, message: "Broker unlinked." });
});

export default router;
