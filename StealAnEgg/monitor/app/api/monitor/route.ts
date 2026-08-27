import { NextRequest, NextResponse } from "next/server";
import { redis, accountKey, detailKey, ACCOUNT_TTL_S } from "@/lib/redis";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  const accessKey = process.env.ACCESS_KEY;
  const headerKey = req.headers.get("x-access-key");
  if (accessKey && headerKey !== accessKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await req.json();
    const name = data.sourceAccount || "?";

    const summary = {
      money: data.money ?? null,
      speed: data.speed ?? null,
      income: data.income ?? null,
      incomeAktif: data.incomeAktif ?? null,
      incomeEggBackpack: data.incomeEggBackpack ?? null,
      incomeEggSedangTumbuh: data.incomeEggSedangTumbuh ?? null,
      highValuePetTotal: data.highValuePetTotal ?? null,
      kandangLevel: data.kandangLevel ?? null,
      treadmillLevel: data.treadmillLevel ?? null,
      petsCount: data.petsCount ?? 0,
      stolenCount: data.stolenCount ?? 0,
      topPets: data.topPets || [],
      lastSeen: Date.now() / 1000,
      deviceId: req.headers.get("x-device-id") || "unknown",
    };

    const pipeline = redis.pipeline();
    pipeline.set(accountKey(name), JSON.stringify(summary), { ex: ACCOUNT_TTL_S });

    if (data.fullData) {
      pipeline.set(detailKey(name), JSON.stringify(data.fullData), { ex: ACCOUNT_TTL_S });
    }

    await pipeline.exec();

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
