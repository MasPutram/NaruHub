import { NextRequest, NextResponse } from "next/server";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  const posterServer = process.env.POSTER_SERVER_URL;
  if (!posterServer) {
    return NextResponse.json(
      { ok: false, error: "POSTER_SERVER_URL belum diset. Poster generation butuh local server." },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const res = await fetch(`${posterServer}/api/generate-poster`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": process.env.ACCESS_KEY || "",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Local server tidak bisa dihubungi: " + e.message },
      { status: 502 }
    );
  }
}
