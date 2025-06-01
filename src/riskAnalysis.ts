#!/usr/bin/env node
// riskAnalysis.ts - CLI tool for risk scoring and security audit reporting

import chalk from "chalk";
import {
  updateAllRiskScores,
  getEntriesByRisk,
  getRiskLevel,
} from "./riskScoring.js";
import { generatePDFSecurityReport } from "./pdfSecurityReport.js";
import path from "path";
import { fileURLToPath } from "url";

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Display risk analysis results in the terminal
 */
async function displayRiskAnalysis(limit: number = 20): Promise<void> {
  console.log(chalk.blue.bold("🔍 Security Risk Analysis\n"));

  const entries = await getEntriesByRisk(limit);

  if (entries.length === 0) {
    console.log(
      chalk.yellow(
        "⚠️ No entries found. Run risk scoring first with --calculate-risk"
      )
    );
    return;
  }

  console.log(
    chalk.blue(
      `📋 Top ${Math.min(limit, entries.length)} accounts by risk score:\n`
    )
  );

  entries.forEach((entry, index) => {
    const riskLevel = getRiskLevel(entry.risk_score || 0);
    const riskColor =
      riskLevel.label === "Critical"
        ? chalk.red.bold
        : riskLevel.label === "High"
          ? chalk.red
          : riskLevel.label === "Medium"
            ? chalk.yellow
            : chalk.green;

    console.log(
      `${chalk.gray((index + 1).toString().padStart(2))}. ${riskColor(riskLevel.label)} (${entry.risk_score}) - ${chalk.cyan(entry.name)}`
    );
    console.log(`    ${chalk.gray("URL:")} ${entry.url}`);
    console.log(`    ${chalk.gray("User:")} ${entry.username}`);

    // Show risk factors
    if (entry.risk_factors) {
      try {
        const factors = Array.isArray(entry.risk_factors)
          ? entry.risk_factors
          : JSON.parse(entry.risk_factors);
        if (factors.length > 0) {
          console.log(`    ${chalk.gray("Issues:")} ${factors.join(", ")}`);
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }

    // Show breach info if available
    if (entry.breach_info) {
      try {
        const breachInfo = JSON.parse(entry.breach_info);
        if (breachInfo.breached) {
          console.log(
            `    ${chalk.red("🚨 Email found in")} ${chalk.red.bold(breachInfo.count)} ${chalk.red("data breaches")}`
          );
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }

    console.log(`    ${chalk.gray("Action:")} ${riskLevel.description}`);
    console.log("");
  });

  // Show summary
  const riskCounts = entries.reduce(
    (acc, entry) => {
      const level = entry.risk_label || "Unknown";
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    },
    {} as { [key: string]: number }
  );

  console.log(chalk.blue.bold("📊 Risk Distribution:"));
  Object.entries(riskCounts).forEach(([level, count]) => {
    const color =
      level === "Critical"
        ? chalk.red
        : level === "High"
          ? chalk.red
          : level === "Medium"
            ? chalk.yellow
            : chalk.green;
    console.log(`${color(level)}: ${count} accounts`);
  });
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(chalk.blue.bold("🧠 Risk Analysis & Security Reporting Tool\n"));
  console.log("Usage: npm run risk [OPTIONS]\n");
  console.log("Options:");
  console.log(
    "  --calculate-risk     Calculate risk scores for all password entries"
  );
  console.log("  --show-risks         Display risk analysis results (default)");
  console.log(
    "  --limit N            Limit results to top N entries (default: 20)"
  );
  console.log("  --generate-pdf       Generate PDF security audit report");
  console.log("  --pdf-path PATH      Custom path for PDF output");
  console.log("  --all                Calculate risks and generate PDF report");
  console.log("  --help, -h           Show this help message\n");
  console.log("Examples:");
  console.log("  npm run risk --calculate-risk");
  console.log("  npm run risk --show-risks --limit 10");
  console.log(
    "  npm run risk --generate-pdf --pdf-path ./my-security-report.pdf"
  );
  console.log("  npm run risk --all");
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Show help
  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    return;
  }

  try {
    // Calculate risk scores
    if (args.includes("--calculate-risk") || args.includes("--all")) {
      console.log(
        chalk.blue("🧮 Calculating risk scores for all entries...\n")
      );
      await updateAllRiskScores();
      console.log("");
    }

    // Generate PDF report
    if (args.includes("--generate-pdf") || args.includes("--all")) {
      const pdfPathIndex = args.indexOf("--pdf-path");
      const customPath =
        pdfPathIndex !== -1 && args[pdfPathIndex + 1]
          ? args[pdfPathIndex + 1]
          : undefined;

      console.log(chalk.blue("📄 Generating PDF security audit report...\n"));
      const pdfPath = await generatePDFSecurityReport(customPath);
      console.log("");
    }

    // Show risk analysis (default behavior if no specific action)
    if (
      args.includes("--show-risks") ||
      (!args.includes("--calculate-risk") &&
        !args.includes("--generate-pdf") &&
        !args.includes("--all"))
    ) {
      const limitIndex = args.indexOf("--limit");
      const limit =
        limitIndex !== -1 && args[limitIndex + 1]
          ? parseInt(args[limitIndex + 1])
          : 20;

      await displayRiskAnalysis(limit);
    }
  } catch (error) {
    console.error(chalk.red("❌ Error during risk analysis:"), error.message);
    process.exit(1);
  }
}

// Handle EPIPE errors gracefully when output is piped
process.stdout.on("error", (err) => {
  if (err.code === "EPIPE") {
    process.exit(0);
  }
  throw err;
});

// Run main function
main().catch((error) => {
  console.error(chalk.red("❌ Unexpected error:"), error);
  process.exit(1);
});
