# Password Checker

🔐 A local CLI tool that helps you audit saved passwords for security breaches using the Have I Been Pwned (HIBP) API and optional Chrome password database analysis. All data remains local — privacy first.

## Overview

This tool allows you to check if your passwords have been compromised in data breaches without sending your actual passwords to any external service. It does this by:

1. Importing passwords from CSV files or Chrome
2. Checking them against the HIBP database using the k-anonymity model (only sending first 5 characters of the password hash)
3. Storing results in a local SQLite database for easy review

## Features

### ✅ Current Features

| Feature | Status |
| ------- | ------ |
| CSV import → SQLite | ✅ Done (importCsv.ts) |
| HIBP password check | ✅ Done (checkPasswords.ts) |
| SQLite database setup | ✅ Done (pw_entries table) |
| Terminal viewer with filters | ✅ Done (queryDb.ts) |
| Modern TypeScript + ES Modules | ✅ Done |
| Chrome DB import | ✅ Done (importFromChrome.ts) |
| Chrome CSV export import | ✅ Done (importFromChromeCsv.ts) |
| Account breach checking | ✅ Done (checkBreaches.ts) |
| Code formatting with Prettier | ✅ Done |
| MIT License & GitHub repo | ✅ Done |

### 📋 Planned Features

| Goal | Description |
| ---- | ----------- |
| 📊 Password strength analysis | Use zxcvbn or OWASP to score each password |
| 🏷 Credential categorization | Mark entries like bank, email, work, etc. |
| 🖼 Logo/visual enrichment | Pull site logos via Clearbit API |
| 🔐 Bitwarden CLI integration | Import/export from Bitwarden (bw) |
| 🌐 Web UI dashboard | React frontend + Fastify/Express backend |

## Requirements

- Node.js 18+
- npm or yarn

## Installation

### NPM Global Installation

```bash
# Install globally
npm install -g @codecot/pw-checker

# Run the tool
pw-checker --help
```

### Direct Usage with npx

```bash
# Run without installing
npx @codecot/pw-checker --help
```

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/codecot/pw-checker.git
cd pw-checker

# Install dependencies
npm install

# Verify installation
npm run health

# Show help
npm run help
```

## Quick Start

```bash
# Set up secure password file structure
npm run security:setup

# Copy the example file (do not commit your actual passwords!)
cp data/passwords.csv.template data/passwords.csv

# Run the application in development mode (limits API calls)
npm start -- --dev

# View results
npm run view
```

## 🔒 Security & Privacy

**Your data stays local** - passwords never leave your machine:

- All processing happens locally in SQLite
- Only password hash prefixes (5 chars) are sent to HIBP API
- CSV files containing real passwords are never committed to Git
- Comprehensive `.gitignore` protects sensitive files

### Security Setup

```bash
# Automated security setup
npm run security:setup

# Manual verification
git check-ignore data/passwords.csv data/chrome-passwords.csv
```

## 🚀 Rate Limiting & API Optimization

For HIBP breach checking, pw-checker implements intelligent rate limiting and optimization:

### Key Features

- **Email Deduplication**: Only checks each unique email once (can reduce API calls by 80%+)
- **Batch Processing**: Respects 10 req/min API limits with smart batching
- **Resume Capability**: Continue interrupted checks from where you left off
- **Progress Tracking**: Detailed statistics and ETA estimates
- **Cron-Friendly**: Scheduled mode for automated processing
- **Incremental Processing**: Each API call intelligently updates all database entries sharing the same email address

### Rate Limiting Configuration

The tool automatically handles HIBP API rate limits:

- **Pwned 1 Tier**: 10 requests/minute (default configuration)
- Batches of 8 accounts with 7-second delays between requests
- 70-second delays between batches to prevent rate limit violations

### Example Workflow

```bash
# Check current progress
npm run check:breaches:stats

# Start or resume breach checking
npm run check:breaches
npm run check:breaches:resume

# For large datasets: set up automated processing
# This processes small batches every 10 minutes
crontab -e
# Add: */10 * * * * /path/to/scripts/cron-breach-check.sh
```

**Read our comprehensive guides:**

- [`docs/HIBP_API_SETUP.md`](docs/HIBP_API_SETUP.md) - API key setup
- [`docs/RATE_LIMITING.md`](docs/RATE_LIMITING.md) - Detailed rate limiting guide
- [`docs/ADVANCED_FEATURES.md`](docs/ADVANCED_FEATURES.md) - Complete guide to advanced features

### Available Commands

**Core Commands:**

- `npm run help` - Show detailed help information
- `npm run health` - Run system health check  
- `npm run security:setup` - Set up secure password file structure
- `npm start` - Import CSV and check passwords (full mode)
- `npm start -- --dev` - Development mode (limits API calls to 5 records)
- `npm start -- --skip-network` - Skip all network API calls

**Import Commands:**

- `npm run import:chrome` - Import passwords from Chrome database
- `npm run import:chrome-csv` - Import passwords from Chrome CSV export

**Breach Checking Commands:**

- `npm run check:breaches` - Check email accounts for data breaches (requires HIBP API key)
- `npm run check:breaches:stats` - Show breach check progress and statistics
- `npm run check:breaches:resume` - Resume interrupted breach checks
- `npm run check:breaches:scheduled` - Run single batch for cron jobs (rate limit friendly)

**View Commands:**

- `npm run view` - View all passwords and their status
- `npm run view:compromised` - View only compromised passwords
- `npm run view:safe` - View only safe passwords
- `npm run view:unchecked` - View only unchecked passwords
- `npm run view:breached` - View only accounts found in data breaches
- `npm run view:breached:detailed` - View detailed breach information with descriptions and affected data
- `npm run view:chrome` - View only Chrome-imported entries
- `npm run view:chrome-compromised` - View only Chrome entries marked as compromised

**Analysis Commands:**

- `npm run analyze:breaches` - Comprehensive breach analysis with recent breaches, multi-account impacts, and domain statistics

**Utility Commands:**

- `npm run clear:db` - Clear the database
- `npm run format` - Format code using Prettier

**Read our comprehensive security guide:** [`docs/SECURITY.md`](docs/SECURITY.md)

## Project Structure

```text
pw-checker/
├── src/
│   ├── index.ts             # Entry point
│   ├── importCsv.ts         # CSV → SQLite
│   ├── importFromChrome.ts  # Chrome DB → SQLite
│   ├── importFromChromeCsv.ts # Chrome CSV → SQLite
│   ├── checkPasswords.ts    # HIBP verification
│   ├── checkBreaches.ts     # Account breach checking
│   ├── queryDb.ts           # View data
│   ├── clearDb.ts           # Clear database
│   ├── healthCheck.ts       # System health verification
│   └── database.ts          # Shared database utilities
├── data/
│   ├── passwords.csv        # Your password data (NEVER COMMITTED)
│   ├── chrome-passwords.csv # Chrome CSV export (NEVER COMMITTED)
│   ├── passwords.csv.template      # Template for CSV passwords
│   └── chrome-passwords.csv.template # Template for Chrome CSV export
├── db/
│   └── pw_entries.sqlite    # Local database (NEVER COMMITTED)
├── docs/
│   └── SECURITY.md          # Comprehensive security guide
├── scripts/
│   └── setup-security.sh    # Automated security setup
├── package.json
├── tsconfig.json
├── .prettierrc              # Prettier configuration
├── LICENSE (MIT)
├── README.md
├── CONTRIBUTING.md
└── .gitignore               # Protects sensitive files
```

## License

MIT

## Author

Volodymyr Pasichnyk <volodymyr.pasichnyk@gmail.com>
