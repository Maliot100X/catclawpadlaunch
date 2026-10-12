import { NextRequest } from "next/server";
import { listCoins } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const GRADUATION_MCAP = 69000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36";

/** Real token detail: works for our devnet mints AND real mainnet pump.fun tokens. */
export async function GET(_req: NextRequest, ctx: { params: { mint: string } }) {
  const mint = ctx?.params?.mint ?? "";
  if (!mint || mint.length < 30) return Response.json({ ok: false, error: "mint required" }, { status: 400 });

  // 1) ours (Neon) — devnet mints
  let ours: any = null;
  try {
    const rows = await listCoins(300);
    ours = rows.find((c: any) => c.mint === mint) ?? null;
  } catch { /* ignore */ }

  // 2) on-chain truth via RPC (works for any SPL mint on either cluster)
  const rpc = (process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com").trim();
  let onchain: any = null;
  try {
    const r = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [mint, { encoding: "jsonParsed" }] }),
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    const j = await r.json();
    const info = j?.result?.value?.data?.parsed?.info ?? null;
    if (info) {
      onchain = {
        cluster: process.env.NEXT_PUBLIC_CLUSTER || "devnet",
        decimals: info.decimals,
        supply: info.supply ? Number(info.supply) / Math.pow(10, Number(info.decimals ?? 0)) : null,
        mintAuthority: info.mintAuthority ?? null,
        freezeAuthority: info.freezeAuthority ?? null,
        isInitialized: info.isInitialized,
      };
    }
  } catch { /* ignore */ }

  // 3) real market data — pump.fun (mainnet tokens) then DexScreener (graduated)
  let market: any = null;
  try {
    const r = await fetch(`https://frontend-api-v3.pump.fun/coins-v2/${mint}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (r.ok) {
      const c = await r.json();
      const mcap = Number(c.usd_market_cap ?? c.market_cap ?? 0);
      market = {
        source: "pump.fun",
        name: c.name, symbol: c.symbol, image: c.image_uri ?? null,
        description: c.description ?? null,
        marketCapUsd: mcap,
        complete: Boolean(c.complete),
        bondingProgressPct: c.complete ? 100 : Math.min(99.9, Math.round((mcap / GRADUATION_MCAP) * 1000) / 10),
        virtualSolReserves: c.virtual_sol_reserves ? c.virtual_sol_reserves / 1e9 : null,
        creator: c.creator ?? null,
        createdAt: c.created_timestamp ?? null,
        twitter: c.twitter ?? null, telegram: c.telegram ?? null, website: c.website ?? null,
      };
    }
  } catch { /* ignore */ }

  try {
    const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    if (r.ok) {
      const pairs = await r.json();
      const best = Array.isArray(pairs) ? pairs.sort((a: any, b: any) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0))[0] : null;
      if (best) {
        market = {
          ...(market ?? { source: "dexscreener" }),
          name: market?.name ?? best?.baseToken?.name ?? null,
          symbol: market?.symbol ?? best?.baseToken?.symbol ?? null,
          image: market?.image ?? best?.info?.imageUrl ?? null,
          marketCapUsd: market?.marketCapUsd || Number(best.marketCap ?? best.fdv ?? 0),
          dex: {
            dexId: best.dexId,
            pairAddress: best.pairAddress,
            priceUsd: Number(best.priceUsd ?? 0),
            liquidityUsd: Number(best?.liquidity?.usd ?? 0),
            volume24h: Number(best?.volume?.h24 ?? 0),
            priceChange24h: Number(best?.priceChange?.h24 ?? 0),
            fdv: Number(best.fdv ?? 0),
            marketCap: Number(best.marketCap ?? 0),
          },
        };
      }
    }
  } catch { /* ignore */ }

  return Response.json(
    {
      ok: true,
      mint,
      isOurs: Boolean(ours),
      our: ours
        ? { id: ours.id, name: ours.name, ticker: ours.ticker, description: ours.description, status: ours.status, when: ours.when, logoUrl: ours.logo_url ?? null, explorer: ours.explorer ?? null }
        : null,
      onchain,
      market,
      links: {
        preview: `/coin/${mint}`,
        metadata: `/api/metadata/${mint}`,
        explorerDevnet: `https://explorer.solana.com/address/${mint}?cluster=devnet`,
        explorerMainnet: `https://explorer.solana.com/address/${mint}`,
        pump: `https://pump.fun/coin/${mint}`,
        dexscreener: `https://dexscreener.com/solana/${mint}`,
        solscan: `https://solscan.io/token/${mint}`,
        trade: `/trade?mint=${mint}`,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
