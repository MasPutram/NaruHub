import { NextRequest, NextResponse } from "next/server";
import { eldoradoFetch, ANIME_DICE_GAME_ID, STEAL_AN_EGG_GAME_ID } from "@/lib/eldorado";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    getTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const page = searchParams.get("page") || "1";
    const size = searchParams.get("size") || "50";
    const category = searchParams.get("category") || "";

    let res: Response;
    if (category === "Account") {
      res = await eldoradoFetch(
        `/api/flexibleOffersUser/me/search?pageIndex=${page}&pageSize=${size}&category=Account`,
        { method: "POST", body: JSON.stringify({}) }
      );
    } else {
      const categoryParam = category ? `&category=${encodeURIComponent(category)}` : "";
      res = await eldoradoFetch(
        `/api/v1/item-management/me/offers/me/search?pageIndex=${page}&pageSize=${size}${categoryParam}`
      );
    }

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    getTenantFromRequest(req);
    const body = await req.json();

    const items: any[] = Array.isArray(body) ? body : [body];
    const results: any[] = [];

    for (const item of items) {
      const isAccount = item.offerType === "Account";

      let payload: any;
      let endpoint: string;

      if (isAccount) {
        const details: any = {
          offerTitle: item.title,
          description: item.description || "",
          guaranteedDeliveryTime: "Instant",
          hasOriginalEmail: item.originalEmail === "Yes",
          pricing: {
            quantity: 1,
            pricePerUnit: {
              amount: item.price,
              currency: item.currency || "USD",
            },
          },
          offerImages: item.offerImages || [],
        };
        const emailDetails = (item.emailLogin || item.emailProvider) ? {
          providerUrl: item.emailProvider || "",
          login: item.emailLogin || "",
          password: item.emailPassword || "",
        } : null;
        const mfaDetails = (item.twoFaLogin || item.twoFaPassword) ? {
          login: item.twoFaLogin || "",
          password: item.twoFaPassword || "",
        } : null;
        payload = {
          details,
          ...(item.mainOfferImage ? { mainOfferImage: item.mainOfferImage } : {}),
          augmentedGame: {
            gameId: item.gameId || STEAL_AN_EGG_GAME_ID,
            category: "Account",
            tradeEnvironmentId: item.tradeEnvironmentId || null,
            offerAttributes: item.offerAttributes || [],
          },
          accountDeliveryDetails: [{
            id: null,
            accountDetails: {
              accountLogin: item.accLogin || "",
              accountPassword: item.accPassword || "",
            },
            emailDetails,
            mfaDetails,
            additionalInfo: item.additionalInfo || null,
          }],
        };
        endpoint = "/api/flexibleOffers/account";
      } else {
        const details: any = {
          offerTitle: item.title,
          description: item.description || "",
          guaranteedDeliveryTime: item.deliveryTime || "Minute20",
          pricing: {
            quantity: item.quantity ?? 1,
            pricePerUnit: {
              amount: item.price,
              currency: item.currency || "USD",
            },
            volumeDiscounts: [],
          },
          offerImages: item.offerImages || [],
        };
        if (item.mainOfferImage) {
          details.mainOfferImage = item.mainOfferImage;
        }
        payload = {
          details,
          augmentedGame: {
            gameId: item.gameId || ANIME_DICE_GAME_ID,
            category: "CustomItem",
            tradeEnvironmentId: item.tradeEnvironmentId || null,
            offerAttributes: item.offerAttributes || [],
          },
        };
        endpoint = "/api/v1/item-management/me/offers/item";
      }

      console.log(`[ELDORADO UPLOAD] ${endpoint}`, JSON.stringify(payload, null, 2));
      const res = await eldoradoFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }

      results.push({
        title: item.title,
        status: res.status,
        ok: res.ok,
        data,
        _debug: !res.ok ? { hasMainImage: !!item.mainOfferImage, mainOfferImage: item.mainOfferImage, imageCount: (item.images || []).length, offerImagesCount: (item.offerImages || []).length } : undefined,
      });
    }

    const allOk = results.every((r) => r.ok);
    return NextResponse.json({ results }, { status: allOk ? 201 : 207 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
