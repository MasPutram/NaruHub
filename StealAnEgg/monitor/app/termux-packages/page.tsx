import TermuxPackagesClient from "./PackagesClient";

// Force dynamic rendering: this page must read ACCESS_KEY from the VPS's
// runtime environment (loaded via systemd EnvironmentFile), not bake it in
// at CI build time -- the build job doesn't (and shouldn't) receive that
// secret, so a statically-prerendered page would ship an empty value.
export const dynamic = "force-dynamic";

// Server component: reads the pinned ACCESS_KEY server-side so it never
// ships in client JS -- only the rendered HTML for an already-authenticated
// admin session includes it.
export default function TermuxPackagesPage() {
  const accessKey = process.env.ACCESS_KEY || "";
  const command = accessKey
    ? `pkg update -y && pkg upgrade -y && pkg install -y curl jq && bash <(curl -fsSL "https://naruhub.my.id/api/termux/bootstrap?key=${encodeURIComponent(accessKey)}")`
    : "";

  return <TermuxPackagesClient command={command} />;
}
