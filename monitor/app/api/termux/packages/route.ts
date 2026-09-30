import { NextResponse } from "next/server";

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

export async function GET() {
  return NextResponse.json({ ok: true, packages: PACKAGES });
}
