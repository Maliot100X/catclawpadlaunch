import { NextRequest } from "next/server";
import { cacheGet, cacheSet } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

/**
 * Real-time PumpDev feed.
 * Opens a short-lived WebSocket to the PumpDev endpoint, subscribes, collects events,
 * then returns them. The WS URL stays server-side (never shipped to the browser).
 *
 *   ?topic=new              → subscribeNewToken (global new-token stream)
 *   ?topic=trades&mint=...  → subscribeTokenTrade for one mint
 */

type Ev = { type?: string; [k: string]: any };

async function collect(url: string, subscribe: Record<string, unknown>, want: number, ms: number): Promise<Ev[]> {
  const WebSocket = (await import("ws")).default;
  return new Promise<Ev[]>((resolve) => {
    const events: Ev[] = [];
    let ws: any;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try { ws?.close(); } catch { /* ignore */ }
      resolve(events.filter((e) => !["connected", "connectionStatus", "subscribed", "unsubscribed"].includes(String(e.type))));
    };
    const timer = setTimeout(finish, ms);
    try {
      ws = new WebSocket(url, { handshakeTimeout: 10000 });
    } catch {
      clearTimeout(timer);
      return resolve([]);
    }
    ws.on("open", () => {
      try { ws.send(JSON.stringify(subscribe)); } catch { /* ignore */ }
    });
    ws.on("message", (d: any) => {
      try {
        const j = JSON.parse(d.toString());
        events.push(j);
        if (events.filter((e) => e.type && !["connected", "connectionStatus", "subscribed"].includes(e.type)).length >= want) {
          clearTimeout(timer); finish();
        }
      } catch { /* ignore non-JSON */ }
    });
    ws.on("error", () => { clearTimeout(timer); finish(); });
    ws.on("close", () => { clearTimeout(timer); finish(); });
  });
}

export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get("topic") || "new";
  const mint = req.nextUrl.searchParams.get("mint") || "";
  const cacheKey = `clawpad:ws:${topic}:${mint || "all"}:v1`;

  const cached = await cacheGet<any>(cacheKey);
  if (cached) return Response.json({ ...cached, cached: true });

  const wsUrl = process.env.PUMPDEV_WS_URL;
  if (!wsUrl) {
    return Response.json({ ok: false, error: "PUMPDEV_WS_URL not configured" }, { status: 503 });
  }

  let events: Ev[] = [];
  if (topic === "trades" && mint) {
    events = await collect(wsUrl, { method: "subscribeTokenTrade", keys: [mint] }, 12, 9000);
  } else if (topic === "account") {
    events = await collect(wsUrl, { method: "subscribeAccountTrade", keys: [mint] }, 12, 9000);
  } else {
    events = await collect(wsUrl, { method: "subscribeNewToken" }, 12, 9000);
  }

  const normalize = (e: Ev) => {
    const t = String(e.type || "");
    if (t === "newToken" || e.mint) {
      return {
        kind: "newToken",
        mint: e.mint,
        name: e.name,
        symbol: e.symbol,
        uri: e.uri,
        traderPublicKey: e.traderPublicKey,
        initialBuy: e.initialBuy,
        marketCapSol: e.marketCapSol,
        solAmount: e.solAmount,
        at: e.timestamp ?? Date.now(),
      };
    }
    if (t === "trade" || e.txType) {
      return {
        kind: "trade",
        mint: e.mint,
        txType: e.txType,               // buy | sell
        solAmount: e.solAmount,
        tokenAmount: e.tokenAmount,
        marketCapSol: e.marketCapSol,
        trader: e.traderPublicKey,
        at: e.timestamp ?? Date.now(),
      };
    }
    return { kind: t || "event", raw: e };
  };

  const payload = {
    ok: true,
    topic,
    mint: mint || null,
    source: "pumpdev websocket",
    count: events.length,
    events: events.map(normalize),
    fetchedAt: new Date().toISOString(),
  };
  await cacheSet(cacheKey, payload, 8);
  return Response.json(payload);
}
