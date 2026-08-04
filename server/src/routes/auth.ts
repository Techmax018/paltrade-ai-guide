/**
 * POST /api/v1/auth/register
 * POST /api/v1/auth/login
 * GET  /api/v1/auth/me
 */
import { Router, Request, Response } from "express";
import { query, queryOne } from "../db/client";
import { hashPassword, verifyPassword, signToken } from "../lib/auth";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

/* ── Register ────────────────────────────────────────────────────────────── */
router.post("/register", async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(422).json({ ok: false, error: "email and password are required." });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(422).json({ ok: false, error: "Invalid email address." });
    return;
  }
  if (password.length < 10) {
    res.status(422).json({ ok: false, error: "Password must be at least 10 characters." });
    return;
  }

  const existing = await queryOne("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
  if (existing) {
    res.status(409).json({ ok: false, error: "An account with this email already exists." });
    return;
  }

  const password_hash = await hashPassword(password);
  const [user] = await query<{ id: string; email: string; created_at: string }>(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     RETURNING id, email, created_at`,
    [email.toLowerCase(), password_hash],
  );

  const token = signToken({ sub: user.id, email: user.email });
  res.status(201).json({ ok: true, token, user: { id: user.id, email: user.email } });
});

/* ── Login ───────────────────────────────────────────────────────────────── */
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(422).json({ ok: false, error: "email and password are required." });
    return;
  }

  const user = await queryOne<{ id: string; email: string; password_hash: string }>(
    "SELECT id, email, password_hash FROM users WHERE email = $1",
    [email.toLowerCase()],
  );

  // Constant-time-ish: always hash even if user not found to prevent timing attacks
  const dummyHash = "$2b$12$invalidhashforenumeration";
  const hash = user?.password_hash ?? dummyHash;
  const valid = await verifyPassword(password, hash);

  if (!user || !valid) {
    res.status(401).json({ ok: false, error: "Invalid email or password." });
    return;
  }

  const token = signToken({ sub: user.id, email: user.email });
  res.json({ ok: true, token, user: { id: user.id, email: user.email } });
});

/* ── Me ──────────────────────────────────────────────────────────────────── */
router.get("/me", requireAuth, async (_req: Request, res: Response) => {
  const { sub } = res.locals.user;
  const user = await queryOne<{ id: string; email: string; created_at: string }>(
    "SELECT id, email, created_at FROM users WHERE id = $1",
    [sub],
  );
  if (!user) { res.status(404).json({ ok: false, error: "User not found." }); return; }
  res.json({ ok: true, user });
});

export default router;
