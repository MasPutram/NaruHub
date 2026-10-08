import { NextRequest, NextResponse } from "next/server";
import { redis, accountKey, detailKey } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { tenant } = getTenantFromRequest(req);
  const t = tenant || undefined;

  try {
    const { account } = await req.json();
    if (!account) {
      return NextResponse.json({ ok: false, error: "Missing account" }, { status: 400 });
    }

    await redis.del(accountKey(account, t));
    await redis.del(detailKey(account, t));

    return NextResponse.json({ ok: true, account });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
