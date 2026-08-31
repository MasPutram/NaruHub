import TermuxPackagesClient from "./PackagesClient";

// Server component: reads the pinned ACCESS_KEY server-side so it never
// ships in client JS -- only the rendered HTML for an already-authenticated
// admin session includes it.
export default function TermuxPackagesPage() {
  const accessKey = process.env.ACCESS_KEY || "";
  const command = accessKey
    ? `bash <(curl -fsSL "https://naruhub.my.id/api/termux/bootstrap?key=${encodeURIComponent(accessKey)}")`
    : "";

  return <TermuxPackagesClient command={command} />;
}
