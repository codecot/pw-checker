#!/bin/bash

# pw-checker Security Setup Script
# This script helps set up the password files securely

echo "🔒 pw-checker Security Setup"
echo "=============================="
echo

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "data" ]; then
    echo "❌ Please run this script from the pw-checker root directory"
    exit 1
fi

echo "📁 Setting up secure password file structure..."

# Create data directory if it doesn't exist
mkdir -p data

# Copy templates to actual files if they don't exist
if [ ! -f "data/passwords.csv" ]; then
    if [ -f "data/passwords.csv.template" ]; then
        cp "data/passwords.csv.template" "data/passwords.csv"
        echo "✅ Created data/passwords.csv from template"
    else
        echo "name,url,username,password" > "data/passwords.csv"
        echo "✅ Created empty data/passwords.csv"
    fi
else
    echo "ℹ️  data/passwords.csv already exists"
fi

if [ ! -f "data/chrome-passwords.csv" ]; then
    if [ -f "data/chrome-passwords.csv.template" ]; then
        cp "data/chrome-passwords.csv.template" "data/chrome-passwords.csv"
        echo "✅ Created data/chrome-passwords.csv from template"
    else
        echo "name,url,username,password,note" > "data/chrome-passwords.csv"
        echo "✅ Created empty data/chrome-passwords.csv"
    fi
else
    echo "ℹ️  data/chrome-passwords.csv already exists"
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    if [ -f ".env.template" ]; then
        cp ".env.template" ".env"
        echo "✅ Created .env from template"
        echo "⚠️  Please edit .env and add your HIBP API key"
    else
        echo "# pw-checker Environment Configuration" > ".env"
        echo "# Get your API key from: https://haveibeenpwned.com/API/Key" >> ".env"
        echo "HIBP_API_KEY=your-api-key-here" >> ".env"
        echo "✅ Created .env file"
        echo "⚠️  Please edit .env and add your HIBP API key"
    fi
else
    echo "ℹ️  .env file already exists"
fi

echo
echo "🔐 Security Status:"
echo "==================="

# Check if files are properly ignored
if git check-ignore data/passwords.csv >/dev/null 2>&1; then
    echo "✅ data/passwords.csv is properly ignored by Git"
else
    echo "⚠️  data/passwords.csv is NOT ignored by Git"
fi

if git check-ignore data/chrome-passwords.csv >/dev/null 2>&1; then
    echo "✅ data/chrome-passwords.csv is properly ignored by Git"
else
    echo "⚠️  data/chrome-passwords.csv is NOT ignored by Git"
fi

# Set restrictive permissions
chmod 600 data/passwords.csv 2>/dev/null
chmod 600 data/chrome-passwords.csv 2>/dev/null
echo "✅ Set restrictive file permissions (600)"

echo
echo "📝 Next Steps:"
echo "=============="
echo "1. Add your passwords to data/passwords.csv"
echo "2. Export Chrome passwords to data/chrome-passwords.csv"
echo "3. Set up HIBP API key in .env file (see docs/HIBP_API_SETUP.md)"
echo "4. Run 'npm start' to import and check passwords"
echo "5. Use 'npm run check:breaches' for account breach checking"
echo "6. These files will never be committed to Git"
echo
echo "🛡️  Your password data is now secure!"
