#!/usr/bin/env node
// healthCheck.ts - Validate pw-checker installation and configuration
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { getDatabase } from "./database.js";

// Load environment variables from .env file
dotenv.config();

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runHealthCheck() {
  console.log(chalk.blue.bold("🏥 pw-checker Health Check\n"));

  let allGood = true;

  // Check 1: Verify required directories exist
  console.log("📁 Checking directories...");
  const requiredDirs = ["data", "db"];
  for (const dir of requiredDirs) {
    if (fs.existsSync(dir)) {
      console.log(chalk.green(`✅ ${dir}/ directory exists`));
    } else {
      console.log(chalk.red(`❌ ${dir}/ directory missing`));
      allGood = false;
    }
  }

  // Check 2: Verify database connection
  console.log("\n💾 Checking database...");
  try {
    const db = await getDatabase();
    const result = await db.get("SELECT COUNT(*) as count FROM pw_entries");
    console.log(chalk.green(`✅ Database connection successful`));
    console.log(chalk.blue(`ℹ️  Found ${result.count} entries in database`));
    await db.close();
  } catch (error) {
    console.log(chalk.red(`❌ Database connection failed: ${error}`));
    allGood = false;
  }

  // Check 3: Verify template files
  console.log("\n📄 Checking template files...");
  const templateFiles = [
    "data/passwords.csv.template",
    "data/chrome-passwords.csv.template",
    ".env.template",
  ];
  for (const file of templateFiles) {
    if (fs.existsSync(file)) {
      console.log(chalk.green(`✅ ${file} exists`));
    } else {
      console.log(chalk.yellow(`⚠️  ${file} missing (optional)`));
    }
  }

  // Check 4: Environment variables
  console.log("\n🔑 Checking environment variables...");
  const hibpKey = process.env.HIBP_API_KEY;
  if (hibpKey) {
    console.log(chalk.green(`✅ HIBP_API_KEY is set`));
  } else {
    console.log(
      chalk.yellow(`⚠️  HIBP_API_KEY not set (required for breach checking)`)
    );
    console.log(
      chalk.blue(`ℹ️  Get an API key from https://haveibeenpwned.com/API/Key`)
    );
  }

  // Check 5: TypeScript configuration
  console.log("\n⚙️  Checking configuration...");
  if (fs.existsSync("tsconfig.json")) {
    console.log(chalk.green(`✅ TypeScript configuration found`));
  } else {
    console.log(chalk.red(`❌ tsconfig.json missing`));
    allGood = false;
  }

  if (fs.existsSync("package.json")) {
    console.log(chalk.green(`✅ Package configuration found`));
  } else {
    console.log(chalk.red(`❌ package.json missing`));
    allGood = false;
  }

  // Final result
  console.log("\n" + "=".repeat(50));
  if (allGood) {
    console.log(chalk.green.bold("✅ All critical checks passed!"));
    console.log(chalk.blue("🚀 pw-checker is ready to use"));
    console.log("\nNext steps:");
    console.log("  npm start              - Import CSV and check passwords");
    console.log("  npm run view           - View imported entries");
    console.log("  npm run help           - Show all available commands");
  } else {
    console.log(chalk.red.bold("❌ Some critical checks failed"));
    console.log(
      chalk.yellow("🔧 Please fix the issues above before using pw-checker")
    );
    process.exit(1);
  }
}

// Run the health check
runHealthCheck().catch((error) => {
  console.error(chalk.red("❌ Health check failed:"), error);
  process.exit(1);
});
