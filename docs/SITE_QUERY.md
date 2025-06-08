# Site-Based Credential Query Implementation

## Overview

The site-based credential query feature allows users to search for credentials associated with specific domains. This feature provides powerful domain matching capabilities with intelligent normalization and fuzzy search.

## Key Features

### 1. 🔍 Smart Domain Searching
- **Exact Match**: `--exact-match` flag for precise domain matching
- **Fuzzy Search**: Default behavior allows partial domain matching
- **Domain Normalization**: Automatically handles www prefixes, subdomains, and special services

### 2. 🌐 Domain Normalization
- Removes `www.` prefixes automatically
- Handles special cases for major services:
  - `accounts.google.com` → `google.com`
  - `login.microsoftonline.com` → `microsoft.com`
  - `signin.aws.amazon.com` → `aws.amazon.com`
  - And many more...

### 3. 📊 Rich Output Formats
- **Table Format**: Human-readable output with colors and icons
- **JSON Format**: Machine-readable output for automation
- **Password Masking**: Passwords hidden by default, revealed with `--show-passwords`
- **Password Support**: Full password display when imported from Chrome CSV exports

### 4. 🎯 Intelligent Search Scoring
- Results ranked by domain relevance
- Exact matches prioritized
- Subdomain matches get high scores
- Partial matches get lower scores

## Usage Examples

### Basic Site Search
```bash
npm run view:site -- --site=google.com
npm run view:site -- --site=github
npm run view:site -- --site=amazon
```

### Advanced Options
```bash
# Show passwords
npm run view:site -- --site=github.com --show-passwords

# Exact match only
npm run view:site -- --site=google.com --exact-match

# JSON output
npm run view:site -- --site=netflix --json
```

### Help Information
```bash
npm run view:site:help
```

## Implementation Details

### Database Schema
The implementation adds a `normalized_domain` column to the `pw_entries` table:

```sql
ALTER TABLE pw_entries ADD COLUMN normalized_domain TEXT;
```

### Domain Normalization Algorithm
1. **URL Parsing**: Extract hostname from full URLs
2. **Protocol Handling**: Add HTTPS if no protocol specified
3. **www Removal**: Strip www. prefixes
4. **Special Cases**: Apply service-specific normalization rules
5. **Fallback**: Manual parsing for invalid URLs

### Search Algorithm
1. **Normalization**: Normalize the search term using the same algorithm
2. **Database Query**: Search `normalized_domain` column
3. **Fuzzy Matching**: Use SQL LIKE patterns for partial matches
4. **Scoring**: Calculate relevance scores for ranking
5. **Sorting**: Order results by score (highest first)

## File Structure

### Core Files
- `src/querySite.ts` - Main site query interface
- `src/domainNormalizer.ts` - Domain normalization utilities
- `src/updateDbSchema.ts` - Database schema management
- `src/migrateDomains.ts` - Migration script for existing data

### Updated Import Functions
All import functions now populate the `normalized_domain` field:
- `src/importFromChrome.ts` - Chrome browser import
- `src/importFromChromeCsv.ts` - Chrome CSV export import
- `src/importFromBitwarden.ts` - Bitwarden vault import

## Migration and Setup

### For New Installations
The database schema is automatically created with the `normalized_domain` column.

### For Existing Installations
1. **Update Schema**: `npm run db:update-schema`
2. **Migrate Domains**: `npm run db:migrate-domains` (optional, schema update handles this)

## Performance Considerations

### Database Indexing
Consider adding an index for better performance on large datasets:
```sql
CREATE INDEX idx_normalized_domain ON pw_entries(normalized_domain);
```

### Memory Usage
- Domain normalization is performed in-memory
- Large result sets are streamed for efficiency
- JSON output uses minimal memory footprint

## Security Features

### Password Protection
- Passwords are masked by default in output
- `--show-passwords` flag required for password revelation
- JSON output includes passwords only when requested

### Data Privacy
- No external API calls required
- All processing happens locally
- Domain normalization preserves original URLs

## Error Handling

### Common Issues
1. **Schema Not Updated**: Prompts user to run `npm run db:update-schema`
2. **No Results Found**: Provides helpful suggestions for broader searches
3. **Invalid Domains**: Graceful handling of malformed URLs
4. **Database Errors**: Clear error messages with troubleshooting steps

### Recovery Procedures
```bash
# Fix missing schema
npm run db:update-schema

# Repair domain data
npm run db:migrate-domains

# Check database health
npm run health
```

## Future Enhancements

### Planned Features
1. **Wildcard Search**: Support for `*.domain.com` patterns
2. **Category Filtering**: Combine site search with category filters
3. **Export Integration**: Export site-specific credential sets
4. **Risk Analysis**: Site-specific risk scoring and recommendations

### API Integration
- REST API endpoints for programmatic access
- Webhook support for automated monitoring
- Integration with password managers

## Integration Examples

### Automation Scripts
```bash
# Get all GitHub credentials in JSON
npm run view:site -- --site=github --json > github-creds.json

# Check critical banking sites
for site in chase.com wellsfargo.com bankofamerica.com; do
  echo "=== $site ==="
  npm run view:site -- --site=$site --exact-match
done
```

### Monitoring
```bash
# Daily security check
npm run view:site -- --site=google --json | jq '.[] | select(.risk_score > 70)'
```

This implementation provides a robust foundation for site-based credential management with room for future enhancements and integrations.
