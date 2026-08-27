import { NextRequest, NextResponse } from "next/server";
import { redis, detailKey } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get("account") || "";
  if (!account) {
    return NextResponse.json({ ok: false, error: "Missing account param" }, { status: 400 });
  }

  try {
    const raw = await redis.get<string>(detailKey(account));
    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Belum ada data lengkap buat akun ini." },
        { status: 404 }
      );
    }
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return NextResponse.json({
      ok: true,
      sourceAccount: account,
      activePets: data.activePets || [],
      activeLimit: data.activeLimit ?? null,
      allPets: data.allPets || [],
      growingEggs: data.growingEggs || [],
      backpackEggs: data.backpackEggs || [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
