import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Live tokenomics for our real token — every number is fetched from a primary
 * source and nothing is hardcoded:
 *   pump.fun  -> market cap, curve status, creator, creation time
 *   clawpump  -> creator fees earned/claimed, buybacks, agent PNL, allocation
 *   solscan   -> the fee tx links the page publishes (real proof of payout)
 */
const MINT = process.env.CLAWPAD_TOKEN_MINT || "7pkqvfHe6WREhvZ1ergfXtz3F6MQfXCfcAZiumCt6Ene";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36";
const GRADUATION_MCAP = 69000;

export async function GET(_req: NextRequest) {
  const out: any = { ok: true, mint: MINT, fetchedAt: new Date().toISOString(), sources: [] };

  // 1) pump.fun — the token itself
  try {
    const r = await fetch(`https://frontend-api-v3.pump.fun/coins-v2/${MINT}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(12000), cache: "no-store",
    });
    if (r.ok) {
      const c = await r.json();
      const mcap = Number(c.usd_market_cap ?? c.market_cap ?? 0);
      const done = Boolean(c.complete) || mcap >= GRADUATION_MCAP;
      out.token = {
        name: c.name, symbol: c.symbol, image: c.image_uri ?? null, description: c.description ?? null,
        creator: c.creator ?? null, createdAt: c.created_timestamp ?? null,
        twitter: c.twitter ?? null, website: c.website ?? null,
        marketCapUsd: mcap,
        complete: done,
        bondingProgressPct: done ? 100 : Math.min(99.9, Math.round((mcap / GRADUATION_MCAP) * 1000) / 10),
        virtualSolReserves: c.virtual_sol_reserves != null ? c.virtual_sol_reserves / 1e9 : null,
        totalSupply: c.total_supply != null ? Number(c.total_supply) / 1e9 : null,
      };
      out.sources.push("pump.fun");
    }
  } catch { /* keep going */ }

  out.links = {
    pumpfun: `https://pump.fun/coin/${MINT}`,
    clawpump: `https://clawpump.tech/tokens/${MINT}`,
    dexscreener: `https://dexscreener.com/solana/${MINT}`,
    solscan: `https://solscan.io/token/${MINT}`,
    ourPreview: `/coin/${MINT}`,
  };

  // 2) clawpump — fees / buybacks / agent PNL / allocation, parsed live
  try {
    const r = await fetch(`https://clawpump.tech/tokens/${MINT}`, {
      headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000), cache: "no-store",
    });
    if (r.ok) {
      const html = await r.text();
      // clawpump ships its server payload as Next flight data; the token object
      // and the numeric *Sol/*Pct fields inside it are the authoritative values.
      const unescaped = html.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      const flat = html.replace(/\\"/g, '"').replace(/<[^>]+>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\s+/g, " ");

      const grab = (key: string) => {
        const m = unescaped.match(new RegExp('"' + key + '"\\s*:\\s*("?)([^,}\\]]{1,60})'));
        if (!m) return null;
        const v = m[2].replace(/"/g, "");
        return v === "null" ? null : v;
      };
      const numOrNull = (key: string) => {
        const v = grab(key);
        const n = v == null ? NaN : Number(v);
        return Number.isFinite(n) ? n : null;
      };
      out.clawpump = {
        name: grab("tokenName"),
        symbol: grab("tokenSymbol"),
        marketCapUsd: numOrNull("marketCap"),
        totalEarnedSol: numOrNull("totalEarnedSol"),
        priceUsd: numOrNull("priceUsd"),
        platform: grab("platformLabel"),
        platformUrl: grab("platformUrl"),
        xUsername: grab("agentXUsername"),
        launchPlatform: grab("launchPlatform"),
      };

      // numeric fields anywhere in the payload (fee %, fee share, etc.)
      const nums: Record<string, number | null> = {};
      const numRe = /"([A-Za-z][A-Za-z0-9_]{2,40}(?:Sol|Pct|Percent|Usd))"\s*:\s*(-?[0-9.]+)/g;
      let nm: RegExpExecArray | null;
      while ((nm = numRe.exec(unescaped))) nums[nm[1]] = Number(nm[2]);

      out.fees = {
        // published, exact values only — anything not published stays null
        earnedSol: out.clawpump?.totalEarnedSol ?? nums.totalEarnedSol ?? null,
        tradeFeePercent: nums.feePercent ?? null,
        creatorAllocationPct: nums.creatorPct ?? nums.creatorAllocationPct ?? null,
        buybackPct: nums.buybackPct ?? null,
        operationsPct: nums.operationsPct ?? null,
        buybacksSol: nums.totalBuybackSol ?? null,
        sentSol: nums.totalSentSol ?? null,
        claimableSol: nums.claimableSol ?? nums.unclaimedSol ?? null,
        agentPnlSol: nums.agentPnlSol ?? nums.pnlSol ?? null,
        raw: nums,
      };

      out.launchDate = flat.match(/Created\s*([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s*·\s*\d{2}:\d{2})/)?.[1] ?? null;
      out.agent = unescaped.match(/"tokenName":"([^"]+)"/)?.[1] ?? null;

      const txs: { sig: string; sol: number | null; label: string | null }[] = [];
      const re = /https:\/\/solscan\.io\/tx\/([1-9A-HJ-NP-Za-km-z]{40,90})/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && txs.length < 12) {
        const around = html.slice(Math.max(0, m.index - 300), m.index).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        const sol = around.match(/([0-9]+\.[0-9]+)\s*SOL/i);
        txs.push({ sig: m[1], sol: sol ? Number(sol[1]) : null, label: /sent/i.test(around) ? "sent" : /claim/i.test(around) ? "claimed" : null });
      }
      out.feeEvents = txs;
      out.sources.push("clawpump.tech");
    }
  } catch { /* keep going */ }

  // 3) our own devnet market, if this mint ever trades here
  try {
    const r = await fetch(`https://catclawpad.vercel.app/api/dex?mint=${MINT}`, { cache: "no-store", signal: AbortSignal.timeout(9000) });
    if (r.ok) {
      const j = await r.json();
      if (j?.ok) {
        out.ourMarket = { price: j.priceSolPerToken, curve: j.curveProgressPct, buys: j.buys, sells: j.sells, trades: j.trades?.length ?? 0 };
        out.sources.push("our devnet market");
      }
    }
  } catch { /* ignore */ }

  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
