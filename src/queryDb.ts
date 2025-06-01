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
    "SELECT id, name, url, username, compromised, last_checked_at, breach_info FROM pw_entries";

  // Add filter if provided
  if (filter === "compromised") {
    query += " WHERE compromised = 1";
  } else if (filter === "safe") {
    query += " WHERE compromised = 0";
  } else if (filter === "unchecked") {
    query += " WHERE compromised IS NULL";
  } else if (filter === "breached") {
    query +=
      " WHERE breach_info IS NOT NULL AND breach_info LIKE '%\"breached\":true%'";
  } else if (filter === "chrome") {
    query += " WHERE source = 'chrome'";
  } else if (filter === "chrome-compromised") {
    query += " WHERE source = 'chrome' AND compromised = 1";
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

      // Check for breach info
      let breachText = "";
      if (row.breach_info) {
        try {
          const breachInfo = JSON.parse(row.breach_info);
          if (breachInfo.breached) {
            breachText = chalk.red(
              `🚨 Found in ${breachInfo.count} data breaches`
            );
          } else if (breachInfo.checked) {
            breachText = chalk.green("✅ No data breaches found");
          }
        } catch (e) {
          // Invalid JSON
        }
      }

      console.log(
        `${chalk.bold(row.id)} | ${chalk.cyan(row.name)} | ${chalk.gray(
          row.url
        )} | ${chalk.magenta(row.username)} | ${status} | ${
          row.last_checked_at || "never checked"
        } ${breachText}`
      );
    }
  }

  await db.close();
}

// Process command line arguments
const args = process.argv.slice(2);
let filter;

if (args.includes("--help") || args.includes("-h")) {
  console.log(chalk.blue.bold("📋 pw-checker Query Tool\n"));
  console.log("Usage: npm run view [FILTER]\n");
  console.log("Available filters:");
  console.log("  --compromised       Show only compromised passwords");
  console.log("  --safe              Show only safe passwords");
  console.log("  --unchecked         Show only unchecked passwords");
  console.log(
    "  --breached          Show only accounts found in data breaches"
  );
  console.log("  --chrome            Show only Chrome-imported entries");
  console.log(
    "  --chrome-compromised Show only Chrome entries marked as compromised"
  );
  console.log("  --help, -h          Show this help message");
  process.exit(0);
}

if (args.includes("--compromised")) {
  filter = "compromised";
} else if (args.includes("--safe")) {
  filter = "safe";
} else if (args.includes("--unchecked")) {
  filter = "unchecked";
} else if (args.includes("--breached")) {
  filter = "breached";
} else if (args.includes("--chrome")) {
  filter = "chrome";
} else if (args.includes("--chrome-compromised")) {
  filter = "chrome-compromised";
}

// Handle EPIPE errors gracefully when output is piped
process.stdout.on("error", (err) => {
  if (err.code === "EPIPE") {
    // This is expected when piping to commands like head, tail, etc.
    process.exit(0);
  }
  throw err;
});

showTable(filter).catch((err) => {
  console.error(chalk.red("❌ Failed to query database:"), err.message);
});
