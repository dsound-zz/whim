import { ingestTicketmasterEvents } from '../lib/ticketmaster/client';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) {
      throw new Error('TICKETMASTER_API_KEY is not set in .env');
    }
    console.log('Fetching events from Ticketmaster for New York...');
    const result = await ingestTicketmasterEvents(apiKey, 'New York');
    console.log('\n✅ Ingestion complete!');
    console.log('Result:', result);
  } catch (err) {
    console.error('❌ Failed to ingest:', err);
  } finally {
    process.exit(0);
  }
}

run();
