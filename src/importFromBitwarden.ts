#!/usr/bin/env node

import { exec } from "child_process";
import { promisify } from "util";
import chalk from "chalk";
import { getDatabase } from "./database.js";

const execAsync = promisify(exec);

interface BitwardenItem {
  id: string;
  name: string;
  login?: {
    username?: string;
    password?: string;
    uris?: Array<{ uri: string }>;
  };
  type: number; // 1 = login, 2 = secure note, 3 = card, 4 = identity
  folderId?: string;
  organizationId?: string;
  collectionIds?: string[];
}

interface BitwardenFolder {
  id: string;
  name: string;
}

// Critical account categories for enhanced risk scoring
const CRITICAL_CATEGORIES = new Set([
  "banking",
  "finance",
  "investment",
  "cryptocurrency",
  "work",
  "email",
  "government",
  "healthcare",
  "insurance",
  "social",
  "shopping",
  "cloud",
]);

/**
 * Categorize accounts based on domain or name
 */
function categorizeAccount(name: string, uri?: string): string {
  const lowerName = name.toLowerCase();
  const lowerUri = uri?.toLowerCase() || "";

  // Banking and Finance
  if (
    lowerName.includes("bank") ||
    lowerUri.includes("bank") ||
    lowerName.includes("paypal") ||
    lowerUri.includes("paypal") ||
    lowerName.includes("stripe") ||
    lowerUri.includes("stripe") ||
    lowerName.includes("credit") ||
    lowerName.includes("loan")
  ) {
    return "banking";
  }

  // Work/Professional
  if (
    lowerName.includes("work") ||
    lowerName.includes("office") ||
    lowerName.includes("company") ||
    lowerName.includes("enterprise") ||
    lowerUri.includes("slack") ||
    lowerUri.includes("teams") ||
    lowerUri.includes("zoom") ||
    lowerUri.includes("jira")
  ) {
    return "work";
  }

  // Email
  if (
    lowerName.includes("email") ||
    lowerName.includes("mail") ||
    lowerUri.includes("gmail") ||
    lowerUri.includes("outlook") ||
    lowerUri.includes("yahoo") ||
    lowerUri.includes("@")
  ) {
    return "email";
  }

  // Social Media
  if (
    lowerUri.includes("facebook") ||
    lowerUri.includes("twitter") ||
    lowerUri.includes("instagram") ||
    lowerUri.includes("linkedin") ||
    lowerUri.includes("tiktok") ||
    lowerUri.includes("snapchat")
  ) {
    return "social";
  }

  // Cloud Services
  if (
    lowerUri.includes("google") ||
    lowerUri.includes("microsoft") ||
    lowerUri.includes("apple") ||
    lowerUri.includes("amazon") ||
    lowerUri.includes("dropbox") ||
    lowerUri.includes("icloud")
  ) {
    return "cloud";
  }

  // Healthcare
  if (
    lowerName.includes("health") ||
    lowerName.includes("medical") ||
    lowerName.includes("doctor") ||
    lowerName.includes("hospital")
  ) {
    return "healthcare";
  }

  // Government
  if (
    lowerName.includes("gov") ||
    lowerUri.includes(".gov") ||
    lowerName.includes("tax") ||
    lowerName.includes("irs")
  ) {
    return "government";
  }

  // Shopping
  if (
    lowerUri.includes("amazon") ||
    lowerUri.includes("ebay") ||
    lowerUri.includes("shop") ||
    lowerName.includes("store")
  ) {
    return "shopping";
  }

  return "other";
}

/**
 * Check if Bitwarden CLI is authenticated
 */
async function checkBitwardenStatus(): Promise<boolean> {
  try {
    const { stdout } = await execAsync("bw status");
    const status = JSON.parse(stdout);
    return status.status === "unlocked";
  } catch (error) {
    console.error(chalk.red("❌ Error checking Bitwarden status:"), error);
    return false;
  }
}

/**
 * Get session token for Bitwarden CLI
 */
async function getBitwardenSession(): Promise<string | null> {
  try {
    // Check if already unlocked
    const isUnlocked = await checkBitwardenStatus();
    if (isUnlocked) {
      return "already_unlocked";
    }

    console.log(
      chalk.yellow("🔐 Bitwarden vault is locked. Please unlock it first:")
    );
    console.log(chalk.cyan("   bw unlock"));
    console.log(chalk.cyan('   export BW_SESSION="<session_key>"'));
    console.log(chalk.yellow("Then run this import command again."));

    return null;
  } catch (error) {
    console.error(chalk.red("❌ Error getting Bitwarden session:"), error);
    return null;
  }
}

/**
 * Export items from Bitwarden
 */
async function exportBitwardenItems(): Promise<BitwardenItem[]> {
  try {
    const { stdout } = await execAsync("bw list items");
    return JSON.parse(stdout);
  } catch (error) {
    console.error(chalk.red("❌ Error exporting items from Bitwarden:"), error);
    throw error;
  }
}

/**
 * Export folders from Bitwarden for categorization
 */
async function exportBitwardenFolders(): Promise<BitwardenFolder[]> {
  try {
    const { stdout } = await execAsync("bw list folders");
    return JSON.parse(stdout);
  } catch (error) {
    console.log(chalk.yellow("⚠️  Could not fetch folders (this is optional)"));
    return [];
  }
}

/**
 * Import passwords from Bitwarden vault
 */
export async function importFromBitwarden(): Promise<void> {
  console.log(chalk.blue("🔄 Starting Bitwarden import..."));

  // Check if Bitwarden CLI is available
  try {
    await execAsync("bw --version");
  } catch (error) {
    console.error(
      chalk.red("❌ Bitwarden CLI not found. Please install it first:")
    );
    console.log(chalk.cyan("   npm install -g @bitwarden/cli"));
    return;
  }

  // Check authentication status
  const session = await getBitwardenSession();
  if (!session) {
    return;
  }

  try {
    // Export items and folders
    console.log(chalk.blue("📤 Exporting items from Bitwarden..."));
    const [items, folders] = await Promise.all([
      exportBitwardenItems(),
      exportBitwardenFolders(),
    ]);

    // Create folder lookup
    const folderMap = new Map<string, string>();
    folders.forEach((folder) => {
      folderMap.set(folder.id, folder.name);
    });

    // Filter login items only
    const loginItems = items.filter(
      (item) => item.type === 1 && item.login?.password && item.login?.username
    );

    console.log(chalk.green(`✅ Found ${loginItems.length} login items`));

    if (loginItems.length === 0) {
      console.log(chalk.yellow("⚠️  No login items found in Bitwarden vault"));
      return;
    }

    // Open database
    const db = await getDatabase();

    let imported = 0;
    let skipped = 0;

    for (const item of loginItems) {
      try {
        const uri = item.login?.uris?.[0]?.uri || `bitwarden-item-${item.id}`;
        const username = item.login?.username || "";
        const password = item.login?.password || "";
        const folderName = item.folderId
          ? folderMap.get(item.folderId)
          : undefined;
        const category = categorizeAccount(item.name, uri);

        // Check if entry already exists
        const existing = await db.get(
          "SELECT id FROM pw_entries WHERE url = ? AND username = ?",
          [uri, username]
        );

        if (existing) {
          skipped++;
          continue;
        }

        // Insert new entry
        await db.run(
          `
          INSERT INTO pw_entries (
            url, username, password, password_hash, source,
            date_created, is_compromised, category, folder_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            uri,
            username,
            password,
            "", // Will be populated during breach check
            "bitwarden",
            new Date().toISOString(),
            0, // Will be checked later
            category,
            folderName || null,
          ]
        );

        imported++;

        // Progress indicator
        if (imported % 50 === 0) {
          console.log(chalk.blue(`📥 Imported ${imported} entries...`));
        }
      } catch (error) {
        console.error(
          chalk.red(`❌ Error importing item "${item.name}":`, error)
        );
        skipped++;
      }
    }

    await db.close();

    console.log(chalk.green(`\n✅ Bitwarden import completed!`));
    console.log(chalk.cyan(`📊 Summary:`));
    console.log(chalk.cyan(`   • Imported: ${imported} entries`));
    console.log(chalk.cyan(`   • Skipped (duplicates): ${skipped} entries`));
    console.log(
      chalk.cyan(`   • Total processed: ${imported + skipped} entries`)
    );

    if (imported > 0) {
      console.log(chalk.yellow("\n💡 Next steps:"));
      console.log(
        chalk.yellow("   • Run breach check: npm run check:breaches")
      );
      console.log(
        chalk.yellow("   • Calculate risk scores: npm run risk:calculate")
      );
      console.log(
        chalk.yellow("   • Generate security report: npm run risk:report")
      );
    }
  } catch (error) {
    console.error(chalk.red("❌ Error during Bitwarden import:"), error);
    throw error;
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(chalk.blue("🔐 Bitwarden Import Tool"));
    console.log("");
    console.log("Usage:");
    console.log(
      "  npm run import:bitwarden     Import passwords from Bitwarden"
    );
    console.log("");
    console.log("Prerequisites:");
    console.log("  1. Install Bitwarden CLI: npm install -g @bitwarden/cli");
    console.log("  2. Login to Bitwarden: bw login");
    console.log("  3. Unlock vault: bw unlock");
    console.log('  4. Export session: export BW_SESSION="<session_key>"');
    console.log("");
    console.log("Features:");
    console.log("  • Imports login items from Bitwarden vault");
    console.log("  • Automatically categorizes accounts for risk scoring");
    console.log("  • Preserves folder structure from Bitwarden");
    console.log("  • Skips duplicate entries");
    console.log("  • Integrates with existing risk scoring system");
    return;
  }

  await importFromBitwarden();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(chalk.red("❌ Fatal error:"), error);
    process.exit(1);
  });
}
