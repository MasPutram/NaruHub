import { NextRequest, NextResponse } from "next/server";
import { isValidKey } from "@/lib/auth";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  try {
    const { key } = await req.json();
    if (!key || typeof key !== "string") {
      return NextResponse.json({ ok: false, error: "Key diperlukan." }, { status: 400 });
    }
    if (isValidKey(key)) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "Key salah atau belum diisi." }, { status: 401 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
