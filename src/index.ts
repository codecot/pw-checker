// password-checker/src/index.ts
import dotenv from "dotenv";
import { importCsvToDb } from "./importCsv.js";
import { checkAllPasswords } from "./checkPasswords.js";
import {
  checkAllAccountsForBreaches,
  runScheduledBreachCheck,
  showBreachStatistics,
} from "./checkBreaches.js";
import { importFromChrome } from "./importFromChrome.js";
import { importFromChromeCsv } from "./importFromChromeCsv.js";
import chalk from "chalk";
import fs from "fs";

// Load environment variables from .env file
dotenv.config();

// Parse command-line arguments
const args = process.argv.slice(2);

// Show help if requested
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    chalk.blue.bold("🔐 pw-checker - Password Security Auditing Tool\n")
  );
  console.log("Usage: npm start [OPTIONS]\n");
  console.log("Import Options:");
  console.log("  --chrome         Import passwords from Chrome database");
  console.log("  --chrome-csv     Import passwords from Chrome CSV export");
  console.log("  --chrome-csv=PATH Specify custom path to Chrome CSV file");
  console.log("\nSecurity Options:");
  console.log(
    "  --check-breaches     Check email accounts for data breaches (requires HIBP API key)"
  );
  console.log(
    "  --breach-stats       Show breach check progress and statistics"
  );
  console.log(
    "  --breach-scheduled   Run a single batch of breach checks (for cron jobs)"
  );
  console.log(
    "  --resume             Resume breach checking from where it left off"
  );
  console.log(
    "  --limit=N            Limit number of accounts to check (e.g., --limit=10)"
  );
  console.log("\nDevelopment Options:");
  console.log(
    "  --dev            Development mode (limit API calls to 5 records)"
  );
  console.log("  --skip-network   Skip all network API calls");
  console.log("\nOther Options:");
  console.log("  --help, -h       Show this help message");
  console.log("\nExamples:");
  console.log(
    "  npm start                       Import CSV and check passwords"
  );
  console.log(
    "  npm run import:chrome-csv       Import from Chrome CSV export"
  );
  console.log("  npm run check:breaches          Check for data breaches");
  console.log("  npm run view                    View all entries");
  console.log("  npm run view -- --chrome        View only Chrome entries");
  console.log(
    "  npm run view:breached           View accounts found in breaches"
  );
  console.log(
    "  npm run view:breached:detailed  View detailed breach information"
  );
  console.log("  npm run analyze:breaches        Analyze all breach data");
  process.exit(0);
}

const importChrome = args.includes("--chrome");
const importChromeCsv = args.includes("--chrome-csv");
const checkBreaches = args.includes("--check-breaches");
const breachStats = args.includes("--breach-stats");
const breachScheduled = args.includes("--breach-scheduled");
const resumeBreachCheck = args.includes("--resume");
const chromeCsvPath = getChromeExportPath(args);

// Parse limit parameter
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limitValue = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;

function getChromeExportPath(args: string[]): string {
  const pathIndex = args.findIndex((arg) => arg === "--chrome-csv-path");
  if (pathIndex !== -1 && pathIndex + 1 < args.length) {
    return args[pathIndex + 1];
  }
  return "data/chrome-passwords.csv";
}

(async () => {
  try {
    console.log("🔐 Starting pw-checker...");

    // Handle breach statistics request first (no other processing needed)
    if (breachStats) {
      await showBreachStatistics();
      return;
    }

    // Handle scheduled breach check (for cron jobs)
    if (breachScheduled) {
      const batchSize = limitValue || 8;
      const completed = await runScheduledBreachCheck(batchSize);
      if (completed) {
        console.log(
          chalk.green("🎉 All accounts have been checked for breaches!")
        );
      }
      return;
    }

    // Import passwords from CSV
    console.log("📥 Checking for CSV file: data/passwords.csv");
    if (fs.existsSync("data/passwords.csv")) {
      await importCsvToDb("data/passwords.csv");
    } else {
      console.log(
        chalk.yellow(
          "⚠️ No CSV file found at data/passwords.csv. Skipping CSV import."
        )
      );
      console.log(
        chalk.blue(
          "ℹ️ To import from CSV, create data/passwords.csv or copy from data/passwords.csv.template"
        )
      );
    }

    // Import from Chrome if requested
    if (importChrome) {
      console.log("🔍 Importing passwords from Chrome...");
      const imported = await importFromChrome();
      console.log(
        chalk.green(`✅ Imported ${imported} credentials from Chrome.`)
      );
    }

    // Import from Chrome CSV export if requested
    if (importChromeCsv) {
      if (!fs.existsSync(chromeCsvPath)) {
        console.error(
          chalk.red(`❌ Chrome CSV export file not found at: ${chromeCsvPath}`)
        );
        console.log(
          chalk.yellow(
            `ℹ️ Export your Chrome passwords to CSV and save the file to "${chromeCsvPath}" or specify path with --chrome-csv-path`
          )
        );
      } else {
        console.log(
          `🔍 Importing passwords from Chrome CSV export: ${chromeCsvPath}`
        );
        const imported = await importFromChromeCsv(chromeCsvPath);
        console.log(
          chalk.green(
            `✅ Imported/updated ${imported} credentials from Chrome CSV export.`
          )
        );
      }
    }

    // Check for development mode flags
    const isDevelopment =
      args.includes("--dev") || args.includes("--development");
    const skipNetworkCalls =
      args.includes("--skip-network") || process.env.SKIP_NETWORK === "true";
    const limitRecords = isDevelopment ? 5 : undefined;

    if (isDevelopment) {
      console.log(
        chalk.yellow(
          `ℹ️ Development mode: Limiting network API calls to ${limitRecords} records.`
        )
      );
    }

    if (skipNetworkCalls) {
      console.log(
        chalk.yellow(
          "ℹ️ Skipping network API calls (use --dev or --skip-network to disable)."
        )
      );
    } else {
      // Check all passwords against HIBP
      console.log("🔍 Checking passwords against HIBP database...");
      await checkAllPasswords(limitRecords);

      // Check accounts for data breaches if requested
      if (checkBreaches) {
        console.log("🔍 Checking accounts for data breaches...");
        await checkAllAccountsForBreaches(
          limitValue || limitRecords,
          resumeBreachCheck
        );
      }
    }

    console.log("✅ pw-checker finished.");
  } catch (error) {
    console.error(chalk.red("❌ An error occurred:"), error);
    console.log(
      chalk.yellow("ℹ️ Please check your configuration and try again.")
    );
    process.exit(1);
  }
})();
