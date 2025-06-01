import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../db/pw_entries.sqlite");

interface Breach {
  name: string;
  title: string;
  domain: string;
  date: string;
  dataTypes: string[];
  description?: string;
  pwnCount?: number;
  affectedEmails: string[];
}

async function analyzeBreaches() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // Get all entries with breach information
  const query = `
    SELECT username, breach_info
    FROM pw_entries
    WHERE breach_info IS NOT NULL
    AND breach_info LIKE '%"breached":true%'
  `;

  const rows = await db.all(query);
  await db.close();

  if (rows.length === 0) {
    console.log(chalk.yellow("⚠️  No breach information found."));
    return;
  }

  console.log(chalk.blue.bold("🔍 Breach Analysis Report\n"));
  console.log(
    chalk.gray(
      `Analyzing breach data from ${rows.length} affected accounts...\n`
    )
  );

  // Collect all breaches
  const breachMap = new Map<string, Breach>();

  for (const row of rows) {
    try {
      const breachInfo = JSON.parse(row.breach_info);
      if (breachInfo.breached && breachInfo.breaches) {
        for (const breach of breachInfo.breaches) {
          const breachKey = `${breach.name || breach.title}-${breach.date || breach.breachDate}`;

          if (breachMap.has(breachKey)) {
            const existing = breachMap.get(breachKey)!;
            if (!existing.affectedEmails.includes(row.username.toLowerCase())) {
              existing.affectedEmails.push(row.username.toLowerCase());
            }
          } else {
            breachMap.set(breachKey, {
              name: breach.name || "Unknown",
              title: breach.title || breach.name || "Unknown",
              domain: breach.domain || "Unknown",
              date: breach.date || breach.breachDate || "Unknown",
              dataTypes: breach.dataTypes || [],
              description: breach.description,
              pwnCount: breach.pwnCount,
              affectedEmails: [row.username.toLowerCase()],
            });
          }
        }
      }
    } catch (e) {
      // Invalid JSON, skip
    }
  }

  // Sort breaches by date (newest first) and by number of affected emails
  const sortedBreaches = Array.from(breachMap.values()).sort((a, b) => {
    const dateA = new Date(a.date === "Unknown" ? "1970-01-01" : a.date);
    const dateB = new Date(b.date === "Unknown" ? "1970-01-01" : b.date);

    // First sort by date (newest first)
    const dateDiff = dateB.getTime() - dateA.getTime();
    if (dateDiff !== 0) return dateDiff;

    // Then by number of affected emails (most affected first)
    return b.affectedEmails.length - a.affectedEmails.length;
  });

  // Show recent breaches (last 2 years)
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const recentBreaches = sortedBreaches.filter((breach) => {
    const breachDate = new Date(
      breach.date === "Unknown" ? "1970-01-01" : breach.date
    );
    return breachDate >= twoYearsAgo;
  });

  console.log(
    chalk.red.bold(
      `🚨 Recent Breaches (Last 2 Years): ${recentBreaches.length} found\n`
    )
  );

  recentBreaches.slice(0, 10).forEach((breach, index) => {
    console.log(chalk.red(`${index + 1}. ${breach.title} (${breach.domain})`));
    console.log(chalk.gray(`   Date: ${breach.date}`));
    console.log(
      chalk.yellow(`   Your affected emails: ${breach.affectedEmails.length}`)
    );

    if (breach.pwnCount) {
      console.log(
        chalk.blue(
          `   Total accounts affected: ${breach.pwnCount.toLocaleString()}`
        )
      );
    }

    if (breach.dataTypes.length > 0) {
      console.log(
        chalk.cyan(`   Data exposed: ${breach.dataTypes.join(", ")}`)
      );
    }

    if (breach.description) {
      const shortDesc =
        breach.description.length > 150
          ? breach.description.substring(0, 150) + "..."
          : breach.description;
      console.log(chalk.gray(`   ${shortDesc}`));
    }

    console.log(
      chalk.magenta(
        `   Your emails: ${breach.affectedEmails.slice(0, 3).join(", ")}${breach.affectedEmails.length > 3 ? "..." : ""}`
      )
    );
    console.log("");
  });

  // Show most impactful breaches (affecting multiple emails)
  const impactfulBreaches = sortedBreaches.filter(
    (breach) => breach.affectedEmails.length > 1
  );

  if (impactfulBreaches.length > 0) {
    console.log(
      chalk.red.bold(
        `⚠️  Breaches Affecting Multiple Accounts: ${impactfulBreaches.length} found\n`
      )
    );

    impactfulBreaches.slice(0, 5).forEach((breach, index) => {
      console.log(
        chalk.red(
          `${index + 1}. ${breach.title} (${breach.domain}) - ${breach.date}`
        )
      );
      console.log(
        chalk.yellow(
          `   Affects ${breach.affectedEmails.length} of your email accounts`
        )
      );
      console.log(
        chalk.magenta(`   Emails: ${breach.affectedEmails.join(", ")}`)
      );
      console.log("");
    });
  }

  // Summary statistics
  console.log(chalk.blue.bold("📊 Summary Statistics\n"));
  console.log(
    `Total unique breaches: ${chalk.yellow(sortedBreaches.length.toString())}`
  );
  console.log(
    `Recent breaches (2+ years): ${chalk.red(recentBreaches.length.toString())}`
  );
  console.log(
    `Breaches affecting multiple accounts: ${chalk.yellow(impactfulBreaches.length.toString())}`
  );
  console.log(
    `Total affected email accounts: ${chalk.red(rows.length.toString())}`
  );

  // Top domains
  const domainCount = new Map<string, number>();
  sortedBreaches.forEach((breach) => {
    if (breach.domain !== "Unknown") {
      const count = domainCount.get(breach.domain) || 0;
      domainCount.set(breach.domain, count + 1);
    }
  });

  const topDomains = Array.from(domainCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topDomains.length > 0) {
    console.log(`\nTop breached domains:`);
    topDomains.forEach(([domain, count], index) => {
      console.log(
        `  ${index + 1}. ${chalk.cyan(domain)}: ${chalk.yellow(count.toString())} breaches`
      );
    });
  }
}

// Process command line arguments
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(chalk.blue.bold("🔍 pw-checker Breach Analysis Tool\n"));
  console.log("Usage: npm run analyze:breaches\n");
  console.log(
    "This tool analyzes all breach data in your database and provides:"
  );
  console.log("  • Recent breaches (last 2 years)");
  console.log("  • Breaches affecting multiple accounts");
  console.log("  • Summary statistics");
  console.log("  • Top breached domains");
  process.exit(0);
}

analyzeBreaches().catch((err) => {
  console.error(chalk.red("❌ Failed to analyze breaches:"), err.message);
});
