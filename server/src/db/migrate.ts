/**
 * server/src/db/migrate.ts
 *
 * Idempotent migration runner.
 * Called during Render build: npm run migrate
 * Also exported so index.ts can call it on startup as a safety net.
 *
 * All DDL in schema.sql uses IF NOT EXISTS / CREATE OR REPLACE
 * so re-running is always safe.
 */
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import "dotenv/config";

export async function runMigration(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL environment variable is not set");

  const schemaPath = path.join(__dirname, "schema.sql");
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`schema.sql not found at ${schemaPath}`);
  }

  const sql = fs.readFileSync(schemaPath, "utf8");

  // Use a dedicated short-lived pool for migration
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 10_000,
  });

  console.log("[migrate] Connecting to database…");
  const client = await pool.connect();

  try {
    console.log("[migrate] Applying schema.sql…");
    await client.query(sql);
    console.log("[migrate] ✓ Schema applied successfully.");
  } catch (err) {
    console.error("[migrate] ✗ Migration failed:", (err as Error).message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run directly when called as: node migrate.js  or  ts-node migrate.ts
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
