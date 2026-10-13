import { NextRequest } from "next/server";
import {
  getPool, priceSolPerToken, curveProgressPct, marketCapSol,
  recentTrades, priceSeries, VIRTUAL_TOKENS_INIT, TOKEN_UNIT, GRADUATION_SOL,
} from "@/lib/dex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Live state of one of our devnet markets: curve, price, real trade history. */
export async function GET(req: NextRequest) {
  const mint = req.nextUrl.searchParams.get("mint") || "";
  if (!mint) return Response.json({ ok: false, error: "mint required" }, { status: 400 });
  try {
    const pool = await getPool(mint);
    if (!pool) return Response.json({ ok: false, error: "pool unavailable" }, { status: 503 });
    const [trades, series] = await Promise.all([recentTrades(mint, 30), priceSeries(mint, 60)]);
    return Response.json(
      {
        ok: true,
        mint,
        source: "devnet bonding curve (on-chain settled)",
        priceSolPerToken: priceSolPerToken(pool),
        priceUsd: null,
        marketCapSol: marketCapSol(pool),
        supplyTokens: Number(VIRTUAL_TOKENS_INIT) / Number(TOKEN_UNIT),
        curveProgressPct: curveProgressPct(pool),
        graduationSol: Number(GRADUATION_SOL) / 1e9,
        solCollected: Number(pool.solCollected) / 1e9,
        reserves: { virtualSol: Number(pool.virtualSol) / 1e9, virtualTokens: Number(pool.virtualTokens) / Number(TOKEN_UNIT) },
        buys: pool.buys,
        sells: pool.sells,
        trades: trades.map((t: any) => ({
          side: t.side, user: t.user_wallet, sol: Number(t.sol_amount),
          tokens: Number(t.token_amount), price: Number(t.price), signature: t.signature, at: t.created_at,
        })),
        series,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
