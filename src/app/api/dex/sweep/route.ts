import { pendingOrders, settleOrder } from "@/lib/dex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/**
 * Settlement sweeper. Any order whose wallet-side payment landed but whose
 * settlement was interrupted gets completed here, so a paid order can never be
 * left unfilled. Meant to be hit periodically (the worker does it every loop).
 */
export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 10);
  try {
    const orders = (await pendingOrders(Number.isFinite(limit) ? limit : 10)) as any[];
    const withPay = orders.filter((o) => o.pay_signature);
    const results: any[] = [];
    for (const o of withPay) {
      try {
        const r = await settleOrder(Number(o.id));
        results.push({ orderId: o.id, side: o.side, ok: Boolean((r as any).ok), reason: (r as any).reason ?? null });
      } catch (e: any) {
        results.push({ orderId: o.id, ok: false, error: String(e?.message ?? e).slice(0, 160) });
      }
    }
    return Response.json(
      { ok: true, pending: orders.length, attempting: withPay.length, results },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
