import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Real Jupiter quotes. Public lite-api needs no key; JUPITER_API_KEY switches to the paid host.
const HOST = process.env.JUPITER_API_KEY ? "https://api.jup.ag" : "https://lite-api.jup.ag";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const inputMint = p.get("inputMint") || "So11111111111111111111111111111111111111112";
  const outputMint = p.get("outputMint") || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const amount = p.get("amount") || "100000000";
  const slippageBps = p.get("slippageBps") || "50";

  const url = `${HOST}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`;
  try {
    const r = await fetch(url, {
      headers: process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {},
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    const j = await r.json();
    if (!r.ok) return Response.json({ ok: false, error: j }, { status: r.status });
    const outAmount = Number(j.outAmount || 0);
    const inAmount = Number(j.inAmount || 0);
    return Response.json({
      ok: true,
      host: HOST.includes("lite") ? "lite-api" : "api",
      inputMint, outputMint, inAmount, outAmount,
      priceImpactPct: j.priceImpactPct,
      routeLabels: (j.routePlan ?? []).flatMap((r2: any) => r2?.swapInfo?.label ? [r2.swapInfo.label] : []),
      swapMode: j.swapMode,
      quote: j,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e).slice(0, 160) }, { status: 502 });
  }
}
