import { NextRequest } from "next/server";
import { cacheGet, cacheSet } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Real trends from four public sources — Google Trends RSS, Bluesky, Mastodon, Reddit.
// No keys required. Each source fails soft so the radar never blanks.

type Trend = { source: string; title: string; heat: number; kind: string; url?: string };

const UA = "Mozilla/5.0 (compatible; CatClawPad/1.0; +https://catclawpad.vercel.app)";

async function googleTrends(): Promise<Trend[]> {
  try {
    const r = await fetch("https://trends.google.com/trending/rss?geo=US", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(9000),
      next: { revalidate: 120 },
    });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 10);
    return items.map((m, i) => {
      const t = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(m[1])?.[1]?.trim() ?? "";
      const traffic = /<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/.exec(m[1])?.[1] ?? "";
      const num = parseInt(String(traffic).replace(/[^0-9]/g, ""), 10);
      const heat = Number.isFinite(num) ? Math.min(99, Math.max(40, Math.round(num / 10_000_000) + 45)) : 88 - i;
      return { source: "G", title: t, heat, kind: "google", url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(t)}` };
    }).filter((x) => x.title);
  } catch { return []; }
}

async function blueskyTrends(): Promise<Trend[]> {
  try {
    const r = await fetch("https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrendingTopics?limit=10", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(9000),
      next: { revalidate: 120 },
    });
    if (!r.ok) return [];
    const j = await r.json();
    const topics = j?.topics ?? [];
    return topics.slice(0, 10).map((t: any, i: number) => ({
      source: "B",
      title: t?.topic ?? t?.displayName ?? "",
      heat: Math.max(55, 95 - i * 4),
      kind: "bluesky",
      url: t?.topic ? `https://bsky.app/search?q=${encodeURIComponent(t.topic)}` : undefined,
    })).filter((x: Trend) => x.title);
  } catch { return []; }
}

async function mastodonTrends(): Promise<Trend[]> {
  try {
    const r = await fetch("https://mastodon.social/api/v1/trends/tags?limit=10", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(9000),
      next: { revalidate: 120 },
    });
    if (!r.ok) return [];
    const arr = await r.json();
    return (Array.isArray(arr) ? arr : []).slice(0, 10).map((t: any, i: number) => ({
      source: "M",
      title: `#${t?.name ?? ""}`,
      heat: Math.max(50, 90 - i * 4),
      kind: "mastodon",
      url: t?.url,
    })).filter((x: Trend) => x.title !== "#");
  } catch { return []; }
}

async function redditTrends(): Promise<Trend[]> {
  // Reddit blocks non-browser agents; try a browser-like UA then old.reddit.
  const urls = [
    "https://www.reddit.com/r/popular/hot.json?limit=12",
    "https://old.reddit.com/r/popular/hot.json?limit=12",
  ];
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
  };
  try {
    let j: any = null;
    for (const u of urls) {
      const r = await fetch(u, { headers, signal: AbortSignal.timeout(9000), next: { revalidate: 180 } });
      if (r.ok) { j = await r.json(); break; }
    }
    if (!j) return [];
    const kids = j?.data?.children ?? [];
    return kids.slice(0, 10).map((c: any) => {
      const d = c?.data ?? {};
      const ups = Number(d.ups ?? 0);
      return {
        source: "R",
        title: String(d.title ?? "").slice(0, 90),
        heat: Math.min(99, Math.max(45, Math.round(ups / 1000) + 45)),
        kind: "reddit",
        url: d.permalink ? `https://www.reddit.com${d.permalink}` : undefined,
      };
    }).filter((x: Trend) => x.title);
  } catch { return []; }
}

const TW = "https://three.ws/api";
async function tw(path: string, ms = 15000): Promise<any | null> {
  try {
    const r = await fetch(`${TW}/${path}`, {
      headers: { accept: "application/json", "user-agent": "catclawpad/1.0" },
      signal: AbortSignal.timeout(ms),
      cache: "no-store",
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/** Real market intelligence from three.ws (keyless): market flow + provider data. */
async function threeWsBlock() {
  const [trending, launches, whales, cgTrending, boosts, fees] = await Promise.all([
    tw("crypto/trending?window=1h&limit=12"),
    tw("crypto/launches?limit=12"),
    tw("crypto/whales?minSol=5&limit=8"),
    tw("v1/x/coingecko/trending"),
    tw("v1/x/dexscreener/boosts"),
    tw("v1/x/solana/priority-fees"),
  ]);
  const tokens = (trending?.tokens ?? []).map((t: any) => ({
    mint: t.mint, symbol: t.symbol, name: t.name,
    mcapUsd: t.marketCapUsd ?? null, volumeUsd: t.volumeUsd ?? null,
    change: t.change ?? null, score: t.score ?? null, url: t.url ?? null,
  }));
  const fresh = (launches?.launches ?? []).map((l: any) => ({
    mint: l.mint, symbol: l.symbol, name: l.name,
    ageMin: l.ageMinutes ?? null, mcapUsd: l.marketCapUsd ?? null,
    progressPct: l.bondingProgressPct ?? null, dev: l.dev ?? null,
    imageUrl: l.imageUrl ?? null, url: l.url ?? null,
  }));
  const whaleRows = (whales?.whales ?? []).map((w: any) => ({
    wallet: w.wallet, sol: w.solMoved ?? null, tx: w.txHash ?? null, ts: w.ts ?? null,
  }));
  const cg = (cgTrending?.data?.coins ?? []).slice(0, 10).map((c: any) => ({
    id: c.id, symbol: c.symbol, name: c.name, rank: c.market_cap_rank ?? null, thumb: c.thumb ?? null,
  }));
  const boosted = (boosts?.data ?? []).slice(0, 10).map((b: any) => ({
    chain: b.chainId, address: b.tokenAddress, symbol: (b.description || "").slice(0, 40), url: b.url ?? null,
  }));
  const pf = fees?.data ?? null;
  return {
    tokens, fresh, whales: whaleRows,
    whaleSignal: whales?.signal ?? null,
    whaleTotalSol: whales?.totalSolMoved ?? null,
    coingeckoTrending: cg,
    boosted, priorityFees: pf,
    sources: {
      trending: tokens.length, launches: fresh.length, whales: whaleRows.length,
      coingeckoTrending: cg.length, boosts: boosted.length, priorityFees: pf ? 1 : 0,
    },
  };
}

export async function GET() {
  const cached = await cacheGet<any>("clawpad:trends:v1");
  if (cached?.trends?.length) return Response.json({ ...cached, cached: true });

  const [g, b, m, r, three] = await Promise.all([googleTrends(), blueskyTrends(), mastodonTrends(), redditTrends(), threeWsBlock()]);
  const all = [...g, ...b, ...m, ...r];
  const sourcesOnline = [g.length, b.length, m.length, r.length].filter((n) => n > 0).length;
  const trends = all.sort((x, y) => y.heat - x.heat).slice(0, 24);
  const bySource = (s: string) => trends.filter((t) => t.source === s).length;

  const payload = {
    status: "LIVE",
    cluster: process.env.NEXT_PUBLIC_CLUSTER || "devnet",
    mode: "live",
    sources: { google: g.length, bluesky: b.length, mastodon: m.length, reddit: r.length, online: sourcesOnline },
    counts: { G: bySource("G"), B: bySource("B"), M: bySource("M"), R: bySource("R") },
    trends,
    three,
    scannedAt: new Date().toISOString(),
    updated: Date.now(),
  };
  await cacheSet("clawpad:trends:v1", payload, 120);
  return Response.json(payload);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.action === "scan") return GET();
  return Response.json({ error: "unknown action" }, { status: 400 });
}
