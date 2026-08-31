import { NextRequest, NextResponse } from "next/server";
import { redis, petIconKey, PET_ICON_TTL_S } from "@/lib/redis";
import fs from "fs";
import path from "path";

const iconIndexPath = path.join(process.cwd(), "public/icons/index.json");
let cachedIndex: Record<string, string> | null = null;
let indexMtime = 0;

function loadIndex(): Record<string, string> {
  try {
    const stat = fs.statSync(iconIndexPath);
    if (cachedIndex && stat.mtimeMs === indexMtime) return cachedIndex;
    cachedIndex = JSON.parse(fs.readFileSync(iconIndexPath, "utf-8"));
    indexMtime = stat.mtimeMs;
    return cachedIndex!;
  } catch {
    return {};
  }
}

const CACHE_KEY_PREFIX = "peticondata:";
const IMAGE_CACHE_TTL = 60 * 60 * 24 * 30; // 30 days

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category");
  if (!category) {
    return NextResponse.json({ error: "category required" }, { status: 400 });
  }

  const index = loadIndex();
  if (index[category]) {
    const staticUrl = `/icons/normal/${encodeURIComponent(index[category])}`;
    return NextResponse.redirect(new URL(staticUrl, req.url), 302);
  }

  const cachedImage = await redis.get<string>(CACHE_KEY_PREFIX + category);
  if (cachedImage) {
    const buf = Buffer.from(cachedImage, "base64");
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  const assetId = await redis.get<string>(petIconKey(category));
  if (!assetId) {
    return NextResponse.json({ error: "no icon available" }, { status: 404 });
  }

  try {
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`
    );
    if (!thumbRes.ok) {
      return NextResponse.json({ error: "roblox api error" }, { status: 502 });
    }
    const thumbData = await thumbRes.json();
    const imageUrl = thumbData?.data?.[0]?.imageUrl;
    if (!imageUrl) {
      return NextResponse.json({ error: "no thumbnail found" }, { status: 404 });
    }

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      return NextResponse.json({ error: "image fetch failed" }, { status: 502 });
    }
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());

    await redis.set(CACHE_KEY_PREFIX + category, imgBuf.toString("base64"), { ex: IMAGE_CACHE_TTL });

    return new NextResponse(imgBuf, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
