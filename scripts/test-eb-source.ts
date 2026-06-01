import "dotenv/config";
async function main() {
  const apiKey = process.env.EVENTBRITE_API_KEY;
  const res = await fetch(`https://www.eventbriteapi.com/v3/organizers/123/events/`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  console.log(await res.json());
}
main().catch(console.error);
