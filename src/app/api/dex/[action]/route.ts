import { NextRequest } from "next/server";
import { buildBuyTx, buildSellTx, confirmTrade, TOKEN_UNIT } from "@/lib/dex";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/dex/buy     { mint, solAmount, userPublicKey }  -> partially-signed tx
 * POST /api/dex/sell    { mint, tokenAmount, userPublicKey } -> partially-signed tx
 * POST /api/dex/confirm { mint, side, userWallet, solAmount?, tokenAmount?, signature }
 */
export async function POST(req: NextRequest, ctx: { params: { action: string } }) {
  const action = ctx?.params?.action;
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  try {
    if (action === "buy") {
      const { mint, solAmount, userPublicKey } = body;
      if (!mint || !userPublicKey) return Response.json({ ok: false, error: "mint and userPublicKey required" }, { status: 400 });
      const lamports = BigInt(Math.round(Number(solAmount) * LAMPORTS_PER_SOL));
      const built = await buildBuyTx(String(mint), lamports, String(userPublicKey));
      return Response.json({ ok: true, mint, solLamports: lamports.toString(), ...built }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "sell") {
      const { mint, tokenAmount, userPublicKey } = body;
      if (!mint || !userPublicKey) return Response.json({ ok: false, error: "mint and userPublicKey required" }, { status: 400 });
      const amount = BigInt(Math.round(Number(tokenAmount) * Number(TOKEN_UNIT)));
      const built = await buildSellTx(String(mint), amount, String(userPublicKey));
      return Response.json({ ok: true, mint, tokenAmount: amount.toString(), ...built }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "confirm") {
      const { mint, side, userWallet, solAmount, tokenAmount, signature } = body;
      if (!mint || !side || !userWallet || !signature) {
        return Response.json({ ok: false, error: "mint, side, userWallet, signature required" }, { status: 400 });
      }
      const res = await confirmTrade({
        mint: String(mint),
        side: side === "sell" ? "sell" : "buy",
        userWallet: String(userWallet),
        solLamports: BigInt(Math.round(Number(solAmount ?? 0) * LAMPORTS_PER_SOL)),
        tokenAmount: BigInt(Math.round(Number(tokenAmount ?? 0) * Number(TOKEN_UNIT))),
        signature: String(signature),
      });
      return Response.json(res, { headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({ ok: false, error: `unknown action ${action}` }, { status: 404 });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
  }
}
