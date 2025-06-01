# Security Guidelines for pw-checker

## 🔒 Password Data Security

This document outlines the security measures implemented in pw-checker to protect your sensitive password data.

## 📁 File Structure

```
data/
├── passwords.csv.template      ✅ Safe to commit (template data)
├── chrome-passwords.csv.template ✅ Safe to commit (template data)
├── passwords.csv              🚫 NEVER COMMITTED (real data)
└── chrome-passwords.csv       🚫 NEVER COMMITTED (real data)
```

## 🛡️ Security Measures

### 1. Git Ignore Protection
All sensitive files are protected by `.gitignore`:
```
data/passwords.csv
data/chrome-passwords.csv
data/*passwords*.csv
!data/example-*.csv
```

### 2. File Permissions
Sensitive files are set to `600` (owner read/write only):
- `data/passwords.csv` - 600
- `data/chrome-passwords.csv` - 600

### 3. Database Security
- SQLite databases are also ignored: `db/*.sqlite`
- No password data is ever logged or exposed in error messages

## 🚀 Quick Setup

### Option 1: Automated Setup
```bash
npm run security:setup
```

### Option 2: Manual Setup
```bash
# Copy templates to working files
cp data/passwords.csv.template data/passwords.csv
cp data/chrome-passwords.csv.template data/chrome-passwords.csv

# Set secure permissions
chmod 600 data/passwords.csv
chmod 600 data/chrome-passwords.csv
```

## ✅ Security Verification

Run this command to verify your security setup:
```bash
npm run health
```

Check Git ignore status:
```bash
git check-ignore data/passwords.csv data/chrome-passwords.csv
```
Both files should be ignored.

## 📝 Best Practices

### DO:
- ✅ Use the template files as starting points
- ✅ Keep real password files local only
- ✅ Run `npm run health` regularly
- ✅ Use environment variables for API keys
- ✅ Set restrictive file permissions

### DON'T:
- 🚫 Never commit real password data
- 🚫 Don't share CSV files via email/chat
- 🚫 Don't store passwords in cloud sync folders
- 🚫 Don't disable the security measures

## 🔄 Data Flow

1. **Import**: CSV files → SQLite database (local only)
2. **Process**: Database → HIBP API checks → Updated database
3. **Export**: Database → Query results (no passwords in output)

## 🚨 In Case of Accident

If you accidentally commit password data:

### Immediate Actions:
1. **Remove from staging**: `git reset HEAD data/passwords.csv`
2. **Remove from working tree**: `git checkout -- data/passwords.csv`
3. **Verify**: `git status` should show file as ignored

### If Already Committed:
1. **Remove from history**: `git filter-branch --index-filter 'git rm --cached --ignore-unmatch data/passwords.csv' HEAD`
2. **Force push**: `git push origin --force`
3. **Change affected passwords immediately**

## 🆘 Emergency Recovery

If you suspect your password data has been exposed:
1. **Immediately change all affected passwords**
2. **Enable 2FA where possible**
3. **Monitor accounts for suspicious activity**
4. **Consider running breach checks more frequently**

## 📞 Security Questions?

For security-related questions or concerns:
- Review this document first
- Run `npm run health` to check your setup
- Check `.gitignore` patterns are working
- Verify file permissions are restrictive

Remember: **Your security is only as strong as your weakest link.** Keep your password data local, secure, and private.
