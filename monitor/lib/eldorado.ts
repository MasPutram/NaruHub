const BASE = "https://www.eldorado.gg";

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.token;
  }

  const clientId = process.env.ELDORADO_CLIENT_ID;
  const clientSecret = process.env.ELDORADO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("ELDORADO_CLIENT_ID / ELDORADO_CLIENT_SECRET not set");

  const res = await fetch(`${BASE}/api/authentication/seller/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Eldorado auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.accessToken,
    expiresAt: Date.now() + (data.expiresIn ?? 900) * 1000,
  };
  return cachedToken.token;
}

export async function eldoradoFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "swagger": "Swager request",
    ...(opts.headers as Record<string, string> || {}),
  };
  if (opts.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${BASE}${path}`, { ...opts, headers });
}

export const ANIME_DICE_GAME_ID = "476";
