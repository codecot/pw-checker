#!/usr/bin/env node
// updateDbSchema.ts - Add notes and breach_info columns to the database

import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../db/pw_entries.sqlite");

async function updateDatabaseSchema() {
  console.log(chalk.blue("🔧 Updating database schema..."));

  try {
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    // Get current table info
    const tableInfo = await db.all("PRAGMA table_info(pw_entries)");

    // Check if the notes column already exists
    const notesColumnExists = tableInfo.some(
      (column) => column.name === "notes"
    );

    // Check if the breach_info column already exists
    const breachInfoColumnExists = tableInfo.some(
      (column) => column.name === "breach_info"
    );

    // Check if risk columns exist
    const riskScoreColumnExists = tableInfo.some(
      (column) => column.name === "risk_score"
    );
    const riskLabelColumnExists = tableInfo.some(
      (column) => column.name === "risk_label"
    );
    const riskFactorsColumnExists = tableInfo.some(
      (column) => column.name === "risk_factors"
    );

    // Add notes column if it doesn't exist
    if (!notesColumnExists) {
      await db.run("ALTER TABLE pw_entries ADD COLUMN notes TEXT");
      console.log(chalk.green("✅ Added 'notes' column to the database."));
    } else {
      console.log(
        chalk.yellow("⚠️ Notes column already exists. No changes made.")
      );
    }

    // Add breach_info column if it doesn't exist
    if (!breachInfoColumnExists) {
      await db.run("ALTER TABLE pw_entries ADD COLUMN breach_info TEXT");
      console.log(
        chalk.green("✅ Added 'breach_info' column to the database.")
      );
    } else {
      console.log(
        chalk.yellow("⚠️ Breach info column already exists. No changes made.")
      );
    }

    await db.close();
  } catch (error) {
    console.error(
      chalk.red(`❌ Error updating database schema: ${error.message}`)
    );
    process.exit(1);
  }
}

// Run the function
updateDatabaseSchema();
