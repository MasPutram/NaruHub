import { NextRequest, NextResponse } from "next/server";
import { eldoradoFetch } from "@/lib/eldorado";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    getTenantFromRequest(req);
    const formData = await req.formData();
    const image = formData.get("image");
    if (!image || !(image instanceof Blob)) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const uploadForm = new FormData();
    uploadForm.append("image", image);

    const res = await eldoradoFetch("/api/files/me/Offer", {
      method: "POST",
      body: uploadForm,
      headers: {},
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }

    const data = await res.json();
    const paths: string[] = data.localPaths || [];
    const strip = (p: string) => p.replace(/^\/offerimages\//, "");
    const smallImage = strip(paths.find((p: string) => p.includes("Small")) || "");
    const largeImage = strip(paths.find((p: string) => p.includes("Large")) || "");
    const originalSizeImage = strip(paths.find((p: string) => p.includes("Original")) || "");

    return NextResponse.json({ smallImage, largeImage, originalSizeImage });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
