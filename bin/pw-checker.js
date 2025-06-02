#!/usr/bin/env node

import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import and run the main CLI
const { main } = await import(join(__dirname, "../dist/index.js"));
main();
