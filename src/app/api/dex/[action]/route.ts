import { NextRequest } from "next/server";
import { createBuyOrder, createSellOrder, settleOrder, TOKEN_UNIT, pendingOrders } from "@/lib/dex";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/**
 * POST /api/dex/buy    { mint, solAmount, userPublicKey }   -> order + a tx the WALLET alone signs
 * POST /api/dex/sell   { mint, tokenAmount, userPublicKey } -> order + a tx the WALLET alone signs
 * POST /api/dex/settle { orderId, signature }               -> treasury releases the other side
 * GET  /api/dex/orders                                      -> orders still awaiting settlement
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
      const built = await createBuyOrder(String(mint), lamports, String(userPublicKey));
      return Response.json({ ok: true, mint, ...built }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "sell") {
      const { mint, tokenAmount, userPublicKey } = body;
      if (!mint || !userPublicKey) return Response.json({ ok: false, error: "mint and userPublicKey required" }, { status: 400 });
      const amount = BigInt(Math.round(Number(tokenAmount) * Number(TOKEN_UNIT)));
      const built = await createSellOrder(String(mint), amount, String(userPublicKey));
      return Response.json({ ok: true, mint, ...built }, { headers: { "Cache-Control": "no-store" } });
    }

    // settle | confirm — "confirm" kept so any older client still works
    if (action === "settle" || action === "confirm") {
      const { orderId, signature, userWallet, mint, side } = body;
      let id = Number(orderId);
      if (!Number.isFinite(id) || id <= 0) {
        const open = (await pendingOrders(25)) as any[];
        const match = open.find((o) => o.user_wallet === userWallet && (!mint || o.mint === mint) && (!side || o.side === (side === "sell" ? "sell" : "buy")));
        if (!match) return Response.json({ ok: false, error: "no matching order — start the trade again" }, { status: 400 });
        id = Number(match.id);
      }
      const res = await settleOrder(id, signature ? String(signature) : undefined);
      return Response.json(res, { headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({ ok: false, error: `unknown action ${action}` }, { status: 404 });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
  }
}

export async function GET(_req: NextRequest, ctx: { params: { action: string } }) {
  if (ctx?.params?.action !== "orders") return Response.json({ ok: false, error: "unknown" }, { status: 404 });
  try {
    const orders = await pendingOrders(25);
    return Response.json({ ok: true, pending: orders.length, orders }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
