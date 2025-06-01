# Chrome CSV Import and Breach Checking Implementation

This document outlines the implementation details for the two newest features in pw-checker: importing passwords from Chrome's exported CSV and checking accounts for data breaches.

## 1. 🔍 Chrome CSV Password Import

### Overview

Import saved passwords from a CSV file exported from Chrome's password manager. This provides a way to check passwords even when they can't be accessed directly from Chrome's database.

### Implementation Details

1. **New module**: `src/importFromChromeCsv.ts`

2. **CSV Structure**:
   - Chrome exports CSV with headers: `name,url,username,password`
   
3. **Import Process**:
   - Parse the CSV file
   - For each entry, check if it already exists in the database
   - If it exists but has no password (from Chrome DB import), update it with the password
   - Otherwise, insert a new entry

4. **Usage**:
   ```bash
   # Default location (data/chrome-passwords.csv)
   npm run import:chrome-csv
   
   # Custom location
   npm run import:chrome-csv -- --chrome-csv-path /path/to/exported-chrome-passwords.csv
   ```

## 2. 🔍 Account Breach Checking

### Overview

Check if email accounts have been involved in data breaches using the Have I Been Pwned API. This provides more comprehensive security information beyond just password checks.

### Implementation Details

1. **New module**: `src/checkBreaches.ts`

2. **HIBP API Requirements**:
   - Requires an API key from haveibeenpwned.com
   - Set as environment variable: `HIBP_API_KEY`

3. **Data Structure**:
   - New `breach_info` column in the database to store breach information as JSON
   - Information includes breach count, breach names, and exposed data types

4. **Usage**:
   ```bash
   # Set API key
   export HIBP_API_KEY=your-api-key-here
   
   # Run breach check
   npm run check:breaches
   
   # View breached accounts
   npm run view:breached
   ```

## Implementation Notes

1. **Rate Limiting**:
   - HIBP API has strict rate limits
   - Added delays between requests (1.6 seconds)
   
2. **Data Privacy**:
   - Email addresses are sent to HIBP API for breach checking
   - Passwords are never sent to any external service
   
3. **Database Schema**:
   - Added `breach_info` column to store structured breach data
   - Format: JSON with `checked`, `breached`, `count`, and `breaches` fields
