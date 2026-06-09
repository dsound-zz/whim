"use server";

import { fetchAdminEvents } from "@/lib/db/eventService";
import type { AdminEvent } from "@/types";
import type { FetchAdminEventsParams } from "@/lib/db/eventService";

/**
 * Server action that delegates to the service layer.
 * All filtering happens in fetchAdminEvents(); the route layer
 * is purely a thin adapter — no raw SQL here.
 */
export async function fetchAdminEventsAction(
  params: FetchAdminEventsParams = {}
): Promise<AdminEvent[]> {
  return fetchAdminEvents(params);
}
