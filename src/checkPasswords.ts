import crypto from "crypto";
import fetch from "node-fetch";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../db/pw_entries.sqlite");

// Hash a password using SHA1 (as used by HIBP)
function hashPassword(password: string): string {
  return crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
}

// Check a single password against HIBP API
async function checkPasswordAgainstHIBP(
  password: string | null
): Promise<boolean> {
  // Skip null passwords (e.g., from Chrome import)
  if (!password) {
    return false;
  }

  try {
    const passwordHash = hashPassword(password);
    const hashPrefix = passwordHash.substring(0, 5);
    const hashSuffix = passwordHash.substring(5);

    // Use k-anonymity model - only send first 5 chars of hash
    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${hashPrefix}`
    );

    if (!response.ok) {
      throw new Error(
        `HIBP API error: ${response.status} ${response.statusText}`
      );
    }

    const text = await response.text();
    const hashes = text.split("\r\n");

    // Check if our hash suffix is in the returned list
    for (const hash of hashes) {
      const [returnedHashSuffix, count] = hash.split(":");
      if (returnedHashSuffix === hashSuffix) {
        return true; // Password has been compromised
      }
    }

    return false; // Password not found in breaches
  } catch (error) {
    console.error(chalk.red(`Error checking password: ${error}`));
    return false;
  }
}

// Check all passwords in the database
export async function checkAllPasswords(limit?: number): Promise<void> {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  try {
    console.log(chalk.blue("🔍 Checking passwords against HIBP database..."));

    // Get all passwords from database
    const rows = await db.all(
      "SELECT id, password FROM pw_entries WHERE compromised IS NULL"
    );

    const limitedRows = limit ? rows.slice(0, limit) : rows;

    console.log(
      chalk.blue(`🔍 Found ${limitedRows.length} passwords to check.`)
    );

    let compromisedCount = 0;
    let skippedCount = 0;

    // Add a small delay between requests to respect API rate limits
    for (let i = 0; i < limitedRows.length; i++) {
      const row = limitedRows[i];

      if (row.password === null) {
        console.log(
          chalk.yellow(
            `⚠️  Password #${row.id} is missing (likely from Chrome import).`
          )
        );
        // Mark as unchecked but not null to avoid rechecking
        await db.run(
          'UPDATE pw_entries SET last_checked_at = datetime("now"), notes = "Missing password" WHERE id = ?',
          row.id
        );
        skippedCount++;
        continue;
      }

      const isCompromised = await checkPasswordAgainstHIBP(row.password);

      // Update the database with the result
      await db.run(
        'UPDATE pw_entries SET compromised = ?, last_checked_at = datetime("now") WHERE id = ?',
        isCompromised ? 1 : 0,
        row.id
      );

      if (isCompromised) {
        compromisedCount++;
        console.log(chalk.red(`⚠️  Password #${row.id} is compromised!`));
      } else {
        console.log(chalk.green(`✅ Password #${row.id} is safe.`));
      }

      // Small delay to prevent API rate limiting
      if (i < limitedRows.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    console.log(
      chalk.blue(
        `\n📊 Results: ${compromisedCount} compromised, ${
          limitedRows.length - compromisedCount - skippedCount
        } safe, ${skippedCount} skipped (missing passwords)`
      )
    );
  } catch (error) {
    console.error(chalk.red(`❌ Error checking passwords: ${error}`));
  } finally {
    await db.close();
  }
}
