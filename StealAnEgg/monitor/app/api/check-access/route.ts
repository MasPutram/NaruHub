import { NextRequest, NextResponse } from "next/server";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  try {
    const { key } = await req.json();
    const accessKey = process.env.ACCESS_KEY;
    if (!accessKey) {
      return NextResponse.json({ ok: false, error: "Server belum dikonfigurasi." }, { status: 500 });
    }
    if (key === accessKey) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "Key salah atau belum diisi." }, { status: 401 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
