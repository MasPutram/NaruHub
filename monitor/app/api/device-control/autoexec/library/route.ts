import { NextRequest, NextResponse } from "next/server";
import { redis, autoexecLibraryKey, autoexecLibraryIndexKey } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

// Global script library. Persistent across devices -- the operator saves a
// script here once and can re-deploy it anywhere.

export const dynamic = "force-dynamic";

function toSlug(name: string): string {
  return name
    .replace(/\.lua$/i, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function GET(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);
    const t = tenant || undefined;
    const slugs = await redis.smembers(autoexecLibraryIndexKey(t));
    if (slugs.length === 0) return NextResponse.json({ ok: true, scripts: [] });
    const raw = await redis.mget(...slugs.map((s) => autoexecLibraryKey(s, t)));
    const scripts = raw
      .map((v, i) => {
        if (!v) return null;
        try {
          const s = typeof v === "string" ? JSON.parse(v) : v;
          return { slug: slugs[i], ...s };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return NextResponse.json({ ok: true, scripts });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, scripts: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);
    const t = tenant || undefined;
    const body = await req.json();
    const filename = String(body.filename || "").trim();
    const content = String(body.content || "");
    if (!filename) return NextResponse.json({ ok: false, error: "filename required" }, { status: 400 });
    if (!filename.toLowerCase().endsWith(".lua")) {
      return NextResponse.json({ ok: false, error: "filename must end with .lua" }, { status: 400 });
    }
    if (content.length > 200_000) {
      return NextResponse.json({ ok: false, error: "script too large (max 200KB)" }, { status: 400 });
    }
    const slug = toSlug(filename);
    if (!slug) return NextResponse.json({ ok: false, error: "filename produced empty slug" }, { status: 400 });

    const entry = { filename, content, updatedAt: Date.now() };
    await redis.set(autoexecLibraryKey(slug, t), JSON.stringify(entry));
    await redis.sadd(autoexecLibraryIndexKey(t), slug);
    return NextResponse.json({ ok: true, slug });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);
    const t = tenant || undefined;
    const slug = req.nextUrl.searchParams.get("slug");
    if (!slug) return NextResponse.json({ ok: false, error: "slug required" }, { status: 400 });
    await redis.del(autoexecLibraryKey(slug, t));
    await redis.srem(autoexecLibraryIndexKey(t), slug);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
