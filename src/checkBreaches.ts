import dotenv from "dotenv";
import fetch from "node-fetch";
import chalk from "chalk";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables from .env file
dotenv.config();

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../db/pw_entries.sqlite");

// HIBP API key - you would need to get this from https://haveibeenpwned.com/API/Key
// Free tier allows basic searches, paid tier provides more detailed breach info
const HIBP_API_KEY = process.env.HIBP_API_KEY || "";

// Rate limiting configuration for your API plan
const RATE_LIMIT = {
  requestsPerMinute: 10, // Your API limit: 10 requests per minute
  batchSize: 8, // Process 8 accounts per batch (leaving 2 requests as buffer)
  delayBetweenRequests: 7000, // 7 seconds between requests (60s / 10 = 6s + 1s buffer)
  delayBetweenBatches: 70000, // 70 seconds between batches (60s + 10s buffer)
};

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
  username: string,
  retryCount = 0
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
    // Note: truncateResponse=false gives us full details (requires paid API key)
    const response = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(
        username
      )}?truncateResponse=false`,
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

    // If rate limited, implement exponential backoff
    if (response.status === 429) {
      const maxRetries = 3;
      if (retryCount < maxRetries) {
        const waitTime = Math.pow(2, retryCount) * 2000; // 2s, 4s, 8s
        console.log(
          chalk.yellow(
            `⚠️ Rate limit exceeded. Waiting ${waitTime / 1000}s before retry ${retryCount + 1}/${maxRetries}...`
          )
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return checkBreachInfo(username, retryCount + 1);
      } else {
        console.log(
          chalk.yellow(
            "⚠️ Rate limit exceeded for HIBP API. Max retries reached."
          )
        );
        return null;
      }
    }

    // If not OK and not 404/429, there was an error
    if (!response.ok) {
      console.log(
        chalk.red(
          `❌ Error checking breach info: ${response.status} ${response.statusText}`
        )
      );
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
 * Check breach information for all accounts in the database with proper rate limiting
 */
export async function checkAllAccountsForBreaches(
  limit?: number,
  resume = false
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
    console.log(
      chalk.yellow(
        `⚡ Rate limit: ${RATE_LIMIT.requestsPerMinute} requests/minute, batch size: ${RATE_LIMIT.batchSize}`
      )
    );

    // Get distinct email addresses only - this is key optimization!
    // HIBP checks by email address, not by login-password pairs
    // So we only need to check each unique email once
    const whereClause = resume
      ? "WHERE username LIKE '%@%' AND NOT EXISTS (SELECT 1 FROM pw_entries p2 WHERE LOWER(p2.username) = LOWER(pw_entries.username) AND p2.breach_info IS NOT NULL AND p2.breach_info != '')"
      : "WHERE username LIKE '%@%'";

    const accounts = await db.all(`
      SELECT LOWER(username) as username, COUNT(*) as entry_count
      FROM pw_entries
      ${whereClause}
      GROUP BY LOWER(username)
      ORDER BY username
    `);

    console.log(
      chalk.green(
        `💡 Optimization: Found ${accounts.reduce((sum, acc) => sum + acc.entry_count, 0)} total entries, but only ${accounts.length} unique emails to check!`
      )
    );

    const limitedAccounts = limit ? accounts.slice(0, limit) : accounts;

    console.log(
      chalk.blue(
        `🔍 Found ${limitedAccounts.length} unique email addresses to check.`
      )
    );

    if (limitedAccounts.length === 0) {
      console.log(
        chalk.green("✅ No unique email addresses need to be checked.")
      );
      return;
    }

    // Calculate estimated time
    const totalBatches = Math.ceil(
      limitedAccounts.length / RATE_LIMIT.batchSize
    );
    const estimatedMinutes = Math.ceil(
      (totalBatches * RATE_LIMIT.delayBetweenBatches) / 60000
    );
    console.log(
      chalk.blue(
        `⏱️ Estimated time: ~${estimatedMinutes} minutes for ${totalBatches} batches`
      )
    );

    let breachedCount = 0;
    let safeCount = 0;
    let errorCount = 0;

    // Process accounts in batches
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * RATE_LIMIT.batchSize;
      const batchEnd = Math.min(
        batchStart + RATE_LIMIT.batchSize,
        limitedAccounts.length
      );
      const batch = limitedAccounts.slice(batchStart, batchEnd);

      console.log(
        chalk.blue(
          `\n📦 Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} accounts)`
        )
      );

      // Process each account in the batch with proper delays
      for (let i = 0; i < batch.length; i++) {
        const account = batch[i];
        const entriesAffected = account.entry_count;
        console.log(
          chalk.blue(
            `🔍 [${batchStart + i + 1}/${limitedAccounts.length}] Checking: ${account.username} (affects ${entriesAffected} entries)`
          )
        );

        const breaches = await checkBreachInfo(account.username);

        if (breaches === null) {
          // Error occurred
          errorCount++;
        } else if (breaches.length === 0) {
          // No breaches found - update all instances of this username
          const result = await db.run(
            "UPDATE pw_entries SET breach_info = ? WHERE LOWER(username) = LOWER(?)",
            JSON.stringify({
              checked: true,
              breached: false,
              checkedAt: new Date().toISOString(),
            }),
            account.username
          );
          safeCount++;
          console.log(
            chalk.green(
              `✅ No breaches found for ${account.username} (updated ${result.changes} entries)`
            )
          );
        } else {
          // Sort breaches by date (newest first) before processing
          const sortedBreaches = [...breaches].sort((a, b) => {
            const dateA = new Date(a.BreachDate || "1970-01-01");
            const dateB = new Date(b.BreachDate || "1970-01-01");
            return dateB.getTime() - dateA.getTime();
          });

          // Breaches found - update all instances of this username
          const result = await db.run(
            "UPDATE pw_entries SET breach_info = ? WHERE LOWER(username) = LOWER(?)",
            JSON.stringify({
              checked: true,
              breached: true,
              count: sortedBreaches.length,
              checkedAt: new Date().toISOString(),
              breaches: sortedBreaches.map((b) => ({
                name: b.Name || "Unknown",
                title: b.Title || "Unknown",
                domain: b.Domain || "Unknown",
                date: b.BreachDate || "Unknown",
                dataTypes: Array.isArray(b.DataClasses) ? b.DataClasses : [],
              })),
            }),
            account.username
          );
          breachedCount++;
          console.log(
            chalk.red(
              `⚠️ Found ${sortedBreaches.length} breaches for ${account.username} (updated ${result.changes} entries):`
            )
          );
          sortedBreaches.slice(0, 3).forEach((breach) => {
            // Show only first 3 breaches for brevity
            console.log(
              chalk.red(
                `  - ${breach.Title || "Unknown"} (${breach.Domain || "Unknown"}) - ${breach.BreachDate || "Unknown"}`
              )
            );
          });
          if (sortedBreaches.length > 3) {
            console.log(
              chalk.gray(`  ... and ${sortedBreaches.length - 3} more breaches`)
            );
          }
        }

        // Add delay between requests within the batch (except for last request)
        if (i < batch.length - 1) {
          console.log(
            chalk.gray(
              `⏳ Waiting ${RATE_LIMIT.delayBetweenRequests / 1000}s...`
            )
          );
          await new Promise((resolve) =>
            setTimeout(resolve, RATE_LIMIT.delayBetweenRequests)
          );
        }
      }

      // Progress summary for this batch
      console.log(
        chalk.blue(
          `📊 Batch ${batchIndex + 1} complete: ${batch.length} accounts processed`
        )
      );

      // Add delay between batches (except for last batch)
      if (batchIndex < totalBatches - 1) {
        const remainingBatches = totalBatches - batchIndex - 1;
        const remainingMinutes = Math.ceil(
          (remainingBatches * RATE_LIMIT.delayBetweenBatches) / 60000
        );
        console.log(
          chalk.yellow(
            `⏸️ Waiting ${RATE_LIMIT.delayBetweenBatches / 1000}s before next batch...`
          )
        );
        console.log(
          chalk.gray(
            `📈 Progress: ${(((batchIndex + 1) / totalBatches) * 100).toFixed(1)}% | ETA: ~${remainingMinutes} minutes`
          )
        );

        // Show countdown for long waits
        let remaining = RATE_LIMIT.delayBetweenBatches;
        while (remaining > 0) {
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
          process.stdout.write(
            `\r⏱️ Next batch in: ${minutes}:${seconds.toString().padStart(2, "0")}`
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
          remaining -= 1000;
        }
        console.log("\n"); // New line after countdown
      }
    }

    console.log(
      chalk.blue(
        `\n🏁 Final results: ${breachedCount} breached, ${safeCount} safe, ${errorCount} errors`
      )
    );

    if (errorCount > 0) {
      console.log(
        chalk.yellow(
          `💡 Run with --resume flag to continue checking remaining accounts.`
        )
      );
    }
  } catch (error) {
    console.error(chalk.red(`❌ Error checking accounts: ${error}`));
  } finally {
    await db.close();
  }
}

/**
 * Get progress information about breach checking
 */
export async function getBreachCheckProgress(): Promise<{
  total: number;
  checked: number;
  breached: number;
  safe: number;
  remaining: number;
  totalEntries: number;
  entriesAffected: number;
}> {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  try {
    // Get total unique email addresses
    const totalResult = await db.get(`
      SELECT COUNT(DISTINCT LOWER(username)) as total
      FROM pw_entries
      WHERE username LIKE '%@%'
    `);

    // Get total entries (for reference)
    const totalEntriesResult = await db.get(`
      SELECT COUNT(*) as total_entries
      FROM pw_entries
      WHERE username LIKE '%@%'
    `);

    // Get checked unique email addresses
    const checkedResult = await db.get(`
      SELECT COUNT(DISTINCT LOWER(username)) as checked
      FROM pw_entries
      WHERE username LIKE '%@%'
      AND breach_info IS NOT NULL
      AND breach_info != ''
    `);

    // Get entries that have been checked (affected by breach checks)
    const entriesAffectedResult = await db.get(`
      SELECT COUNT(*) as entries_affected
      FROM pw_entries
      WHERE username LIKE '%@%'
      AND breach_info IS NOT NULL
      AND breach_info != ''
    `);

    // Get breached unique email addresses
    const breachedResult = await db.get(`
      SELECT COUNT(DISTINCT LOWER(username)) as breached
      FROM pw_entries
      WHERE username LIKE '%@%'
      AND breach_info LIKE '%"breached":true%'
    `);

    // Get safe unique email addresses
    const safeResult = await db.get(`
      SELECT COUNT(DISTINCT LOWER(username)) as safe
      FROM pw_entries
      WHERE username LIKE '%@%'
      AND breach_info LIKE '%"breached":false%'
    `);

    const total = totalResult?.total || 0;
    const checked = checkedResult?.checked || 0;
    const breached = breachedResult?.breached || 0;
    const safe = safeResult?.safe || 0;
    const remaining = total - checked;
    const totalEntries = totalEntriesResult?.total_entries || 0;
    const entriesAffected = entriesAffectedResult?.entries_affected || 0;

    return {
      total,
      checked,
      breached,
      safe,
      remaining,
      totalEntries,
      entriesAffected,
    };
  } finally {
    await db.close();
  }
}

/**
 * Run breach checks in scheduled mode - processes a small batch and exits
 * Perfect for cron jobs or task schedulers
 */
export async function runScheduledBreachCheck(batchSize = 8): Promise<boolean> {
  console.log(
    chalk.blue(`🕐 Running scheduled breach check (batch size: ${batchSize})`)
  );

  const progress = await getBreachCheckProgress();

  if (progress.remaining === 0) {
    console.log(chalk.green("✅ All accounts have been checked for breaches."));
    return true; // Completed
  }

  console.log(
    chalk.blue(
      `📊 Progress: ${progress.checked}/${progress.total} checked (${progress.remaining} remaining)`
    )
  );
  console.log(
    chalk.blue(
      `📊 Results so far: ${progress.breached} breached, ${progress.safe} safe`
    )
  );

  // Run a single batch
  await checkAllAccountsForBreaches(batchSize, true);

  // Check if we're done
  const newProgress = await getBreachCheckProgress();
  return newProgress.remaining === 0;
}

/**
 * Display breach check statistics
 */
export async function showBreachStatistics(): Promise<void> {
  const progress = await getBreachCheckProgress();

  console.log(chalk.blue.bold("📊 Breach Check Statistics\n"));
  console.log(`Total unique email addresses: ${chalk.bold(progress.total)}`);
  console.log(`Total password entries: ${chalk.bold(progress.totalEntries)}`);
  console.log(
    `Unique emails checked: ${chalk.bold(progress.checked)} (${((progress.checked / progress.total) * 100).toFixed(1)}%)`
  );
  console.log(
    `Password entries affected: ${chalk.bold(progress.entriesAffected)} (${((progress.entriesAffected / progress.totalEntries) * 100).toFixed(1)}%)`
  );
  console.log(`Unique emails breached: ${chalk.red.bold(progress.breached)}`);
  console.log(`Unique emails safe: ${chalk.green.bold(progress.safe)}`);
  console.log(`Remaining to check: ${chalk.yellow.bold(progress.remaining)}`);

  if (progress.remaining > 0) {
    const estimatedBatches = Math.ceil(
      progress.remaining / RATE_LIMIT.batchSize
    );
    const estimatedMinutes = Math.ceil(
      (estimatedBatches * RATE_LIMIT.delayBetweenBatches) / 60000
    );
    console.log(
      `\nEstimated time to complete: ${chalk.bold(`~${estimatedMinutes} minutes`)} (${estimatedBatches} batches)`
    );
    console.log(
      chalk.gray(`Rate limit: ${RATE_LIMIT.requestsPerMinute} requests/minute`)
    );
    console.log(
      chalk.green(
        `💡 Optimization: Each API call updates multiple password entries with the same email!`
      )
    );
  }
}
