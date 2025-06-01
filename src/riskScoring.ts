// riskScoring.ts - Comprehensive risk scoring system for password entries

import sqlite3 from "sqlite3";
import { open } from "sqlite";
import chalk from "chalk";
import crypto from "crypto";
import { dbPath } from "./database.js";

// Risk scoring weights and categories
export interface RiskWeights {
  compromisedPassword: number;
  emailBreachesPerBreach: number;
  criticalAccountCategory: number;
  oldPasswordAge: number;
  weakPassword: number;
  duplicatePassword: number;
  noTwoFactorAuth: number;
}

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  compromisedPassword: 50, // Major red flag
  emailBreachesPerBreach: 10, // 10 points per breach (max 50)
  criticalAccountCategory: 30, // Banking, work, etc.
  oldPasswordAge: 15, // More than 12 months old
  weakPassword: 20, // Short, simple passwords
  duplicatePassword: 15, // Same password used elsewhere
  noTwoFactorAuth: 10, // No 2FA indication
};

export interface RiskLevel {
  score: number;
  label: "Low" | "Medium" | "High" | "Critical";
  color: string;
  description: string;
}

export interface PasswordEntry {
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
  risk_score?: number;
  risk_label?: string;
  risk_factors?: string[];
}

// Critical account categories (case-insensitive matching)
const CRITICAL_CATEGORIES = [
  // Banking & Finance
  "bank",
  "banking",
  "financial",
  "finance",
  "paypal",
  "venmo",
  "cash",
  "investment",
  "trading",
  "crypto",
  "bitcoin",
  "wallet",
  "credit",
  "loan",
  "mortgage",

  // Work & Professional
  "work",
  "office",
  "company",
  "corporate",
  "enterprise",
  "business",
  "professional",
  "gmail",
  "outlook",
  "email",
  "microsoft",
  "google",
  "aws",
  "azure",
  "office365",

  // Government & Legal
  "government",
  "gov",
  "irs",
  "tax",
  "legal",
  "court",
  "dmv",
  "social security",

  // Healthcare
  "health",
  "medical",
  "hospital",
  "doctor",
  "pharmacy",
  "insurance",

  // Critical Infrastructure
  "utility",
  "electric",
  "gas",
  "water",
  "internet",
  "phone",
  "mobile",
];

/**
 * Determine risk level based on score
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score >= 80) {
    return {
      score,
      label: "Critical",
      color: "#8B0000", // Dark red
      description: "Immediate action required - change this password now!",
    };
  } else if (score >= 60) {
    return {
      score,
      label: "High",
      color: "#FF0000", // Red
      description: "High risk - change this password soon",
    };
  } else if (score >= 30) {
    return {
      score,
      label: "Medium",
      color: "#FFA500", // Orange
      description: "Moderate risk - consider updating this password",
    };
  } else {
    return {
      score,
      label: "Low",
      color: "#008000", // Green
      description: "Low risk - password appears secure",
    };
  }
}

/**
 * Check if account is in a critical category
 */
export function isCriticalAccount(name: string, url: string): boolean {
  const searchText = `${name} ${url}`.toLowerCase();
  return CRITICAL_CATEGORIES.some((category) => searchText.includes(category));
}

/**
 * Calculate password strength score (0-100, lower is weaker)
 */
export function calculatePasswordStrength(password: string): number {
  if (!password) return 100; // No password = very weak, max penalty

  let weaknessScore = 0;

  // Length penalty
  if (password.length < 8) weaknessScore += 30;
  else if (password.length < 12) weaknessScore += 15;

  // Character variety
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigits = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  const charTypes = [hasLower, hasUpper, hasDigits, hasSpecial].filter(
    Boolean
  ).length;
  if (charTypes < 2) weaknessScore += 25;
  else if (charTypes < 3) weaknessScore += 15;
  else if (charTypes < 4) weaknessScore += 5;

  // Common patterns (case insensitive)
  const lowerPassword = password.toLowerCase();
  const commonPatterns = [
    "password",
    "123456",
    "qwerty",
    "abc123",
    "admin",
    "letmein",
    "welcome",
    "monkey",
    "111111",
    "dragon",
    "master",
    "princess",
  ];

  if (commonPatterns.some((pattern) => lowerPassword.includes(pattern))) {
    weaknessScore += 40;
  }

  // Sequential patterns
  if (/123|abc|qwe|asd|zxc/i.test(password)) {
    weaknessScore += 20;
  }

  // Repeated characters
  if (/(.)\1{2,}/.test(password)) {
    weaknessScore += 15;
  }

  return Math.min(100, weaknessScore);
}

/**
 * Check if password is older than specified months
 */
export function isPasswordOld(
  lastCheckedAt: string | null,
  monthsThreshold = 12
): boolean {
  if (!lastCheckedAt) return true; // Unknown age = assume old

  const lastCheck = new Date(lastCheckedAt);
  const monthsAgo = new Date();
  monthsAgo.setMonth(monthsAgo.getMonth() - monthsThreshold);

  return lastCheck < monthsAgo;
}

/**
 * Calculate comprehensive risk score for a password entry
 */
export function calculateRiskScore(
  entry: PasswordEntry,
  allEntries: PasswordEntry[],
  weights: RiskWeights = DEFAULT_RISK_WEIGHTS
): { score: number; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  // 1. Compromised password (highest priority)
  if (entry.compromised === true) {
    score += weights.compromisedPassword;
    factors.push("Password found in data breaches");
  }

  // 2. Email found in breaches
  if (entry.breach_info) {
    try {
      const breachInfo = JSON.parse(entry.breach_info);
      if (breachInfo.breached && breachInfo.count) {
        const breachScore = Math.min(
          breachInfo.count * weights.emailBreachesPerBreach,
          50
        );
        score += breachScore;
        factors.push(
          `Email found in ${breachInfo.count} data breach${breachInfo.count > 1 ? "es" : ""}`
        );
      }
    } catch (e) {
      // Invalid JSON, skip
    }
  }

  // 3. Critical account category
  if (isCriticalAccount(entry.name, entry.url)) {
    score += weights.criticalAccountCategory;
    factors.push("Critical account category (banking, work, etc.)");
  }

  // 4. Password age
  if (isPasswordOld(entry.last_checked_at)) {
    score += weights.oldPasswordAge;
    factors.push("Password not updated in over 12 months");
  }

  // 5. Weak password
  const passwordWeakness = calculatePasswordStrength(entry.password);
  if (passwordWeakness > 0) {
    const weaknessScore = Math.round(
      (passwordWeakness / 100) * weights.weakPassword
    );
    score += weaknessScore;
    if (passwordWeakness > 50) {
      factors.push("Very weak password");
    } else if (passwordWeakness > 25) {
      factors.push("Weak password");
    }
  }

  // 6. Duplicate password
  const duplicateCount = allEntries.filter(
    (other) =>
      other.id !== entry.id &&
      other.password === entry.password &&
      entry.password
  ).length;

  if (duplicateCount > 0) {
    score += weights.duplicatePassword;
    factors.push(`Password reused across ${duplicateCount + 1} accounts`);
  }

  return { score: Math.min(100, Math.round(score)), factors };
}

/**
 * Update risk scores for all entries in the database
 */
export async function updateAllRiskScores(): Promise<void> {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  try {
    // Add risk columns if they don't exist
    await db
      .exec(
        `
      ALTER TABLE pw_entries ADD COLUMN risk_score INTEGER DEFAULT NULL;
    `
      )
      .catch(() => {}); // Ignore if column already exists

    await db
      .exec(
        `
      ALTER TABLE pw_entries ADD COLUMN risk_label TEXT DEFAULT NULL;
    `
      )
      .catch(() => {}); // Ignore if column already exists

    await db
      .exec(
        `
      ALTER TABLE pw_entries ADD COLUMN risk_factors TEXT DEFAULT NULL;
    `
      )
      .catch(() => {}); // Ignore if column already exists

    // Get all entries
    const entries: PasswordEntry[] = await db.all(`
      SELECT id, name, url, username, password, compromised, source,
             last_checked_at, notes, breach_info
      FROM pw_entries
    `);

    console.log(
      chalk.blue(`🧮 Calculating risk scores for ${entries.length} entries...`)
    );

    // Calculate risk scores for all entries
    for (const entry of entries) {
      const { score, factors } = calculateRiskScore(entry, entries);
      const riskLevel = getRiskLevel(score);

      await db.run(
        `
        UPDATE pw_entries
        SET risk_score = ?, risk_label = ?, risk_factors = ?
        WHERE id = ?
      `,
        [score, riskLevel.label, JSON.stringify(factors), entry.id]
      );
    }

    console.log(chalk.green("✅ Risk scores updated successfully!"));

    // Show summary statistics
    const riskStats = await db.all(`
      SELECT risk_label, COUNT(*) as count
      FROM pw_entries
      WHERE risk_label IS NOT NULL
      GROUP BY risk_label
      ORDER BY
        CASE risk_label
          WHEN 'Critical' THEN 1
          WHEN 'High' THEN 2
          WHEN 'Medium' THEN 3
          WHEN 'Low' THEN 4
        END
    `);

    console.log(chalk.blue.bold("\n📊 Risk Assessment Summary:"));
    for (const stat of riskStats) {
      const color =
        stat.risk_label === "Critical"
          ? chalk.red
          : stat.risk_label === "High"
            ? chalk.red
            : stat.risk_label === "Medium"
              ? chalk.yellow
              : chalk.green;
      console.log(`${color(`${stat.risk_label}:`)} ${stat.count} accounts`);
    }
  } catch (error) {
    console.error(chalk.red("❌ Error updating risk scores:"), error);
    throw error;
  } finally {
    await db.close();
  }
}

/**
 * Get entries sorted by risk score
 */
export async function getEntriesByRisk(
  limit?: number
): Promise<PasswordEntry[]> {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  try {
    let query = `
      SELECT id, name, url, username, password, compromised, source,
             last_checked_at, notes, breach_info, risk_score, risk_label, risk_factors
      FROM pw_entries
      WHERE risk_score IS NOT NULL
      ORDER BY risk_score DESC, name ASC
    `;

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const entries = await db.all(query);
    return entries;
  } finally {
    await db.close();
  }
}
