# Rate Limiting and Batch Processing Guide

## Overview

The pw-checker tool implements sophisticated rate limiting and batch processing to work efficiently with HIBP API limits. This is especially important for users with limited API plans.

## API Rate Limits

HIBP API has different rate limits depending on your subscription tier:

- **Free**: No access to breach search API
- **Pwned 1**: 10 requests per minute
- **Pwned 2**: 100 requests per minute  
- **Pwned 3**: 1,000 requests per minute
- **Pwned 4**: 10,000 requests per minute

## Key Optimizations

### 1. **Unique Email Deduplication**

The tool only checks each unique email address once, regardless of how many password entries use the same email. This can dramatically reduce API calls.

**Example:**

- Database has 1,000 password entries
- Only 150 unique email addresses
- **Result**: Only 150 API calls needed instead of 1,000!

### 2. **Batch Processing**

Accounts are processed in batches with proper delays between batches to respect rate limits.

### 3. **Resume Capability**

If the process is interrupted, you can resume from where it left off using the `--resume` flag.

### 4. **Incremental Multi-Entry Updates**

When an email is checked, the result is intelligently applied to ALL database entries sharing that email address. This means:

**Example:**
- Email `user@example.com` appears in 5 different password entries
- **1 API call** checks the email for breaches  
- **All 5 entries** get updated with the breach information
- **Result**: Maximum efficiency with minimal API usage

### 5. **Progress Tracking**

The tool tracks which emails have been checked and provides detailed progress information.

## Usage Examples

### Check Breach Statistics

```bash
npm run check:breaches:stats
```

Shows current progress and estimates completion time.

### Start Breach Checking (Full Run)

```bash
npm run check:breaches
```

Checks all email addresses in the database.

### Resume Interrupted Check

```bash
npm run check:breaches:resume
```

Only checks emails that haven't been checked yet.

### Limited Batch (Development/Testing)

```bash
npm run check:breaches -- --limit=10
```

Only checks the first 10 unique email addresses.

### Scheduled/Cron Mode

```bash
npm run check:breaches:scheduled
```

Processes a single batch (8 accounts by default) and exits. Perfect for cron jobs.

## Rate Limiting Configuration

The rate limiting is configured in `src/checkBreaches.ts`:

```typescript
const RATE_LIMIT = {
  requestsPerMinute: 10,     // Your API limit
  batchSize: 8,              // Accounts per batch (leaves buffer)
  delayBetweenRequests: 7000, // 7 seconds between requests
  delayBetweenBatches: 70000, // 70 seconds between batches
};
```

### For Different API Tiers

**Pwned 1 (10 req/min)** - Current default:

```typescript
requestsPerMinute: 10,
batchSize: 8,
delayBetweenRequests: 7000,  // 7 seconds
delayBetweenBatches: 70000,  // 70 seconds
```

**Pwned 2 (100 req/min)**:

```typescript
requestsPerMinute: 100,
batchSize: 80,
delayBetweenRequests: 700,   // 0.7 seconds
delayBetweenBatches: 7000,   // 7 seconds
```

**Pwned 3 (1000 req/min)**:

```typescript
requestsPerMinute: 1000,
batchSize: 800,
delayBetweenRequests: 70,    // 0.07 seconds
delayBetweenBatches: 1000,   // 1 second
```

## Automated Scheduling with Cron

For users with very limited API rates, you can set up automated batch processing:

### 1. **Setup Cron Job**

```bash
# Edit your crontab
crontab -e

# Add this line to run every 10 minutes:
*/10 * * * * /home/volo/projects/pw-checker/scripts/cron-breach-check.sh >> /var/log/pw-checker-cron.log 2>&1
```

### 2. **Alternative: Custom Schedule**

```bash
# Run once per hour
0 * * * * /home/volo/projects/pw-checker/scripts/cron-breach-check.sh

# Run every 30 minutes during business hours
*/30 9-17 * * 1-5 /home/volo/projects/pw-checker/scripts/cron-breach-check.sh

# Run every 2 hours
0 */2 * * * /home/volo/projects/pw-checker/scripts/cron-breach-check.sh
```

### 3. **Monitor Progress**

```bash
# Check current progress
npm run check:breaches:stats

# View log file
tail -f /var/log/pw-checker-cron.log
```

## Error Handling

### Rate Limit Exceeded

- **Exponential backoff**: Automatically retries with increasing delays
- **Max retries**: Stops after 3 failed attempts
- **Resume capability**: Continue from where you left off

### Network Errors

- **Graceful handling**: Errors are logged but don't stop the entire process
- **Progress preservation**: Successfully checked emails are saved immediately

### Interruption Recovery

- **State tracking**: Database keeps track of checked emails
- **Resume flag**: `--resume` skips already-checked emails
- **Progress reporting**: Shows exactly what's left to check

## Best Practices

### 1. **Check Statistics First**

Always run `npm run check:breaches:stats` to see current progress.

### 2. **Use Resume for Interruptions**

If a process is interrupted, use `--resume` to continue.

### 3. **Monitor Rate Limits**

Watch for rate limit warnings and adjust timing if needed.

### 4. **Use Cron for Large Datasets**

For thousands of emails with a low-tier API plan, use scheduled processing.

### 5. **Batch Size Optimization**

- Leave 20% buffer in batch sizes (e.g., 8 requests for 10 req/min limit)
- Increase delays between batches if you hit rate limits frequently

## Troubleshooting

### "Rate limit exceeded" Messages

- **Cause**: API calls are too frequent
- **Solution**: Increase `delayBetweenRequests` and `delayBetweenBatches`

### Process Takes Too Long

- **Cause**: Conservative rate limiting
- **Solution**: If you have a higher-tier API plan, adjust the rate limit configuration

### Incomplete Results

- **Cause**: Process was interrupted
- **Solution**: Use `npm run check:breaches:resume` to continue

### Duplicate Processing

- **Cause**: Running multiple instances simultaneously
- **Solution**: Ensure only one instance runs at a time

## Example Workflows

### Small Dataset (< 100 unique emails)

```bash
# Check progress
npm run check:breaches:stats

# Run full check
npm run check:breaches
```

### Medium Dataset (100-500 unique emails)

```bash
# Check progress
npm run check:breaches:stats

# Start processing
npm run check:breaches

# If interrupted, resume
npm run check:breaches:resume
```

### Large Dataset (500+ unique emails)

```bash
# Check progress
npm run check:breaches:stats

# Set up cron job for automated processing
crontab -e
# Add: */10 * * * * /path/to/scripts/cron-breach-check.sh

# Monitor progress periodically
npm run check:breaches:stats
```

This approach ensures efficient use of your HIBP API quota while maintaining reliable progress tracking and recovery capabilities.
