import "dotenv/config";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  for (const migration of ["001_initial.sql", "002_ip_rules.sql"]) {
    const sql = await readFile(
      new URL(`../db/${migration}`, import.meta.url),
      "utf8",
    );
    await pool.query(sql);
  }
  console.log("SiteShield database schema is up to date.");
} finally {
  await pool.end();
}
