import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get("placeId");
  if (!placeId || !/^\d+$/.test(placeId)) {
    return NextResponse.json({ ok: false, error: "placeId required" }, { status: 400 });
  }

  const sortOrder = req.nextUrl.searchParams.get("sortOrder") || "Asc";
  const cursor = req.nextUrl.searchParams.get("cursor") || "";
  const limit = req.nextUrl.searchParams.get("limit") || "100";

  const url = new URL(`https://games.roblox.com/v1/games/${placeId}/servers/0`);
  url.searchParams.set("sortOrder", sortOrder);
  url.searchParams.set("excludeFullGames", "true");
  url.searchParams.set("limit", limit);
  if (cursor) url.searchParams.set("cursor", cursor);

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { ok: false, error: `Roblox API ${res.status}: ${text}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json({ ok: true, ...data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
