#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "====================================="
echo " Starting Full Ingestion Pipeline    "
echo "====================================="

echo "1/6: Syncing Ticketmaster..."
npm run sync:ticketmaster

echo "2/6: Syncing Eventbrite (DISABLED)"
# npm run sync:eventbrite

echo "3/6: Syncing NYC Parks..."
npm run sync:nyc-parks

echo "4/6: Scraping Dice..."
npm run scrape:dice

echo "5/6: Scraping Songkick..."
npm run scrape:songkick

echo "6/6: Running Bandsintown Enrichment..."
npm run enrich:bandsintown

echo "7/7: Running Event Cleanup Job..."
npm run cleanup:events

echo "====================================="
echo " 🎉 All scripts completed successfully!"
echo "====================================="
