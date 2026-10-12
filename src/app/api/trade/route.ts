import { NextRequest } from "next/server";
import { buildSwapTransaction, formatOut, getQuote, SOL_MINT, USDC_MINT } from "@/lib/jupiter";
import { CLUSTER } from "@/lib/cluster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const inputMint = sp.get("inputMint") || SOL_MINT;
  const outputMint = sp.get("outputMint") || USDC_MINT;
  const amount = sp.get("amount") || "10000000"; // 0.01 SOL
  const slippageBps = Number(sp.get("slippageBps") || 50);

  try {
    const q = await getQuote({ inputMint, outputMint, amount, slippageBps });
    return Response.json({
      ok: true,
      cluster_note: "Jupiter quotes are mainnet liquidity; app cluster is " + CLUSTER,
      inputMint: q.inputMint,
      outputMint: q.outputMint,
      inAmount: q.inAmount,
      outAmount: q.outAmount,
      outUi: formatOut(q.outAmount, outputMint === USDC_MINT ? 6 : 9),
      priceImpactPct: q.priceImpactPct,
      quote: q.raw,
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "swap");

  if (action === "quote") {
    try {
      const q = await getQuote({
        inputMint: body.inputMint || SOL_MINT,
        outputMint: body.outputMint || USDC_MINT,
        amount: body.amount || "10000000",
        slippageBps: body.slippageBps || 50,
      });
      return Response.json({ ok: true, quote: q.raw, outAmount: q.outAmount, outUi: formatOut(q.outAmount) });
    } catch (e) {
      return Response.json({ ok: false, error: String(e) }, { status: 502 });
    }
  }

  if (action === "swap") {
    const userPublicKey = String(body.userPublicKey || "");
    const quoteResponse = body.quoteResponse || body.quote;
    if (!userPublicKey || !quoteResponse) {
      return Response.json({ error: "userPublicKey + quoteResponse required" }, { status: 400 });
    }
    try {
      const { swapTransaction } = await buildSwapTransaction({ quoteResponse, userPublicKey });
      return Response.json({
        ok: true,
        swapTransaction,
        note: "Sign swapTransaction with wallet then sendTransaction. Mainnet mints.",
      });
    } catch (e) {
      return Response.json({ ok: false, error: String(e) }, { status: 502 });
    }
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
