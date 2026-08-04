/**
 * server/src/lib/auth.ts
 *
 * Authentication utilities:
 *   • Password hashing with bcryptjs
 *   • JWT sign / verify
 *   • AES-256-GCM encryption for Deriv OAuth tokens stored in DB
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const BCRYPT_ROUNDS = 12;

/* ── Password ────────────────────────────────────────────────────────────── */
export const hashPassword = (plain: string) =>
  bcrypt.hash(plain, BCRYPT_ROUNDS);

export const verifyPassword = (plain: string, hash: string) =>
  bcrypt.compare(plain, hash);

/* ── JWT ─────────────────────────────────────────────────────────────────── */
export interface JwtPayload {
  sub: string;   // user id (UUID)
  email: string;
}

export function signToken(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set");
  return jwt.sign(payload, secret, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "24h") as string,
  });
}

export function verifyToken(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set");
  return jwt.verify(token, secret) as JwtPayload;
}

/* ── AES-256-GCM encryption (for Deriv tokens in DB) ────────────────────── */
const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) throw new Error("ENCRYPTION_KEY not set");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
  return key;
}

/**
 * Encrypts a plaintext string.
 * Returns a base64-encoded string in format: iv:ciphertext:authTag
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    encrypted.toString("base64"),
    authTag.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a string produced by `encrypt`.
 */
export function decrypt(blob: string): string {
  const key = getEncryptionKey();
  const [ivB64, cipherB64, tagB64] = blob.split(":");
  if (!ivB64 || !cipherB64 || !tagB64) {
    throw new Error("Invalid encrypted blob format");
  }
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}
