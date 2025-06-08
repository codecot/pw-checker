#!/usr/bin/env node

import { open } from "sqlite";
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { normalizeDomain, getDomainScore } from "./domainNormalizer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../db/pw_entries.sqlite");

interface SiteCredential {
  id: number;
  name: string;
  url: string;
  username: string;
  password: string;
  source: string;
  risk_score: number | null;
  risk_label: string | null;
  compromised: number;
  breach_info: string | null;
  date_last_used: string | null;
  date_created: string | null;
  normalized_domain: string;
  category: string | null;
}

function showHelp() {
  console.log(chalk.blue("🧭 Site Credential Query Tool"));
  console.log("");
  console.log(chalk.yellow("Description:"));
  console.log(
    "  Query credentials by site/domain with smart matching and detailed display"
  );
  console.log("");
  console.log(chalk.yellow("Usage:"));
  console.log("  npm run view:site --site=example.com");
  console.log("  npm run view:site --site=google");
  console.log("  npm run view:site --site=github.com --show-passwords");
  console.log("");
  console.log(chalk.yellow("Options:"));
  console.log(
    "  --site=DOMAIN        Search for credentials by domain (required)"
  );
  console.log("  --show-passwords     Show actual passwords (default: masked)");
  console.log(
    "  --exact-match        Require exact domain match (no fuzzy search)"
  );
  console.log("  --json               Output results in JSON format");
  console.log("  --help               Show this help message");
  console.log("");
  console.log(chalk.yellow("Examples:"));
  console.log("  npm run view:site --site=google.com");
  console.log("  npm run view:site --site=github");
  console.log("  npm run view:site --site=amazon --show-passwords");
  console.log("  npm run view:site --site=netflix.com --exact-match");
  console.log("");
  console.log(chalk.yellow("Search Features:"));
  console.log(
    "  • Smart domain normalization (removes www, handles subdomains)"
  );
  console.log("  • Fuzzy matching (searches partial domain names)");
  console.log(
    "  • Special handling for common services (Google, Microsoft, etc.)"
  );
  console.log("  • Results ranked by relevance");
}

function maskPassword(password: string): string {
  if (!password) return chalk.gray("(empty)");
  if (password.length <= 4) {
    return "*".repeat(password.length);
  }
  return (
    password.substring(0, 2) +
    "*".repeat(password.length - 4) +
    password.substring(password.length - 2)
  );
}

function formatLastUsed(dateStr: string | null): string {
  if (!dateStr) return chalk.gray("Never");

  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return chalk.green("Today");
    if (diffDays === 1) return chalk.green("Yesterday");
    if (diffDays < 7) return chalk.green(`${diffDays} days ago`);
    if (diffDays < 30)
      return chalk.yellow(`${Math.floor(diffDays / 7)} weeks ago`);
    if (diffDays < 365)
      return chalk.yellow(`${Math.floor(diffDays / 30)} months ago`);
    return chalk.red(`${Math.floor(diffDays / 365)} years ago`);
  } catch {
    return chalk.gray("Invalid date");
  }
}

function getRiskColor(
  riskLabel: string | null,
  riskScore: number | null
): chalk.Chalk {
  if (!riskLabel) return chalk.gray;

  switch (riskLabel.toLowerCase()) {
    case "critical":
      return chalk.red;
    case "high":
      return chalk.redBright;
    case "medium":
      return chalk.yellow;
    case "low":
      return chalk.green;
    default:
      return chalk.gray;
  }
}

function getSourceIcon(source: string): string {
  switch (source.toLowerCase()) {
    case "chrome":
      return "🌐";
    case "bitwarden":
      return "🔐";
    case "csv":
      return "📄";
    default:
      return "📝";
  }
}

function displayCredentialsTable(
  credentials: SiteCredential[],
  showPasswords: boolean,
  searchTerm: string
) {
  if (credentials.length === 0) {
    console.log(chalk.yellow(`📭 No credentials found for "${searchTerm}"`));
    console.log("");
    console.log(chalk.gray("💡 Try:"));
    console.log(
      chalk.gray(
        "  • A broader search term (e.g., 'google' instead of 'accounts.google.com')"
      )
    );
    console.log(chalk.gray("  • Removing --exact-match if you used it"));
    console.log(
      chalk.gray("  • Running 'npm run view:all' to see all available domains")
    );
    return;
  }

  console.log(
    chalk.blue(
      `🔍 Found ${credentials.length} credential(s) for "${searchTerm}":`
    )
  );
  console.log("");

  credentials.forEach((cred, index) => {
    const riskColor = getRiskColor(cred.risk_label, cred.risk_score);
    const compromisedBadge = cred.compromised
      ? chalk.red("🚨 COMPROMISED")
      : "";
    const breachBadge =
      cred.breach_info && cred.breach_info.includes('"breached":true')
        ? chalk.red("💥 BREACHED")
        : "";
    const sourceIcon = getSourceIcon(cred.source);

    console.log(chalk.cyan(`${index + 1}. ${cred.name || cred.url}`));
    console.log(`   ${chalk.gray("🌐 URL:")} ${cred.url}`);
    console.log(
      `   ${chalk.gray("🏷️  Domain:")} ${chalk.white(cred.normalized_domain)}`
    );
    console.log(
      `   ${chalk.gray("👤 Username:")} ${chalk.white(cred.username || chalk.gray("(none)"))}`
    );

    if (showPasswords) {
      console.log(
        `   ${chalk.gray("🔑 Password:")} ${chalk.white(cred.password || chalk.gray("(empty)"))}`
      );
    } else {
      console.log(
        `   ${chalk.gray("🔑 Password:")} ${chalk.gray(maskPassword(cred.password))} ${chalk.gray("(use --show-passwords to reveal)")}`
      );
    }

    console.log(
      `   ${chalk.gray("📦 Source:")} ${sourceIcon} ${chalk.blue(cred.source.toUpperCase())}`
    );

    if (cred.category) {
      console.log(
        `   ${chalk.gray("🏢 Category:")} ${chalk.magenta(cred.category)}`
      );
    }

    if (cred.risk_label && cred.risk_score !== null) {
      console.log(
        `   ${chalk.gray("⚠️  Risk:")} ${riskColor(cred.risk_label.toUpperCase())} ${chalk.gray(`(${cred.risk_score}/100)`)}`
      );
    }

    console.log(
      `   ${chalk.gray("🕒 Last Used:")} ${formatLastUsed(cred.date_last_used)}`
    );

    if (compromisedBadge || breachBadge) {
      console.log(
        `   ${chalk.gray("🔴 Status:")} ${compromisedBadge} ${breachBadge}`
      );
    }

    console.log("");
  });
}

function displayCredentialsJson(
  credentials: SiteCredential[],
  showPasswords: boolean
) {
  const output = credentials.map((cred) => {
    const result: any = {
      id: cred.id,
      name: cred.name,
      url: cred.url,
      username: cred.username,
      source: cred.source,
      normalized_domain: cred.normalized_domain,
      category: cred.category,
      risk_score: cred.risk_score,
      risk_label: cred.risk_label,
      compromised: Boolean(cred.compromised),
      date_last_used: cred.date_last_used,
      date_created: cred.date_created,
    };

    if (showPasswords) {
      result.password = cred.password;
    }

    if (cred.breach_info) {
      try {
        result.breach_info = JSON.parse(cred.breach_info);
      } catch {
        result.breach_info = cred.breach_info;
      }
    }

    return result;
  });

  console.log(JSON.stringify(output, null, 2));
}

async function ensureNormalizedDomainColumn(db: any): Promise<boolean> {
  const columns = await db.all("PRAGMA table_info(pw_entries)");
  const hasNormalizedDomain = columns.some(
    (col: any) => col.name === "normalized_domain"
  );

  if (!hasNormalizedDomain) {
    console.log(
      chalk.yellow(
        "⚠️  Database schema needs updating for site search functionality."
      )
    );
    console.log(chalk.blue("Run: npm run db:update-schema"));
    return false;
  }

  return true;
}

async function querySite() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    showHelp();
    return;
  }

  const siteArg = args.find((arg) => arg.startsWith("--site="));
  if (!siteArg) {
    console.log(chalk.red("❌ Error: --site parameter is required"));
    console.log("");
    showHelp();
    process.exit(1);
  }

  const searchTerm = siteArg.split("=")[1];
  const showPasswords = args.includes("--show-passwords");
  const exactMatch = args.includes("--exact-match");
  const jsonOutput = args.includes("--json");

  if (!searchTerm) {
    console.log(chalk.red("❌ Error: Site parameter cannot be empty"));
    process.exit(1);
  }

  try {
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    const hasSchema = await ensureNormalizedDomainColumn(db);
    if (!hasSchema) {
      await db.close();
      process.exit(1);
    }

    let query: string;
    let params: any[];

    if (exactMatch) {
      const normalizedSearch = normalizeDomain(searchTerm);
      query = `
        SELECT * FROM pw_entries 
        WHERE normalized_domain = ?
        ORDER BY risk_score DESC NULLS LAST, name ASC
      `;
      params = [normalizedSearch];
    } else {
      // Flexible search - search in normalized_domain, url, and name
      const searchPattern = `%${searchTerm.toLowerCase()}%`;
      query = `
        SELECT * FROM pw_entries 
        WHERE 
          LOWER(normalized_domain) LIKE ? OR
          LOWER(url) LIKE ? OR
          LOWER(name) LIKE ?
        ORDER BY 
          CASE 
            WHEN LOWER(normalized_domain) = ? THEN 1
            WHEN LOWER(normalized_domain) LIKE ? THEN 2
            WHEN LOWER(url) LIKE ? THEN 3
            ELSE 4
          END,
          risk_score DESC NULLS LAST, 
          name ASC
      `;
      const exactPattern = searchTerm.toLowerCase();
      params = [
        searchPattern,
        searchPattern,
        searchPattern,
        exactPattern,
        `%${exactPattern}%`,
        `%${exactPattern}%`,
      ];
    }

    const credentials: SiteCredential[] = await db.all(query, params);

    await db.close();

    if (jsonOutput) {
      displayCredentialsJson(credentials, showPasswords);
    } else {
      displayCredentialsTable(credentials, showPasswords, searchTerm);
    }
  } catch (error) {
    console.error(
      chalk.red(
        `❌ Error querying site: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  querySite();
}

export { querySite };
