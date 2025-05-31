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
| MIT License & GitHub repo | ✅ Done |

### 📋 Planned Features

| Goal | Description |
| ---- | ----------- |
| 🔍 Chrome DB import | Read Login Data from Chrome and mark compromised accounts |
| 📊 Password strength analysis | Use zxcvbn or OWASP to score each password |
| 🏷 Credential categorization | Mark entries like bank, email, work, etc. |
| 🖼 Logo/visual enrichment | Pull site logos via Clearbit API |
| 🔐 Bitwarden CLI integration | Import/export from Bitwarden (bw) |
| 🌐 Web UI dashboard | React frontend + Fastify/Express backend |

## Requirements

- Node.js 18+
- npm or yarn

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/pw-checker.git
cd pw-checker

# Install dependencies
npm install

# Run the application
npm start
```

## Usage

First, prepare a CSV file with your passwords in the following format:

```csv
name,url,username,password
Google,https://accounts.google.com,user@gmail.com,your-password
```

Place this file at `data/passwords.csv` (or update the path in `index.ts`).

An example file is provided at `data/example-passwords.csv`. You can use it like this:

```bash
# Copy the example file (do not commit your actual passwords!)
cp data/example-passwords.csv data/passwords.csv

# Run the application
npm start
```

### Available Commands

- `npm start` - Import passwords from CSV and check them against HIBP
- `npm run view` - View all passwords and their status
- `npm run view:compromised` - View only compromised passwords
- `npm run view:safe` - View only safe passwords
- `npm run view:unchecked` - View only unchecked passwords

## Security Considerations

- This tool stores passwords in plaintext in a local SQLite database
- Never share your `pw_entries.sqlite` database file
- Consider adding the `db/` directory to your `.gitignore` file (already done in this repo)

## Project Structure

```
pw-checker/
├── src/
│   ├── index.ts             # Entry point
│   ├── importCsv.ts         # CSV → SQLite
│   ├── checkPasswords.ts    # HIBP verification
│   ├── queryDb.ts           # View data
├── data/
│   ├── passwords.csv        # Input file
│   └── example-passwords.csv # Example template
├── db/
│   └── pw_entries.sqlite    # Local database
├── package.json
├── tsconfig.json
├── LICENSE (MIT)
├── README.md
├── CONTRIBUTING.md
└── .gitignore
```

## License

MIT

## Author

Volodymyr Pasichnyk <volodymyr.pasichnyk@gmail.com>
