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
    "SELECT id, name, url, username, compromised, last_checked_at, breach_info, risk_score, risk_label, risk_factors FROM pw_entries";

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
  } else if (filter === "breached-detailed") {
    query +=
      " WHERE breach_info IS NOT NULL AND breach_info LIKE '%\"breached\":true%'";
  } else if (filter === "chrome") {
    query += " WHERE source = 'chrome'";
  } else if (filter === "chrome-compromised") {
    query += " WHERE source = 'chrome' AND compromised = 1";
  } else if (filter === "risk-critical") {
    query += " WHERE risk_label = 'Critical'";
  } else if (filter === "risk-high") {
    query += " WHERE risk_label = 'High'";
  } else if (filter === "risk-medium") {
    query += " WHERE risk_label = 'Medium'";
  } else if (filter === "risk-low") {
    query += " WHERE risk_label = 'Low'";
  } else if (filter === "by-risk") {
    query += " WHERE risk_score IS NOT NULL ORDER BY risk_score DESC, name ASC";
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
              ` 🚨 Found in ${breachInfo.count} data breaches`
            );
          } else if (breachInfo.checked) {
            breachText = chalk.green(" ✅ No data breaches found");
          }
        } catch (e) {
          // Invalid JSON
        }
      }

      // Check for risk info
      let riskText = "";
      if (row.risk_score !== null && row.risk_label) {
        const riskColor =
          row.risk_label === "Critical"
            ? chalk.red.bold
            : row.risk_label === "High"
              ? chalk.red
              : row.risk_label === "Medium"
                ? chalk.yellow
                : chalk.green;
        riskText = ` | Risk: ${riskColor(row.risk_label)} (${row.risk_score})`;
      }

      console.log(
        `${chalk.bold(row.id)} | ${chalk.cyan(row.name)} | ${chalk.gray(
          row.url
        )} | ${chalk.magenta(row.username)} | ${status} | ${
          row.last_checked_at || "never checked"
        }${breachText}${riskText}`
      );

      // Show detailed breach info if requested and available
      if (
        (filter === "breached" || filter === "breached-detailed") &&
        row.breach_info
      ) {
        try {
          const breachInfo = JSON.parse(row.breach_info);
          if (breachInfo.breached && breachInfo.breaches) {
            // Sort breaches by date (newest first)
            const sortedBreaches = [...breachInfo.breaches].sort(
              (a: any, b: any) => {
                const dateA = new Date(a.date || a.breachDate || "1970-01-01");
                const dateB = new Date(b.date || b.breachDate || "1970-01-01");
                return dateB.getTime() - dateA.getTime();
              }
            );

            const maxBreaches =
              filter === "breached-detailed" ? sortedBreaches.length : 3;
            sortedBreaches.slice(0, maxBreaches).forEach((breach: any) => {
              const breachDate =
                breach.date || breach.breachDate || "Unknown date";
              console.log(
                chalk.red(
                  `     - ${breach.title || breach.name} (${breach.domain}) - ${breachDate}`
                )
              );
              if (breach.dataTypes && breach.dataTypes.length > 0) {
                console.log(
                  chalk.yellow(
                    `       Data exposed: ${breach.dataTypes.join(", ")}`
                  )
                );
              }
              if (breach.description && filter === "breached-detailed") {
                console.log(
                  chalk.gray(
                    `       ${breach.description.slice(0, 200)}${breach.description.length > 200 ? "..." : ""}`
                  )
                );
              }
              if (filter === "breached-detailed" && breach.pwnCount) {
                console.log(
                  chalk.blue(
                    `       Accounts affected: ${breach.pwnCount.toLocaleString()}`
                  )
                );
              }
            });
            if (filter === "breached" && breachInfo.breaches.length > 3) {
              console.log(
                chalk.gray(
                  `     ... and ${breachInfo.breaches.length - 3} more breaches`
                )
              );
            }
            console.log(""); // Add spacing
          }
        } catch (e) {
          // Invalid JSON
        }
      }
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
    "  --breached          Show only accounts found in data breaches (top 3 per account)"
  );
  console.log(
    "  --breached-detailed Show all breach details with full information"
  );
  console.log("  --chrome            Show only Chrome-imported entries");
  console.log(
    "  --chrome-compromised Show only Chrome entries marked as compromised"
  );
  console.log("  --risk-critical     Show only critical risk accounts");
  console.log("  --risk-high         Show only high risk accounts");
  console.log("  --risk-medium       Show only medium risk accounts");
  console.log("  --risk-low          Show only low risk accounts");
  console.log("  --by-risk           Show all accounts sorted by risk score");
  console.log("  --help, -h          Show this help message");
  process.exit(0);
}

if (args.includes("--compromised")) {
  filter = "compromised";
} else if (args.includes("--safe")) {
  filter = "safe";
} else if (args.includes("--unchecked")) {
  filter = "unchecked";
} else if (args.includes("--breached-detailed")) {
  filter = "breached-detailed";
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
