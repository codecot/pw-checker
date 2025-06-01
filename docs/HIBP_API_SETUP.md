# HIBP API Key Setup Guide

## 🔑 Getting Your HIBP API Key

1. **Visit the HIBP API Key page**: https://haveibeenpwned.com/API/Key
2. **Purchase an API key** (required for breach checking functionality)
3. **Copy your API key** once purchased

## 📝 Configuration

### Option 1: Using .env file (Recommended)

1. **Copy the template file**:

   ```bash
   cp .env.template .env
   ```

2. **Edit the `.env` file**:

   ```bash
   nano .env
   ```

3. **Replace `your-api-key-here`** with your actual API key:

   ```bash
   HIBP_API_KEY=your-actual-api-key-here
   ```

4. **Save the file** and exit

### Option 2: Environment Variable

Set the environment variable directly in your shell:

```bash
# For current session
export HIBP_API_KEY=your-actual-api-key-here

# For permanent setup (add to ~/.zshrc or ~/.bashrc)
echo 'export HIBP_API_KEY=your-actual-api-key-here' >> ~/.zshrc
```

## ✅ Verification

Test that your API key is working:

```bash
# Run health check to verify API key is detected
npm run health

# Test breach checking (will show warning if no API key)
npm run check:breaches
```

## 🔍 Using Breach Checking

Once your API key is set up:

```bash
# Check all email accounts for data breaches
npm run check:breaches

# View accounts that have been breached
npm run view:breached

# View detailed breach information with descriptions
npm run view:breached:detailed

# Comprehensive breach analysis (recent breaches, multi-account impacts)
npm run analyze:breaches

# Import Chrome passwords and check for breaches
npm run import:chrome
npm run check:breaches
```

## 🛡️ Security Notes

- ✅ Your API key is stored locally in `.env` (never committed to Git)
- ✅ Only email addresses are sent to HIBP (never passwords)
- ✅ All password checking uses the k-anonymity model
- ✅ Rate limiting is built-in to respect HIBP API limits

## 📊 Understanding Results

When breach checking completes, you'll see:

- **Breach count**: Number of breaches the email was found in
- **Breach details**: Service name, date, and data types exposed
- **Safe accounts**: Accounts with no known breaches

The results are stored in your local database for future reference.

### Advanced Features

- **Progress Tracking**: Check progress anytime with `npm run check:breaches:stats`
- **Resume Capability**: Continue interrupted checks with `npm run check:breaches:resume`
- **Incremental Processing**: Each API call updates multiple database entries with the same email
- **Newest-First Sorting**: Breaches are displayed with most recent incidents first

## 🆘 Troubleshooting

**"HIBP API key required" error**:

- Make sure you've set `HIBP_API_KEY` in your `.env` file
- Restart your terminal session if using environment variables
- Run `npm run health` to verify the key is detected

**"Rate limit exceeded" error**:

- HIBP has strict rate limits (1 request per 1.6 seconds)
- The tool automatically handles this, just wait for it to complete
- Consider using `--dev` flag to limit requests during testing

**"Invalid API key" error**:

- Double-check your API key is correct
- Make sure there are no extra spaces or characters
- Verify the key is still active in your HIBP account
