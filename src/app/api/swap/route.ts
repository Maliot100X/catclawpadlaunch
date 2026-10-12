import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Build a REAL Jupiter swap transaction for the connected wallet to sign.
// The server never holds user funds and never signs for the user — it returns a
// serialized transaction that Phantom/Solflare signs client-side, then we relay it.
const HOST = process.env.JUPITER_API_KEY ? "https://api.jup.ag" : "https://lite-api.jup.ag";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const quote = body.quote;
  const userPublicKey = String(body.userPublicKey || "");
  if (!quote || !userPublicKey) {
    return Response.json({ ok: false, error: "quote and userPublicKey required" }, { status: 400 });
  }
  try {
    const r = await fetch(`${HOST}/swap/v1/swap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {}),
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json();
    if (!r.ok) return Response.json({ ok: false, error: j }, { status: r.status });
    return Response.json({
      ok: true,
      swapTransaction: j.swapTransaction, // base64, unsigned — wallet signs
      lastValidBlockHeight: j.lastValidBlockHeight,
      prioritizationFeeLamports: j.prioritizationFeeLamports,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e).slice(0, 160) }, { status: 502 });
  }
}
