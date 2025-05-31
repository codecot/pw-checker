// password-checker/src/index.ts
import { importCsvToDb } from "./importCsv.js";
import { checkAllPasswords } from "./checkPasswords.js";
// import { importFromChrome } from "./importFromChrome";

(async () => {
  console.log("🔐 Starting pw-checker...");
  await importCsvToDb("data/passwords.csv");
  // await importFromChrome();
  await checkAllPasswords();
  console.log("✅ pw-checker finished.");
})();
