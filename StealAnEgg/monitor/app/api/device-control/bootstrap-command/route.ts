import { NextResponse } from "next/server";

export async function GET() {
  const accessKey = process.env.ACCESS_KEY || "";
  if (!accessKey) {
    return NextResponse.json({ ok: false, command: "" });
  }
  const command = `pkg update -y && pkg upgrade -y && pkg install -y curl jq && bash <(curl -fsSL "https://naruhub.my.id/api/termux/bootstrap?key=${encodeURIComponent(accessKey)}")`;
  return NextResponse.json({ ok: true, command });
}
