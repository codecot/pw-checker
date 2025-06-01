import fetch from "node-fetch";
import chalk from "chalk";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../db/pw_entries.sqlite");

// HIBP API key - you would need to get this from https://haveibeenpwned.com/API/Key
// Free tier allows basic searches, paid tier provides more detailed breach info
const HIBP_API_KEY = process.env.HIBP_API_KEY || "";

interface BreachInfo {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  AddedDate: string;
  DataClasses: string[];
  Description: string;
}

/**
 * Check if an email/username has been part of a data breach
 * This requires an API key from HIBP for detailed info
 */
export async function checkBreachInfo(
  username: string
): Promise<BreachInfo[] | null> {
  if (!HIBP_API_KEY) {
    console.log(
      chalk.yellow(
        "⚠️ No HIBP API key found. Set HIBP_API_KEY environment variable for detailed breach information."
      )
    );
    return null;
  }

  try {
    // HIBP API call to check for breaches for this account
    const response = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(
        username
      )}`,
      {
        method: "GET",
        headers: {
          "User-Agent": "pw-checker-cli-tool",
          "hibp-api-key": HIBP_API_KEY,
        },
      }
    );

    // If 404, the account was not found in any breaches
    if (response.status === 404) {
      return [];
    }

    // If not OK and not 404, there was an error
    if (!response.ok) {
      if (response.status === 429) {
        console.log(
          chalk.yellow("⚠️ Rate limit exceeded for HIBP API. Try again later.")
        );
      } else {
        console.log(
          chalk.red(
            `❌ Error checking breach info: ${response.status} ${response.statusText}`
          )
        );
      }
      return null;
    }

    // Parse the response as breach info
    const breaches: BreachInfo[] = (await response.json()) as BreachInfo[];
    return breaches;
  } catch (error) {
    console.error(chalk.red(`❌ Error checking breach info: ${error}`));
    return null;
  }
}

/**
 * Check breach information for all accounts in the database
 */
export async function checkAllAccountsForBreaches(
  limit?: number
): Promise<void> {
  if (!HIBP_API_KEY) {
    console.log(
      chalk.yellow(
        "⚠️ HIBP API key required for breach checks. Set HIBP_API_KEY environment variable."
      )
    );
    console.log(
      chalk.yellow("ℹ️ Get an API key from https://haveibeenpwned.com/API/Key")
    );
    return;
  }

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  try {
    // First, check if we have the breach_info column
    const tableInfo = await db.all("PRAGMA table_info(pw_entries)");
    const hasBreachInfo = tableInfo.some((col) => col.name === "breach_info");

    if (!hasBreachInfo) {
      // Add the breach_info column if it doesn't exist
      await db.run("ALTER TABLE pw_entries ADD COLUMN breach_info TEXT");
      console.log(chalk.blue("✅ Added breach_info column to database."));
    }

    console.log(chalk.blue("🔍 Checking accounts for data breaches..."));

    // Get all accounts with email-like usernames (most likely to have breach info)
    const accounts = await db.all(
      "SELECT id, username FROM pw_entries WHERE username LIKE '%@%'"
    );

    const limitedAccounts = limit ? accounts.slice(0, limit) : accounts;

    console.log(
      chalk.blue(`🔍 Found ${limitedAccounts.length} email accounts to check.`)
    );

    let breachedCount = 0;
    let safeCount = 0;
    let errorCount = 0;

    // Check each account with a delay to respect rate limits
    for (let i = 0; i < limitedAccounts.length; i++) {
      const account = limitedAccounts[i];
      console.log(chalk.blue(`🔍 Checking account: ${account.username}`));

      const breaches = await checkBreachInfo(account.username);

      if (breaches === null) {
        // Error occurred
        errorCount++;
      } else if (breaches.length === 0) {
        // No breaches found
        await db.run(
          "UPDATE pw_entries SET breach_info = ? WHERE id = ?",
          JSON.stringify({ checked: true, breached: false }),
          account.id
        );
        safeCount++;
        console.log(
          chalk.green(`✅ No breaches found for ${account.username}`)
        );
      } else {
        // Breaches found
        await db.run(
          "UPDATE pw_entries SET breach_info = ? WHERE id = ?",
          JSON.stringify({
            checked: true,
            breached: true,
            count: breaches.length,
            breaches: breaches.map((b) => ({
              name: b.Name,
              title: b.Title,
              domain: b.Domain,
              date: b.BreachDate,
              dataTypes: b.DataClasses,
            })),
          }),
          account.id
        );
        breachedCount++;
        console.log(
          chalk.red(
            `⚠️ Found ${breaches.length} breaches for ${account.username}:`
          )
        );
        breaches.forEach((breach) => {
          console.log(
            chalk.red(
              `  - ${breach.Title} (${breach.Domain}) - ${breach.BreachDate}`
            )
          );
          console.log(
            chalk.yellow(`    Data exposed: ${breach.DataClasses.join(", ")}`)
          );
        });
      }

      // Add delay between requests to respect API rate limits
      if (i < limitedAccounts.length - 1) {
        console.log(chalk.blue("⏳ Waiting for rate limit..."));
        await new Promise((resolve) => setTimeout(resolve, 1600));
      }
    }

    console.log(
      chalk.blue(
        `\n📊 Breach check results: ${breachedCount} breached, ${safeCount} safe, ${errorCount} errors`
      )
    );
  } catch (error) {
    console.error(chalk.red(`❌ Error checking accounts: ${error}`));
  } finally {
    await db.close();
  }
}
