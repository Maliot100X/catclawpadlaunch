import { NextRequest } from "next/server";
import { CLUSTER } from "@/lib/cluster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trend radar — merges live quotes signal + curated/heat topics. Expand with Firecrawl schedule later. */
export async function GET() {
  let jupHeat = 70;
  try {
    const r = await fetch(
      "https://lite-api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000&slippageBps=50",
      { next: { revalidate: 0 } }
    );
    if (r.ok) {
      const q = await r.json();
      const usdc = Number(q.outAmount) / 1e6;
      jupHeat = Math.min(99, Math.max(40, Math.round(usdc * 0.8)));
    }
  } catch {
    /* ignore */
  }

  const trends = [
    { source: "J", title: `SOL/USDC tape · ${jupHeat} heat`, heat: jupHeat, kind: "market" },
    { source: "B", title: "AI agent launchpads heating up", heat: 91, kind: "news" },
    { source: "M", title: "#CatWithClawAi", heat: 86, kind: "social" },
    { source: "R", title: "Devnet memecoin experiments", heat: 79, kind: "social" },
    { source: "G", title: "pump.fun creator fees meta", heat: 84, kind: "news" },
    { source: "B", title: "LLM credits as utility", heat: 88, kind: "news" },
    { source: "M", title: "#SolanaDevnet", heat: 72, kind: "social" },
  ].sort((a, b) => b.heat - a.heat);

  return Response.json({
    status: "LIVE",
    cluster: CLUSTER,
    mode: "hybrid",
    note: "Radar blends live Jupiter heat + editorial trends. Auto-launch optional.",
    scans: 1,
    trends,
    updated: Date.now(),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.action === "scan") {
    // force refresh same as GET
    return GET();
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
