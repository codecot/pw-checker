// exportToCsv.ts - Export database records to CSV format
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initDatabase } from "./database.js";
import chalk from "chalk";

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PasswordEntry {
  id: number;
  name: string;
  url: string;
  username: string;
  password: string;
  compromised: boolean | null;
  source: string;
  last_checked_at: string | null;
  notes: string | null;
  breach_info: string | null;
}

/**
 * Escape CSV field values
 */
function escapeCsvValue(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);

  // If the value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Parse breach info to extract meaningful data
 */
function parseBreachInfo(breachInfo: string | null): {
  breached: boolean;
  breachCount: number;
  breachNames: string;
  lastBreachDate: string;
} {
  if (!breachInfo) {
    return {
      breached: false,
      breachCount: 0,
      breachNames: "",
      lastBreachDate: "",
    };
  }

  try {
    const parsed = JSON.parse(breachInfo);

    if (
      parsed.breached === true &&
      parsed.breaches &&
      Array.isArray(parsed.breaches)
    ) {
      const breaches = parsed.breaches.filter((b: any) => b && b.Name); // Filter out empty breaches
      const breachNames = breaches.map((b: any) => b.Name).join("; ");
      const latestDate = breaches.reduce((latest: string, breach: any) => {
        const breachDate = breach.BreachDate || "";
        return breachDate > latest ? breachDate : latest;
      }, "");

      return {
        breached: true,
        breachCount: breaches.length,
        breachNames,
        lastBreachDate: latestDate,
      };
    }
  } catch (error) {
    console.warn(`Warning: Could not parse breach info: ${error}`);
  }

  return {
    breached: false,
    breachCount: 0,
    breachNames: "",
    lastBreachDate: "",
  };
}

/**
 * Export all password entries to CSV
 */
export async function exportToCSV(outputPath?: string): Promise<void> {
  try {
    console.log(chalk.blue("📤 Starting CSV export..."));

    const db = await initDatabase();

    // Get all records
    const entries: PasswordEntry[] = await db.all(`
      SELECT
        id, name, url, username, password, compromised, source,
        last_checked_at, notes, breach_info
      FROM pw_entries
      ORDER BY id
    `);

    if (entries.length === 0) {
      console.log(chalk.yellow("⚠️  No entries found in database"));
      return;
    }

    // Prepare CSV headers
    const headers = [
      "ID",
      "Name",
      "URL",
      "Username",
      "Password",
      "Compromised",
      "Source",
      "Last Checked",
      "Notes",
      "Breached",
      "Breach Count",
      "Breach Names",
      "Last Breach Date",
    ];

    // Generate CSV content
    const csvLines = [headers.join(",")];

    for (const entry of entries) {
      const breachData = parseBreachInfo(entry.breach_info);

      const row = [
        entry.id,
        entry.name || "",
        entry.url || "",
        entry.username || "",
        entry.password || "",
        entry.compromised === null
          ? "Unknown"
          : entry.compromised
            ? "Yes"
            : "No",
        entry.source || "",
        entry.last_checked_at || "",
        entry.notes || "",
        breachData.breached ? "Yes" : "No",
        breachData.breachCount,
        breachData.breachNames,
        breachData.lastBreachDate,
      ];

      csvLines.push(row.map(escapeCsvValue).join(","));
    }

    // Determine output path
    const defaultPath = path.resolve(
      __dirname,
      "../reports/password_export.csv"
    );
    const finalPath = outputPath || defaultPath;

    // Ensure reports directory exists
    const reportsDir = path.dirname(finalPath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
      console.log(`📁 Created reports directory: ${reportsDir}`);
    }

    // Write CSV file
    fs.writeFileSync(finalPath, csvLines.join("\n"), "utf8");

    console.log(
      chalk.green(
        `✅ Successfully exported ${entries.length} entries to: ${finalPath}`
      )
    );
    console.log(chalk.blue(`📊 Export summary:`));
    console.log(`   • Total entries: ${entries.length}`);

    const compromisedCount = entries.filter(
      (e) => e.compromised === true
    ).length;
    const breachedCount = entries.filter((e) => {
      const breachData = parseBreachInfo(e.breach_info);
      return breachData.breached;
    }).length;

    console.log(`   • Compromised entries: ${compromisedCount}`);
    console.log(`   • Breached entries: ${breachedCount}`);
    console.log(
      `   • Sources: ${[...new Set(entries.map((e) => e.source))].join(", ")}`
    );

    await db.close();
  } catch (error) {
    console.error(chalk.red("❌ Error exporting to CSV:"), error);
    throw error;
  }
}

/**
 * Main function for command line usage
 */
async function main() {
  const args = process.argv.slice(2);
  const outputPath = args
    .find((arg) => arg.startsWith("--output="))
    ?.split("=")[1];

  if (args.includes("--help")) {
    console.log(chalk.blue("CSV Export Tool"));
    console.log("Usage: npm run export:csv [--output=/path/to/file.csv]");
    console.log("");
    console.log("Options:");
    console.log(
      "  --output=PATH    Specify output file path (default: reports/password_export.csv)"
    );
    console.log("  --help           Show this help message");
    return;
  }

  await exportToCSV(outputPath);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
