import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import csv from "csv-parser";

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../db/pw_entries.sqlite");

export async function importCsvToDb(csvFilePath: string) {
  if (!fs.existsSync(csvFilePath)) {
    console.error(`❌ CSV file not found at ${csvFilePath}`);
    process.exit(1);
  }

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS pw_entries  (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      url TEXT,
      username TEXT,
      password TEXT,
      compromised BOOLEAN DEFAULT NULL,
      source TEXT DEFAULT 'csv',
      last_checked_at TEXT DEFAULT NULL
    )
  `);

  console.log(`📥 Importing from CSV: ${csvFilePath}`);

  const insertStmt = await db.prepare(`
    INSERT INTO pw_entries  (name, url, username, password)
    VALUES (?, ?, ?, ?)
  `);

  const rows: any[] = [];

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on("data", (row) => {
        rows.push(row);
      })
      .on("end", async () => {
        for (const row of rows) {
          if (row.password) {
            await insertStmt.run(row.name, row.url, row.username, row.password);
          }
        }
        console.log(`✅ Imported ${rows.length} rows into SQLite database.`);
        resolve();
      })
      .on("error", reject);
  });

  await insertStmt.finalize();
  await db.close();
}
