import { forge } from "@/lib/forge";
import { logoPrompt } from "@/lib/logo";
import { brainstorm } from "@/lib/brain";
import { groqText } from "@/lib/integrations";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

// Real image gen: Pollinations FLUX.1-schnell, key from env only.
async function fluxLogo(name: string, ticker: string, desc: string, style: string): Promise<{ url: string | null; hostedUrl?: string | null; model: string; creditNote: string }> {
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

    // Host the image so the data URL isn't the only copy: upload to pollinations media,
    // which returns a stable public URL used in token metadata.
    let hosted: string | null = j?.data?.[0]?.url ?? null;
    try {
      const up = await fetch("https://media.pollinations.ai/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ data: b64, contentType: "image/png", name: `${name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.png` }),
        signal: AbortSignal.timeout(20000),
      });
      if (up.ok) {
        const uj = await up.json();
        hosted = uj?.url ?? hosted;
      }
    } catch { /* hosting optional — data URL still returned */ }

    return { url: `data:image/png;base64,${b64}`, hostedUrl: hosted, model: "flux.1-schnell", creditNote: "$0.002 pollen" };
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

  // Real brain first: River DeepSeek. Local deterministic fallback keeps the forge never-blank.
  const raw = body.prompt || body.xPost || body.hashtag || body.tiktok || body.trend || coin.name;
  let brain = await brainstorm(raw, coin.source, process.env.FORGE_BRAIN_BASE, process.env.RIVER_API_KEY, process.env.FORGE_BRAIN_MODEL);
  if (!brain) {
    // Tier 2: Groq, when configured. Same JSON contract as the River tier.
    const sys = `You are the branding engine of a Solana meme-coin launchpad. Reply ONLY with compact JSON: {"name":"<max 3 words>","ticker":"<2-6 uppercase>","description":"<2 sentences of meme lore ending with 'Launched thru catclawpad.'>","tags":["<src>","<2-3 words>"]}`;
    const txt = await groqText(sys, `Idea (${coin.source}): ${raw}`);
    const m = txt?.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const p = JSON.parse(m[0]);
        if (p?.name && p?.ticker && p?.description) {
          brain = {
            name: String(p.name).slice(0, 40),
            ticker: "$" + String(p.ticker).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6),
            description: String(p.description).slice(0, 280),
            tags: Array.isArray(p.tags) ? p.tags.slice(0, 5).map(String) : [coin.source, "meme"],
            brain: "groq",
          } as any;
        }
      } catch { /* fall through to local */ }
    }
  }
  const finalCoin = brain ? { ...coin, ...brain, logoStyle: coin.logoStyle } : coin;
  const wantImage = body.image !== false;
  const img = wantImage
    ? await fluxLogo(finalCoin.name, finalCoin.ticker, finalCoin.description, finalCoin.logoStyle)
    : { url: null, model: "skipped", creditNote: "image=false" };
  return Response.json({ ok: true, coin: { ...finalCoin, logoUrl: img.url, logoHostedUrl: (img as any).hostedUrl ?? null, logoModel: img.model, logoNote: img.creditNote } });
}
