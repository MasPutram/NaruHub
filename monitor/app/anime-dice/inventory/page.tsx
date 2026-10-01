import { redirect } from "next/navigation";

// Old inventory route; permanently moved to /inventory. Redirect anyone
// hitting the legacy URL (bookmarks, stale links in posters, etc.).
export default function LegacyInventoryRedirect() {
  redirect("/inventory");
}
