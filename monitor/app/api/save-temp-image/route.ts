import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";

export async function POST(req: NextRequest) {
  const { base64, filename } = await req.json();
  if (!base64 || !filename) {
    return NextResponse.json({ ok: false, error: "missing params" }, { status: 400 });
  }
  const buf = Buffer.from(base64, "base64");
  const outPath = join(process.cwd(), "public", filename);
  await writeFile(outPath, buf);
  return NextResponse.json({ ok: true, path: outPath, size: buf.length });
}
