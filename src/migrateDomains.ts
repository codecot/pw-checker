#!/usr/bin/env node
/**
 * Migration script to populate normalized_domain for existing entries
 * This script updates all entries in the database with normalized domain values
 */

import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { normalizeDomain } from "./domainNormalizer.js";

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../db/pw_entries.sqlite");

async function migrateDomains() {
  console.log(chalk.blue("🔄 Starting domain migration..."));

  try {
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    // Check if normalized_domain column exists
    const columns = await db.all("PRAGMA table_info(pw_entries)");
    const hasNormalizedDomain = columns.some(
      (col: any) => col.name === "normalized_domain"
    );

    if (!hasNormalizedDomain) {
      console.log(
        chalk.red(
          "❌ normalized_domain column does not exist. Run 'npm run db:update-schema' first."
        )
      );
      return;
    }

    // Get all entries that need domain normalization
    const entriesNeedingUpdate = await db.all(`
      SELECT id, url, normalized_domain 
      FROM pw_entries 
      WHERE url IS NOT NULL 
      AND (normalized_domain IS NULL OR normalized_domain = '')
    `);

    if (entriesNeedingUpdate.length === 0) {
      console.log(
        chalk.green(
          "✅ All entries already have normalized domains. No migration needed."
        )
      );
      return;
    }

    console.log(
      chalk.blue(
        `📊 Found ${entriesNeedingUpdate.length} entries needing domain normalization...`
      )
    );

    let updateCount = 0;
    let errorCount = 0;

    for (const entry of entriesNeedingUpdate) {
      try {
        const normalizedDomain = normalizeDomain(entry.url);
        if (normalizedDomain && normalizedDomain !== entry.normalized_domain) {
          await db.run(
            "UPDATE pw_entries SET normalized_domain = ? WHERE id = ?",
            normalizedDomain,
            entry.id
          );
          updateCount++;

          // Progress indicator for large batches
          if (updateCount % 100 === 0) {
            console.log(chalk.blue(`📝 Updated ${updateCount} entries...`));
          }
        }
      } catch (error) {
        console.error(
          chalk.yellow(
            `⚠️  Warning: Failed to normalize domain for entry ${entry.id}: ${entry.url}`
          )
        );
        errorCount++;
      }
    }

    await db.close();

    console.log(chalk.green(`\n✅ Domain migration completed!`));
    console.log(chalk.cyan(`📊 Summary:`));
    console.log(chalk.cyan(`   • Updated: ${updateCount} entries`));
    if (errorCount > 0) {
      console.log(chalk.yellow(`   • Errors: ${errorCount} entries`));
    }
    console.log(
      chalk.cyan(`   • Total processed: ${entriesNeedingUpdate.length} entries`)
    );

    if (updateCount > 0) {
      console.log(chalk.blue("\n💡 You can now use site-based queries:"));
      console.log(chalk.blue("   npm run view:site --site=google.com"));
      console.log(
        chalk.blue("   npm run view:site --site=github --show-passwords")
      );
    }
  } catch (error) {
    console.error(
      chalk.red(
        `❌ Error during domain migration: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    process.exit(1);
  }
}

// Run the migration
migrateDomains();
