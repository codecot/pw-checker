// database.ts - Shared database utilities
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const dbPath = path.resolve(__dirname, "../db/pw_entries.sqlite");

/**
 * Initialize database connection with proper directory creation
 */
export async function initDatabase() {
  // Ensure the db directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`📁 Created database directory: ${dbDir}`);
  }

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // Ensure the main table exists with all required columns
  await db.exec(`
    CREATE TABLE IF NOT EXISTS pw_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      url TEXT,
      username TEXT,
      password TEXT,
      compromised BOOLEAN DEFAULT NULL,
      source TEXT DEFAULT 'csv',
      last_checked_at TEXT DEFAULT NULL,
      notes TEXT,
      breach_info TEXT
    )
  `);

  return db;
}

/**
 * Get database connection (assumes database is already initialized)
 */
export async function getDatabase() {
  return await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });
}
