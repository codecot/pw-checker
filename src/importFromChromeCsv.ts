import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import chalk from "chalk";
import { normalizeDomain } from "./domainNormalizer.js";

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../db/pw_entries.sqlite");

/**
 * Import passwords from a Chrome exported CSV file
 * @param csvPath Path to the CSV file exported from Chrome
 * @returns Number of imported entries
 */
export async function importFromChromeCsv(csvPath: string): Promise<number> {
  if (!fs.existsSync(csvPath)) {
    console.error(chalk.red(`❌ File not found: ${csvPath}`));
    return 0;
  }

  try {
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    let importCount = 0;
    const results: Array<{
      name: string;
      url: string;
      username: string;
      password: string;
      compromised: number;
    }> = [];

    // Process the CSV file
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on("data", (data) => {
          // Chrome's exported CSV has 'name', 'url', 'username', 'password' columns
          // The 'name' might be different or not exist in some exports, so we handle both cases
          const url = data.url || data.origin_url || "";
          const username = data.username || data.username_value || "";
          const password = data.password || data.password_value || "";
          const name = data.name || getDomainFromUrl(url);
          const compromised = data.compromised_type === "Compromised" ? 1 : 0;

          if (url && username && password) {
            results.push({
              name,
              url,
              username,
              password,
              compromised,
            });
          }
        })
        .on("end", () => {
          resolve();
        })
        .on("error", (error) => {
          reject(error);
        });
    });

    console.log(chalk.blue(`📊 Found ${results.length} entries in Chrome CSV`));

    // Import the data into the database
    for (const row of results) {
      const existingEntry = await db.get(
        "SELECT id, password FROM pw_entries WHERE url = ? AND username = ?",
        row.url,
        row.username
      );

      if (existingEntry) {
        // If entry exists but has no password (from Chrome DB import), update it
        if (existingEntry.password === null) {
          const normalizedDomain = normalizeDomain(row.url);
          await db.run(
            "UPDATE pw_entries SET password = ?, notes = ?, normalized_domain = ? WHERE id = ?",
            row.password,
            "Updated with password from Chrome CSV export",
            normalizedDomain,
            existingEntry.id
          );
          importCount++;
          console.log(
            chalk.green(
              `✅ Updated existing entry for ${row.username} at ${getDomainFromUrl(
                row.url
              )} with password`
            )
          );
        }
        continue;
      }

      // Insert new entry
      const normalizedDomain = normalizeDomain(row.url);
      await db.run(
        "INSERT INTO pw_entries (name, url, username, password, compromised, source, normalized_domain) VALUES (?, ?, ?, ?, ?, 'chrome', ?)",
        row.name,
        row.url,
        row.username,
        row.password,
        row.compromised,
        normalizedDomain
      );
      importCount++;
    }

    await db.close();
    return importCount;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      chalk.red(`❌ Error importing from Chrome CSV: ${errorMessage}`)
    );
    return 0;
  }
}

/**
 * Extract domain name from URL
 */
function getDomainFromUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return domain;
  } catch (e) {
    return url;
  }
}
