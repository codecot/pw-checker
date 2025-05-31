# Next Steps for pw-checker

This document outlines the implementation plan for the next features of the pw-checker project. Each feature is explained with technical details and suggested approaches.

## 1. 🔍 Chrome Password Import

### Chrome Password Import Overview

Import saved passwords directly from Chrome's Login Data SQLite database.

### Implementation Steps for Chrome Password Import

1. **Create a new module**: `src/importFromChrome.ts`

2. **Locate Chrome's Login Data file** based on OS:

   - Linux: `~/.config/google-chrome/Default/Login Data`
   - macOS: `~/Library/Application Support/Google/Chrome/Default/Login Data`
   - Windows: `%LocalAppData%\Google\Chrome\User Data\Default\Login Data`

3. **Copy the database** before reading (Chrome locks it during use):

   ```typescript
   import fs from "fs";
   import os from "os";
   import path from "path";

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

   // Copy to temp file since Chrome locks the original
   function copyLoginData(sourcePath: string): string {
     const tempPath = path.join(os.tmpdir(), "chrome_login_data_temp");
     fs.copyFileSync(sourcePath, tempPath);
     return tempPath;
   }
   ```

4. **Read the database** using SQLite:

   ```typescript
   async function importFromChrome(): Promise<number> {
     const chromeDbPath = getChromeDbPath();
     const tempDbPath = copyLoginData(chromeDbPath);

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

       // Chrome's login data has encrypted passwords
       // For simplicity, we'll just show using url_id/username
       const rows = await chromeDb.all(
         "SELECT origin_url, username_value FROM logins"
       );

       let importCount = 0;

       for (const row of rows) {
         // Insert into our database
         await pwDb.run(
           "INSERT INTO pw_entries (name, url, username, source) VALUES (?, ?, ?, ?)",
           getDomainFromUrl(row.origin_url),
           row.origin_url,
           row.username_value,
           "chrome"
         );
         importCount++;
       }

       await chromeDb.close();
       await pwDb.close();

       return importCount;
     } finally {
       // Clean up the temp file
       fs.unlinkSync(tempDbPath);
     }
   }

   function getDomainFromUrl(url: string): string {
     try {
       const domain = new URL(url).hostname;
       return domain;
     } catch (e) {
       return url;
     }
   }
   ```

5. **Update `index.ts`** to include the Chrome import option:

   ```typescript
   import { importFromChrome } from "./importFromChrome";

   // Add a command-line flag for Chrome import
   const importChrome = process.argv.includes("--chrome");

   (async () => {
     console.log("🔐 Starting pw-checker...");
     await importCsvToDb("data/passwords.csv");

     if (importChrome) {
       console.log("🔍 Importing passwords from Chrome...");
       const count = await importFromChrome();
       console.log(`✅ Imported ${count} passwords from Chrome.`);
     }

     await checkAllPasswords();
     console.log("✅ pw-checker finished.");
   })();
   ```

**Note**: Chrome encrypts passwords using the OS's credential storage. For a complete solution, you'd need to use libraries specific to each platform to decrypt the passwords.

## 2. 📊 Password Strength Analysis

### Password Strength Analysis Overview

Analyze the strength of stored passwords using the zxcvbn library.

### Implementation Steps

1. **Install the zxcvbn library**:

   ```bash
   npm install zxcvbn
   npm install @types/zxcvbn --save-dev
   ```

2. **Update the database schema** to store strength scores:

   ```typescript
   await db.exec(`
     ALTER TABLE pw_entries ADD COLUMN strength_score INTEGER DEFAULT NULL;
     ALTER TABLE pw_entries ADD COLUMN strength_feedback TEXT DEFAULT NULL;
   `);
   ```

3. **Create a password strength module**: `src/checkPasswordStrength.ts`:

   ```typescript
   import zxcvbn from "zxcvbn";
   import sqlite3 from "sqlite3";
   import { open } from "sqlite";
   import path from "path";
   import { fileURLToPath } from "url";
   import chalk from "chalk";

   const __filename = fileURLToPath(import.meta.url);
   const __dirname = path.dirname(__filename);
   const dbPath = path.resolve(__dirname, "../db/pw_entries.sqlite");

   export async function analyzePasswordStrength(): Promise<void> {
     const db = await open({
       filename: dbPath,
       driver: sqlite3.Database,
     });

     try {
       console.log(chalk.blue("📊 Analyzing password strength..."));

       // Add strength columns if they don't exist
       await db.exec(`
         CREATE TABLE IF NOT EXISTS pw_entries_temp AS SELECT * FROM pw_entries;
         DROP TABLE pw_entries;
         CREATE TABLE pw_entries (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           name TEXT,
           url TEXT,
           username TEXT,
           password TEXT,
           compromised BOOLEAN DEFAULT NULL,
           source TEXT DEFAULT 'csv',
           last_checked_at TEXT DEFAULT NULL,
           strength_score INTEGER DEFAULT NULL,
           strength_feedback TEXT DEFAULT NULL
         );
         INSERT INTO pw_entries SELECT 
           id, name, url, username, password, compromised, source, last_checked_at, 
           NULL as strength_score, NULL as strength_feedback 
           FROM pw_entries_temp;
         DROP TABLE pw_entries_temp;
       `);

       // Get all passwords
       const rows = await db.all(
         "SELECT id, password FROM pw_entries WHERE strength_score IS NULL"
       );

       console.log(chalk.blue(`Found ${rows.length} passwords to analyze.`));

       for (const row of rows) {
         // Analyze password strength using zxcvbn
         const result = zxcvbn(row.password);

         // Store the score and feedback
         await db.run(
           "UPDATE pw_entries SET strength_score = ?, strength_feedback = ? WHERE id = ?",
           result.score,
           JSON.stringify(result.feedback),
           row.id
         );

         // Log the result
         const scoreColor = getScoreColor(result.score);
         console.log(
           `Password #${row.id}: Strength score ${scoreColor(
             result.score.toString()
           )}/4`
         );
       }

       // Show statistics
       const stats = await db.all(
         "SELECT strength_score, COUNT(*) as count FROM pw_entries GROUP BY strength_score"
       );
       console.log(chalk.blue("\n📊 Password Strength Distribution:"));

       for (const stat of stats) {
         const scoreColor = getScoreColor(stat.strength_score);
         console.log(
           `  Score ${scoreColor(stat.strength_score.toString())}/4: ${
             stat.count
           } passwords`
         );
       }
     } finally {
       await db.close();
     }
   }

   function getScoreColor(score: number): (text: string) => string {
     switch (score) {
       case 0:
         return chalk.red;
       case 1:
         return chalk.red;
       case 2:
         return chalk.yellow;
       case 3:
         return chalk.green;
       case 4:
         return chalk.green.bold;
       default:
         return chalk.gray;
     }
   }
   ```

4. **Update the main script** to include the strength analysis:

   ```typescript
   import { analyzePasswordStrength } from "./checkPasswordStrength";

   // Add to the main function
   await analyzePasswordStrength();
   ```

5. **Update queryDb.ts** to display strength information:

   ```typescript
   // Add a new filter option
   if (args.includes("--weak")) {
     query += " WHERE strength_score <= 2";
   }

   // Update the display output to include strength info
   const strengthInfo =
     row.strength_score !== null ? scoreToEmoji(row.strength_score) : "❓";

   console.log(
     `${chalk.bold(row.id)} | ${chalk.cyan(row.name)} | ${chalk.gray(
       row.url
     )} | ${chalk.magenta(row.username)} | ${status} | ${strengthInfo}`
   );

   function scoreToEmoji(score: number): string {
     switch (score) {
       case 0:
         return "🔴 Very Weak";
       case 1:
         return "🟠 Weak";
       case 2:
         return "🟡 Fair";
       case 3:
         return "🟢 Good";
       case 4:
         return "🟢 Strong";
       default:
         return "❓ Unknown";
     }
   }
   ```

## 3. 🏷 Credential Categorization

### Credential Categorization Overview

Categorize credentials by type (email, banking, social media, etc.) for better organization.

### Implementation Steps

1. **Update database schema** to include categories:

   ```typescript
   await db.exec(`
     ALTER TABLE pw_entries ADD COLUMN category TEXT DEFAULT 'uncategorized';
   `);
   ```

2. **Create a categorization module**: `src/categorizeEntries.ts`:

   ```typescript
   import sqlite3 from "sqlite3";
   import { open } from "sqlite";
   import path from "path";
   import { fileURLToPath } from "url";
   import chalk from "chalk";

   const __filename = fileURLToPath(import.meta.url);
   const __dirname = path.dirname(__filename);
   const dbPath = path.resolve(__dirname, "../db/pw_entries.sqlite");

   // Define category patterns
   const CATEGORIES = {
     banking: [
       "bank",
       "chase",
       "citi",
       "wellsfargo",
       "hsbc",
       "barclays",
       "paypal",
       "finance",
       "credit",
       "loan",
       "mortgage",
       "investment",
     ],
     email: [
       "mail",
       "gmail",
       "outlook",
       "hotmail",
       "yahoo",
       "proton",
       "zoho",
       "fastmail",
       "icloud",
     ],
     social: [
       "facebook",
       "twitter",
       "instagram",
       "linkedin",
       "tiktok",
       "snapchat",
       "pinterest",
       "reddit",
       "whatsapp",
       "signal",
       "telegram",
     ],
     shopping: [
       "amazon",
       "walmart",
       "ebay",
       "etsy",
       "aliexpress",
       "bestbuy",
       "target",
       "shop",
       "store",
     ],
     work: [
       "office",
       "microsoft",
       "workspace",
       "slack",
       "zoom",
       "teams",
       "jira",
       "confluence",
       "asana",
       "trello",
       "basecamp",
     ],
     entertainment: [
       "netflix",
       "hulu",
       "disney",
       "spotify",
       "apple",
       "prime",
       "youtube",
       "twitch",
       "gaming",
       "steam",
       "epic",
     ],
   };

   export async function categorizeCredentials(): Promise<void> {
     const db = await open({
       filename: dbPath,
       driver: sqlite3.Database,
     });

     try {
       console.log(chalk.blue("🏷 Categorizing credentials..."));

       // Get all uncategorized entries
       const rows = await db.all(
         "SELECT id, name, url FROM pw_entries WHERE category = 'uncategorized' OR category IS NULL"
       );

       console.log(chalk.blue(`Found ${rows.length} uncategorized entries.`));

       let categorized = 0;

       for (const row of rows) {
         const searchText = `${row.name} ${row.url}`.toLowerCase();

         let matched = false;

         for (const [category, patterns] of Object.entries(CATEGORIES)) {
           for (const pattern of patterns) {
             if (searchText.includes(pattern)) {
               await db.run(
                 "UPDATE pw_entries SET category = ? WHERE id = ?",
                 category,
                 row.id
               );

               console.log(
                 `Categorized #${row.id} (${row.name}) as "${category}"`
               );
               categorized++;
               matched = true;
               break;
             }
           }

           if (matched) break;
         }
       }

       console.log(chalk.green(`✅ Categorized ${categorized} entries.`));

       // Show category distribution
       const stats = await db.all(
         "SELECT category, COUNT(*) as count FROM pw_entries GROUP BY category"
       );

       console.log(chalk.blue("\n📊 Category Distribution:"));

       for (const stat of stats) {
         console.log(`  ${stat.category}: ${stat.count} entries`);
       }
     } finally {
       await db.close();
     }
   }
   ```

3. **Update queryDb.ts** to support filtering by category:

   ```typescript
   // Add a category filter option
   if (args.includes("--category")) {
     const categoryIndex = args.indexOf("--category");
     if (categoryIndex < args.length - 1) {
       const category = args[categoryIndex + 1];
       query += ` WHERE category = '${category}'`;
     }
   }

   // Update display to include category
   console.log(
     `${chalk.bold(row.id)} | ${chalk.cyan(row.name)} | ${chalk.gray(
       row.url
     )} | ${chalk.magenta(row.username)} | ${chalk.yellow(
       row.category || "uncategorized"
     )} | ${status}`
   );
   ```

4. **Add to package.json** scripts:

   ```json
   "categorize": "node --loader ts-node/esm src/categorizeEntries.ts",
   "view:category": "node --loader ts-node/esm src/queryDb.ts --category"
   ```

## 4. Next Feature Implementation Timeline

Here's a suggested order and timeline for implementing these features:

1. **Week 1: Password Strength Analysis**

   - Easiest to implement as it builds directly on existing code
   - Provides immediate value for users

2. **Week 2: Credential Categorization**

   - Natural next step after strength analysis
   - Improves organization of the database

3. **Week 3-4: Chrome Password Import**

   - More complex due to platform-specific code
   - May require additional security research

4. **Future Considerations**:
   - Web UI dashboard (would require significant additional work)
   - Bitwarden CLI integration
   - Logo/visual enrichment

## 5. Development Best Practices

As you continue developing the project, consider:

1. **Adding Tests**: Create unit tests for critical functions like password hash checking
2. **Command Line Interface**: Consider using a CLI library like Commander.js for better argument handling
3. **Configuration File**: Add support for a config file to store preferences
4. **Continuous Integration**: Set up GitHub Actions for automated testing
5. **Documentation**: Keep expanding documentation with examples

## 6. Security Recommendations

1. **Database Encryption**: Consider encrypting the SQLite database with a master password
2. **Memory Management**: Clear password variables from memory after use
3. **Input Validation**: Validate all user inputs
4. **Regular Updates**: Keep dependencies updated for security patches
5. **Audit Logging**: Add logging to track usage and potential issues
