import type { Metadata } from "next";

const GRADUATION_MCAP = 69000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36";
const SITE = "https://catclawpad.vercel.app";

/**
 * Real share previews: a crawler hitting /coin/<mint> gets live name, ticker,
 * market cap and a generated share card with real stats.
 */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const mint = params?.id ?? "";
  let name = "Token";
  let ticker = "";
  let desc = "Live token on catclawpad — real bonding-curve data and DEX previews.";
  let image = `${SITE}/api/og/${mint}`;

  try {
    const r = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (r.ok) {
      const c = await r.json();
      name = c.name ?? name;
      ticker = c.symbol ? `$${c.symbol}` : "";
      const mcap = Number(c.usd_market_cap ?? c.market_cap ?? 0);
      const curve = c.complete ? 100 : Math.min(99.9, Math.round((mcap / GRADUATION_MCAP) * 1000) / 10);
      desc = `${c.description ? String(c.description).slice(0, 120) : "Live token"} · mcap $${mcap.toLocaleString(undefined, { maximumFractionDigits: 0 })} · curve ${curve}%`;
      if (c.image_uri) image = c.image_uri;
    }
  } catch { /* fall back to generated card */ }

  const title = ticker ? `${name} ${ticker} · CatClawPad` : `${name} · CatClawPad`;
  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      url: `${SITE}/coin/${mint}`,
      siteName: "CatClawPad",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [image],
    },
  };
}

export default function CoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
