/**
 * Express middleware that verifies the Authorization: Bearer <jwt> header.
 * Attaches the decoded payload to res.locals.user.
 */
import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ ok: false, error: "Missing or invalid Authorization header." });
    return;
  }
  try {
    const token = header.slice(7);
    res.locals.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ ok: false, error: "Token expired or invalid. Please sign in again." });
  }
}
