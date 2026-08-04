/**
 * server/src/db/migrate.ts
 *
 * Idempotent migration runner.
 * Run: npm run migrate
 *
 * Reads schema.sql and executes it against the target database.
 * All DDL statements in schema.sql use IF NOT EXISTS / OR REPLACE
 * so re-running is safe at any time.
 */
import fs from "fs";
import path from "path";
import { pool } from "./client";
import "dotenv/config";

async function migrate() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");

  console.log("[migrate] Connecting to database…");
  const client = await pool.connect();

  try {
    console.log("[migrate] Running schema.sql…");
    await client.query(sql);
    console.log("[migrate] ✓ Schema applied successfully.");
  } catch (err) {
    console.error("[migrate] ✗ Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
