import { forge } from "@/lib/forge";
import { logoPrompt } from "@/lib/logo";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

// Real image gen: Pollinations FLUX.1-schnell, key from env only.
async function fluxLogo(name: string, ticker: string, desc: string, style: string): Promise<{ url: string | null; model: string; creditNote: string }> {
  const key = process.env.POLLINATIONS_API_KEY;
  const prompt = logoPrompt(name, desc, style);
  if (!key) return { url: null, model: "pending", creditNote: "POLLINATIONS_API_KEY missing — logo slot reserved" };
  try {
    const r = await fetch("https://gen.pollinations.ai/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "black-forest-labs/flux.1-schnell",
        prompt,
        n: 1,
        size: "512x512",
        response_format: "b64_json",
      }),
    });
    if (!r.ok) return { url: null, model: "flux", creditNote: `upstream ${r.status}` };
    const j = await r.json();
    const b64 = j?.data?.[0]?.b64_json;
    if (!b64) return { url: null, model: "flux", creditNote: "no b64 in response" };
    return { url: `data:image/png;base64,${b64}`, model: "flux.1-schnell", creditNote: "$0.002 pollen" };
  } catch (e) {
    return { url: null, model: "flux", creditNote: `error ${String(e).slice(0, 60)}` };
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const coin = forge({
    prompt: body.prompt,
    xPost: body.xPost,
    hashtag: body.hashtag,
    imageUrl: body.imageUrl,
    tiktok: body.tiktok,
    trend: body.trend,
    style: body.style,
  });
  const wantImage = body.image !== false;
  const img = wantImage
    ? await fluxLogo(coin.name, coin.ticker, coin.description, coin.logoStyle)
    : { url: null, model: "skipped", creditNote: "image=false" };
  return Response.json({ ok: true, coin: { ...coin, logoUrl: img.url, logoModel: img.model, logoNote: img.creditNote } });
}
