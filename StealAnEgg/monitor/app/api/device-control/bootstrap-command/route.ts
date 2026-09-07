import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const accessKey = process.env.ACCESS_KEY || "";
  if (!accessKey) {
    return NextResponse.json({ ok: false, command: "" });
  }
  const key = encodeURIComponent(accessKey);
  // Single-line bootstrap: the installer endpoint returns a bash script
  // that does the whole setup (mirror config, pkg install, config seed,
  // auto-restart supervisor around the Lua agent). Iterating on setup
  // steps no longer requires the operator to copy a new command -- they
  // just re-run the same one and get the latest installer.
  const command = `curl -s "https://naruhub.my.id/api/termux/install?key=${key}" | bash`;
  return NextResponse.json({ ok: true, command });
}
