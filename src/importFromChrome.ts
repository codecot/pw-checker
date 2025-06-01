import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import chalk from "chalk";

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../db/pw_entries.sqlite");

/**
 * Get the path to Chrome's Login Data file based on the current OS
 */
function getChromeDbPath(): string {
  const platform = process.platform;
  const homedir = os.homedir();

  if (platform === "linux") {
    return path.join(homedir, ".config/google-chrome/Default/Login Data");
  } else if (platform === "darwin") {
    return path.join(
      homedir,
      "Library/Application Support/Google/Chrome/Default/Login Data"
    );
  } else if (platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA || "",
      "Google/Chrome/User Data/Default/Login Data"
    );
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

/**
 * Copy the Chrome Login Data file to a temporary location
 * (necessary because Chrome locks the database when browser is running)
 */
function copyLoginData(sourcePath: string): string {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Chrome Login Data file not found at ${sourcePath}`);
  }

  const tempPath = path.join(os.tmpdir(), "chrome_login_data_temp");
  fs.copyFileSync(sourcePath, tempPath);
  return tempPath;
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

/**
 * Import Chrome passwords into the database
 */
export async function importFromChrome(): Promise<number> {
  let chromeDbPath: string;
  let tempDbPath: string;

  try {
    chromeDbPath = getChromeDbPath();
    console.log(chalk.blue(`🔍 Found Chrome data at: ${chromeDbPath}`));
    tempDbPath = copyLoginData(chromeDbPath);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`❌ Error accessing Chrome data: ${errorMessage}`));
    return 0;
  }

  try {
    const chromeDb = await open({
      filename: tempDbPath,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READONLY,
    });

    const pwDb = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    // Check if the logins table exists (Chrome uses this table name)
    const tableCheck = await chromeDb.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='logins'"
    );

    if (!tableCheck) {
      console.error(
        chalk.red("❌ Chrome database doesn't contain a logins table")
      );
      return 0;
    }

    // Chrome's login data has encrypted passwords
    // We'll import URLs, usernames, and Chrome's compromise detection
    const rows = await chromeDb.all(`
      SELECT
        l.origin_url,
        l.username_value,
        CASE
          WHEN ic.insecurity_type IS NOT NULL THEN 1
          ELSE 0
        END as chrome_compromised,
        ic.insecurity_type,
        ic.create_time as compromise_detected_at
      FROM logins l
      LEFT JOIN insecure_credentials ic ON l.id = ic.parent_id
    `);

    console.log(
      chalk.blue(`📊 Found ${rows.length} credential entries in Chrome`)
    );

    let importCount = 0;

    for (const row of rows) {
      // Skip entries with empty username
      if (!row.username_value) continue;

      // Check if this entry already exists to avoid duplicates
      const existingEntry = await pwDb.get(
        "SELECT id FROM pw_entries WHERE url = ? AND username = ? AND source = 'chrome'",
        row.origin_url,
        row.username_value
      );

      if (existingEntry) continue;

      // Insert into our database
      const notes = row.chrome_compromised
        ? `Imported from Chrome (password not accessible) - Chrome detected as compromised (type: ${row.insecurity_type})`
        : "Imported from Chrome (password not accessible)";

      await pwDb.run(
        "INSERT INTO pw_entries (name, url, username, source, compromised, notes) VALUES (?, ?, ?, ?, ?, ?)",
        getDomainFromUrl(row.origin_url),
        row.origin_url,
        row.username_value,
        "chrome",
        row.chrome_compromised, // Use Chrome's compromise detection
        notes
      );

      importCount++;
    }

    await chromeDb.close();
    await pwDb.close();

    return importCount;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`❌ Error importing from Chrome: ${errorMessage}`));
    return 0;
  } finally {
    // Clean up the temp file
    try {
      if (tempDbPath && fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        chalk.yellow(
          `⚠️ Warning: Could not delete temporary file: ${errorMessage}`
        )
      );
    }
  }
}
