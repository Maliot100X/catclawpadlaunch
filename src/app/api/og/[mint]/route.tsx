import { ImageResponse } from "next/og";
import { listCoins } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const GRADUATION_MCAP = 69000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36";

function usd(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/** Real share card: live name, ticker, price, mcap and bonding-curve progress for any mint. */
export async function GET(_req: Request, ctx: { params: { mint: string } }) {
  const mint = ctx?.params?.mint ?? "";

  let name = "Unknown token";
  let ticker = "";
  let desc = "";
  let image: string | null = null;
  let mcap = 0;
  let curve: number | null = null;
  let price: number | null = null;
  let cluster = process.env.NEXT_PUBLIC_CLUSTER || "devnet";

  // ours first
  try {
    const rows = await listCoins(300);
    const c: any = rows.find((x: any) => x.mint === mint);
    if (c) {
      name = c.name; ticker = c.ticker; desc = c.description ?? ""; image = c.logo_url ?? null;
    }
  } catch { /* ignore */ }

  // real market data
  try {
    const r = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(9000), cache: "no-store",
    });
    if (r.ok) {
      const c = await r.json();
      name = c.name ?? name;
      ticker = c.symbol ? `$${c.symbol}` : ticker;
      desc = c.description ?? desc;
      image = image ?? c.image_uri ?? null;
      mcap = Number(c.usd_market_cap ?? c.market_cap ?? 0);
      curve = c.complete ? 100 : Math.min(99.9, Math.round((mcap / GRADUATION_MCAP) * 1000) / 10);
    }
  } catch { /* ignore */ }

  try {
    const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`, {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    if (r.ok) {
      const pairs = await r.json();
      const best = Array.isArray(pairs) ? pairs.sort((a: any, b: any) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0))[0] : null;
      if (best) {
        price = Number(best.priceUsd ?? 0);
        mcap = mcap || Number(best.marketCap ?? best.fdv ?? 0);
        if (curve == null) curve = 100;
      }
    }
  } catch { /* ignore */ }

  const bar = curve == null ? 0 : Math.min(100, curve);
  const grad = (curve ?? 0) >= 99.9;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px", height: "630px", display: "flex", flexDirection: "column",
          background: "#06070f", color: "#e9ecff", padding: "48px", fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 26, letterSpacing: 4, color: "#c8ff3d" }}>CLAWPAD.wtf</div>
          <div style={{ display: "flex", fontSize: 22, color: "#8d93bd" }}>{`${cluster} · pump.fun data`}</div>
        </div>

        <div style={{ display: "flex", gap: 40, marginTop: 40, alignItems: "flex-start" }}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" width={240} height={240} style={{ border: "2px solid #232851", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 240, height: 240, border: "2px solid #232851", display: "flex", alignItems: "center", justifyContent: "center", color: "#8d93bd", fontSize: 22 }}>
              no logo
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.05 }}>{name}</div>
            <div style={{ display: "flex", fontSize: 40, color: "#c8ff3d", marginTop: 8 }}>{ticker}</div>
            <div style={{ display: "flex", fontSize: 24, color: "#8d93bd", marginTop: 18, maxWidth: 780 }}>
              {(desc || "Live token on catclawpad").slice(0, 140)}
            </div>

            <div style={{ display: "flex", gap: 56, marginTop: 30, fontSize: 30 }}>
              <div style={{ display: "flex", gap: 8 }}><span>mcap</span><span style={{ color: "#c8ff3d" }}>{usd(mcap)}</span></div>
              <div style={{ display: "flex", gap: 8 }}><span>price</span><span style={{ color: "#3cf2ff" }}>{price ? `$${price}` : "—"}</span></div>
              <div style={{ display: "flex", gap: 8 }}><span>curve</span><span style={{ color: grad ? "#c8ff3d" : "#3cf2ff" }}>{curve == null ? "—" : `${curve}%`}</span></div>
            </div>

            <div style={{ display: "flex", marginTop: 26, width: 620, height: 22, background: "#0b0d18", border: "2px solid #232851" }}>
              <div style={{ width: `${bar}%`, height: "100%", background: grad ? "#c8ff3d" : "#3cf2ff" }} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", fontSize: 22, color: "#8d93bd" }}>
          <div style={{ display: "flex" }}>anything viral becomes a coin</div>
          <div style={{ display: "flex" }}>{grad ? "GRADUATED" : "on the curve"}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
