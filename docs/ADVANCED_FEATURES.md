# Advanced Features Documentation

This document details the sophisticated features implemented in pw-checker for efficient breach checking and data management.

## 🚀 Incremental API Processing

### Overview

One of pw-checker's most powerful optimizations is **incremental processing** - each HIBP API call updates multiple database entries intelligently.

### How It Works

```
Database State:
├── Entry 1: user@example.com | Password: abc123
├── Entry 2: user@example.com | Password: xyz789  
├── Entry 3: user@example.com | Password: def456
└── Entry 4: other@domain.com | Password: qwe123

API Processing:
1. Check user@example.com (1 API call)
   └── Updates Entries 1, 2, and 3 simultaneously
2. Check other@domain.com (1 API call)
   └── Updates Entry 4

Result: 2 API calls affect 4 database entries
```

### Implementation Benefits

- **Efficiency**: Reduces API calls by up to 90% for databases with duplicate emails
- **Cost Savings**: Minimizes API quota usage for paid HIBP plans
- **Speed**: Faster processing for large databases
- **Accuracy**: Ensures consistent breach information across duplicate emails

### Code Implementation

Located in `src/checkBreaches.ts`, the system uses:

```sql
-- Single API call checks one email
SELECT email FROM unique_emails WHERE email = 'user@example.com'

-- Update ALL entries with that email
UPDATE pw_entries SET breach_info = ? WHERE LOWER(username) = LOWER(?)
```

This approach ensures that checking `user@example.com` once updates all password entries for that email address.

## 🔄 Resume & Progress Tracking

### Intelligent Resume Capability

The system maintains detailed state tracking, allowing you to resume interrupted operations:

```bash
# Start breach checking
npm run check:breaches

# If interrupted, resume from where you left off
npm run check:breaches:resume
```

### Progress Database State

The system tracks:

- ✅ **Checked emails**: Emails already processed
- 📊 **Progress statistics**: Real-time completion percentages
- 🔍 **Breach results**: Detailed breach information stored
- ⏰ **Timestamps**: When each check was performed

### Implementation Details

Progress is stored in the database using the `breach_info` column:

```json
{
  "checked": true,
  "breached": false,
  "checkedAt": "2024-01-15T10:30:00Z",
  "count": 0,
  "breaches": []
}
```

## 📊 Comprehensive Analytics

### Breach Analysis Tool

Access advanced breach analytics with:

```bash
npm run analyze:breaches
```

### Features Include

1. **Recent Breaches Analysis** (last 2 years)
   - Highlights recent security incidents
   - Shows newest breaches first
   - Focuses on time-sensitive threats

2. **Multi-Account Impact Assessment**
   - Identifies breaches affecting multiple of your email addresses
   - Cross-references breach impact across accounts
   - Helps prioritize security actions

3. **Domain Statistics**
   - Shows most frequently breached domains
   - Identifies patterns in your breach exposure
   - Helps assess service reliability

4. **Detailed Breach Information**
   - Breach descriptions and affected data types
   - Account counts and severity assessment
   - Timeline of security incidents

### Detailed Breach Views

For in-depth breach analysis:

```bash
# Basic breach view
npm run view:breached

# Detailed breach information with descriptions
npm run view:breached:detailed
```

The detailed view includes:

- 📅 **Breach dates** (newest first)
- 🏢 **Service information** (name, domain)
- 📊 **Impact scale** (total accounts affected)
- 🔍 **Data types exposed** (emails, passwords, personal info)
- 📝 **Breach descriptions** (what happened)

## ⚡ Smart Rate Limiting

### Adaptive Batch Processing

The system implements sophisticated rate limiting:

```typescript
const RATE_LIMIT = {
  requestsPerMinute: 10,     // API plan limit
  batchSize: 8,              // Accounts per batch (buffer included)
  delayBetweenRequests: 7000, // 7 seconds between requests
  delayBetweenBatches: 70000, // 70 seconds between batches
}
```

### Features

1. **Conservative Buffering**: Always leaves headroom to prevent rate limit violations
2. **Exponential Backoff**: Automatic retry with increasing delays for rate limit errors
3. **Progress Visualization**: Real-time ETA calculations and progress tracking
4. **Graceful Error Handling**: Continues processing even if individual requests fail

### Scheduled Processing

For large databases with limited API quotas:

```bash
# Process one batch at a time (perfect for cron)
npm run check:breaches:scheduled

# Set up automated processing
crontab -e
# Add: */10 * * * * /path/to/scripts/cron-breach-check.sh
```

## 🎯 Email Deduplication Optimization

### Smart Unique Email Processing

Instead of checking every database entry, the system:

1. **Extracts unique emails**: `GROUP BY LOWER(username)`
2. **Checks each email once**: Single API call per unique email
3. **Updates all related entries**: Applies results to all matching records

### Real-World Impact

```
Example Database:
- 1,000 total password entries
- 150 unique email addresses
- Traditional approach: 1,000 API calls
- pw-checker approach: 150 API calls
- Efficiency gain: 85% reduction in API usage
```

## 🔐 Database State Management

### Schema Evolution

The system includes automatic schema updates:

```bash
npm run update:schema
```

This adds new columns as features are developed, ensuring backward compatibility.

### Breach Information Storage

Breach data is stored as structured JSON:

```json
{
  "checked": true,
  "breached": true,
  "checkedAt": "2024-01-15T10:30:00Z",
  "count": 3,
  "breaches": [
    {
      "name": "Adobe",
      "title": "Adobe",
      "domain": "adobe.com", 
      "date": "2013-10-04",
      "dataTypes": ["Emails", "Passwords", "Names"]
    }
  ]
}
```

### Data Consistency

All entries sharing the same email address maintain consistent breach information, ensuring data integrity across the database.

## 📈 Performance Optimizations

### Key Performance Features

1. **SQLite Optimization**: Efficient queries using indexes on email addresses
2. **Memory Management**: Streams data processing to handle large databases
3. **Batch Processing**: Groups operations to minimize database transactions
4. **Lazy Loading**: Only loads necessary data when needed

### Scalability

The system is designed to handle:

- ✅ **Small databases**: < 100 unique emails (real-time processing)
- ✅ **Medium databases**: 100-500 unique emails (batch processing)
- ✅ **Large databases**: 500+ unique emails (scheduled processing)

## 🛠 Development Features

### Health Checking

Comprehensive system verification:

```bash
npm run health
```

Checks:

- Database connectivity
- HIBP API key configuration
- File permissions
- Directory structure

### Progress Statistics

Detailed progress reporting:

```bash
npm run check:breaches:stats
```

Provides:

- Total vs checked email counts
- Breach vs safe statistics
- ETA calculations
- Database entry impact metrics

## 🎉 Summary

pw-checker's advanced features provide:

- **Maximum API Efficiency**: Up to 90% reduction in API calls
- **Intelligent Resume**: Never lose progress on interrupted operations
- **Comprehensive Analytics**: Deep insights into breach patterns
- **Production Ready**: Designed for real-world use with large databases
- **Developer Friendly**: Extensive tooling and health checking

These features make pw-checker suitable for everything from personal password auditing to enterprise-scale security assessments.
