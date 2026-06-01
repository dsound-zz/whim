import "dotenv/config";
import { db } from "@/db";
import { ingestionSources } from "@/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  await db.delete(ingestionSources).where(eq(ingestionSources.type, "eventbrite_api"));
  console.log("Deleted all Eventbrite sources.");
}
main().catch(console.error);
