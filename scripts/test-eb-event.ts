import "dotenv/config";
import { extractEventbriteId } from "../src/lib/utils/resolveEventbriteUrl";

async function main() {
  const apiKey = process.env.EVENTBRITE_API_KEY;
  const url = "https://www.eventbrite.com/e/the-black-mans-health-festival-5-year-anniversary-tickets-1985989283408?aff=ebdssbcategorybrowse";
  const id = await extractEventbriteId(url, apiKey as string);
  console.log("Extracted ID:", id);
}
main().catch(console.error);
