#!/usr/bin/env node
// clearDb.ts - Clear the pw-checker database

import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../db/pw_entries.sqlite");

async function clearDatabase() {
  console.log(chalk.blue("🗑️  Clearing password database..."));
  console.log(chalk.blue(`Using database at: ${dbPath}`));

  try {
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    // Get current count of entries
    const countResult = await db.get(
      "SELECT COUNT(*) as count FROM pw_entries"
    );
    const entryCount = countResult.count;
    console.log(chalk.blue(`Found ${entryCount} entries to delete.`));

    // Delete all entries
    await db.run("DELETE FROM pw_entries");
    console.log(chalk.blue("Deleted all entries."));

    // Reset the autoincrement counter
    await db.run("DELETE FROM sqlite_sequence WHERE name = 'pw_entries'");
    console.log(chalk.blue("Reset autoincrement counter."));

    await db.close();

    console.log(
      chalk.green(
        `✅ Successfully cleared database. Removed ${entryCount} entries.`
      )
    );
  } catch (error) {
    console.error(
      chalk.red(
        `❌ Error clearing database: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    process.exit(1);
  }
}

// Run the function
clearDatabase();
