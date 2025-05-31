# Password Checker

A CLI tool to audit passwords locally using Have I Been Pwned (HIBP) and Chrome data.

## Overview

This tool allows you to check if your passwords have been compromised in data breaches without sending your actual passwords to any external service. It does this by:

1. Importing passwords from CSV files or Chrome
2. Checking them against the HIBP database using the k-anonymity model (only sending first 5 characters of the password hash)
3. Storing results in a local SQLite database for easy review

## Features

- ✅ Import passwords from CSV files
- ✅ Check passwords against HIBP securely
- ✅ Color-coded terminal output for easy status viewing
- ✅ Filter password entries by status (compromised, safe, unchecked)
- 🔄 Import passwords from Chrome (coming soon)

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
- Consider adding the `db/` directory to your `.gitignore` file

## License

MIT

## Author

Volodymyr Pasichnyk <volodymyr.pasichnyk@gmail.com>
