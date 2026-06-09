import { redirect } from "next/navigation";

/**
 * The admin/verification route is now unified under admin/events (Integrity tab).
 * Redirect permanently so any bookmarks or links continue to work.
 */
export default function AdminVerificationRedirect() {
  redirect("/admin/events?tab=integrity");
}
