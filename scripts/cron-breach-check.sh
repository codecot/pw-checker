#!/bin/bash
# Cron script for scheduled breach checking
# This script runs a single batch of breach checks and is designed for cron jobs
#
# Example crontab entry (run every 10 minutes):
# */10 * * * * /home/volo/projects/pw-checker/scripts/cron-breach-check.sh >> /var/log/pw-checker-cron.log 2>&1

# Change to the project directory
cd "$(dirname "$0")/.."

# Add timestamp
echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting scheduled breach check"

# Source environment variables if .env exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Run the scheduled breach check
npm run check:breaches:scheduled

# Check exit status
if [ $? -eq 0 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Scheduled breach check completed successfully"
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Scheduled breach check failed with exit code $?"
fi
