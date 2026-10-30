import { redirect } from "next/navigation";

export default function LegacyRangkumanRedirect() {
  redirect("/dashboard/inventory/rangkuman");
}
