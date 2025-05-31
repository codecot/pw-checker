// filepath: /home/volo/projects/pw-checker/src/queryDb.ts
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../db/pw_entries.sqlite");

async function showTable(filter?: string) {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  let query =
    "SELECT id, name, url, username, compromised, last_checked_at FROM pw_entries";

  // Add filter if provided
  if (filter === "compromised") {
    query += " WHERE compromised = 1";
  } else if (filter === "safe") {
    query += " WHERE compromised = 0";
  } else if (filter === "unchecked") {
    query += " WHERE compromised IS NULL";
  }

  const rows = await db.all(query);

  if (rows.length === 0) {
    console.log(chalk.yellow("⚠️  No entries found in pw_entries table."));
  } else {
    const filterText = filter ? ` (${filter})` : "";
    console.log(
      chalk.blue.bold(
        `📋 Found ${rows.length} entries${filterText} in database:\n`
      )
    );

    for (const row of rows) {
      const status =
        row.compromised === null
          ? chalk.yellow("⚠️  UNCHECKED")
          : row.compromised === 1
          ? chalk.red("⚠️  COMPROMISED")
          : chalk.green("✅ Safe");

      console.log(
        `${chalk.bold(row.id)} | ${chalk.cyan(row.name)} | ${chalk.gray(
          row.url
        )} | ${chalk.magenta(row.username)} | ${status} | ${
          row.last_checked_at || "never checked"
        }`
      );
    }
  }

  await db.close();
}

// Process command line arguments
const args = process.argv.slice(2);
let filter;

if (args.includes("--compromised")) {
  filter = "compromised";
} else if (args.includes("--safe")) {
  filter = "safe";
} else if (args.includes("--unchecked")) {
  filter = "unchecked";
}

showTable(filter).catch((err) => {
  console.error(chalk.red("❌ Failed to query database:"), err.message);
});
