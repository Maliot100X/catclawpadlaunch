import { NextRequest } from "next/server";
import { cacheGet, cacheSet } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// REAL pump.fun market data (public endpoints) + DexScreener enrichment.
// No mocks: every number here comes from a live API. Redis caches for 45s to respect rate limits.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const PUMP = "https://frontend-api-v3.pump.fun";
// pump.fun bonding curve completes around this market cap (well-known protocol constant)
const GRADUATION_MCAP = 69000;

type PumpCoin = {
  mint: string;
  name: string;
  symbol: string;
  image_uri?: string;
  created_timestamp?: number;
  market_cap?: number;
  usd_market_cap?: number;
  complete?: boolean;
  raydium_pool?: string | null;
  virtual_sol_reserves?: number;
  total_supply?: number;
  creator?: string;
};

async function pump(path: string, tries = 3): Promise<any | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${PUMP}${path}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      });
      if (r.status === 429) { await new Promise((res) => setTimeout(res, 1200 * (i + 1))); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await new Promise((res) => setTimeout(res, 800 * (i + 1))); }
  }
  return null;
}

function normalize(c: PumpCoin) {
  const mcap = Number(c.usd_market_cap ?? c.market_cap ?? 0);
  const progress = c.complete ? 100 : Math.min(99.9, Math.round((mcap / GRADUATION_MCAP) * 1000) / 10);
  return {
    mint: c.mint,
    name: c.name,
    symbol: c.symbol,
    image: c.image_uri ?? null,
    createdAt: c.created_timestamp ?? null,
    marketCapUsd: mcap,
    complete: Boolean(c.complete),
    bondingProgressPct: progress,
    virtualSolReserves: c.virtual_sol_reserves ? c.virtual_sol_reserves / 1e9 : null,
    creator: c.creator ?? null,
    links: {
      pump: `https://pump.fun/coin/${c.mint}`,
      dexscreener: `https://dexscreener.com/solana/${c.mint}`,
      solscan: `https://solscan.io/token/${c.mint}`,
    },
  };
}

export async function GET(req: NextRequest) {
  const bucket = req.nextUrl.searchParams.get("bucket") || "new";
  const cacheKey = `clawpad:pump:${bucket}:v1`;
  const cached = await cacheGet<any>(cacheKey);
  if (cached) return Response.json({ ...cached, cached: true });

  let raw: PumpCoin[] = [];
  if (bucket === "graduating") {
    // completed bonding curves, freshest first
    const d = await pump(`/coins?limit=24&sort=created_timestamp&order=DESC&complete=true`);
    raw = Array.isArray(d) ? d : [];
  } else if (bucket === "graduate") {
    // highest market cap still on the curve = closest to graduating
    const d = await pump(`/coins?limit=40&sort=market_cap&order=DESC&complete=false`);
    raw = (Array.isArray(d) ? d : []).filter((c) => !c.complete).sort((a, b) =>
      Number(b.usd_market_cap ?? b.market_cap ?? 0) - Number(a.usd_market_cap ?? a.market_cap ?? 0)
    ).slice(0, 24);
  } else {
    const d = await pump(`/coins?limit=24&sort=created_timestamp&order=DESC`);
    raw = Array.isArray(d) ? d : [];
  }

  const coins = raw.filter((c) => c?.mint).map(normalize);

  // Enrich the top rows with real DEX liquidity/price where a pool exists (DexScreener, no key).
  const enriched = await Promise.all(
    coins.map(async (c) => {
      if (!c.complete && c.bondingProgressPct < 90) return c;
      try {
        const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${c.mint}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
          cache: "no-store",
        });
        if (!r.ok) return c;
        const pairs = await r.json();
        const best = Array.isArray(pairs) ? pairs.sort((a: any, b: any) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0))[0] : null;
        if (!best) return c;
        return {
          ...c,
          dex: {
            dexId: best.dexId,
            priceUsd: Number(best.priceUsd ?? 0),
            liquidityUsd: Number(best?.liquidity?.usd ?? 0),
            volume24h: Number(best?.volume?.h24 ?? 0),
            fdv: Number(best.fdv ?? 0),
            pairAddress: best.pairAddress,
          },
        };
      } catch { return c; }
    })
  );

  const payload = {
    ok: true,
    bucket,
    source: "pump.fun frontend-api-v3 (+ dexscreener for graduated)",
    graduationMcapUsd: GRADUATION_MCAP,
    count: enriched.length,
    coins: enriched,
    scannedAt: new Date().toISOString(),
  };
  await cacheSet(cacheKey, payload, 45);
  return Response.json(payload);
}
