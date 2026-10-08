import { NextRequest, NextResponse } from "next/server";
import { getTenantFromRequest } from "@/lib/auth";

const PACKAGES = [
  {
    id: "steal-an-egg",
    name: "Steal An Egg",
    description: "Auto farming bot for Steal An Egg game",
    version: "1.0.0",
  },
];

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function GET(req: NextRequest) {
  const { tenant, authed, error } = getTenantFromRequest(req);
  if (!authed) return NextResponse.json({ ok: false, error: error || "Unauthorized" }, { status: 401 });

  return NextResponse.json({ ok: true, packages: PACKAGES });
}
