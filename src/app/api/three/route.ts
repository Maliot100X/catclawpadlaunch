import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Real market intelligence from three.ws — free, keyless HTTP GETs.
 * We proxy so the browser stays same-origin and we can cache briefly.
 *   ?kind=token|security|holders|bonding|trending|whales|launches|symbol
 *   &address=<mint>  (token/security/holders/wallet)
 *   &mint=<mint>     (bonding)
 */
const BASE = "https://three.ws/api/crypto";

const ALLOWED: Record<string, (p: URLSearchParams) => string> = {
  token: (p) => `${BASE}/token?address=${encodeURIComponent(p.get("address") || "")}`,
  security: (p) => `${BASE}/security?address=${encodeURIComponent(p.get("address") || "")}`,
  holders: (p) => `${BASE}/holders?address=${encodeURIComponent(p.get("address") || "")}&limit=10`,
  bonding: (p) => `${BASE}/bonding?mint=${encodeURIComponent(p.get("mint") || p.get("address") || "")}`,
  trending: (p) => `${BASE}/trending?window=${encodeURIComponent(p.get("window") || "1h")}&limit=${encodeURIComponent(p.get("limit") || "12")}`,
  whales: (p) => `${BASE}/whales?minSol=${encodeURIComponent(p.get("minSol") || "5")}&limit=10`,
  launches: (p) => `${BASE}/launches?limit=${encodeURIComponent(p.get("limit") || "12")}`,
  symbol: (p) => `${BASE}/symbol?symbols=${encodeURIComponent(p.get("symbols") || "")}`,
};

export async function GET(req: NextRequest) {
  const kind = (req.nextUrl.searchParams.get("kind") || "token").toLowerCase();
  const build = ALLOWED[kind];
  if (!build) return Response.json({ ok: false, error: `unsupported kind ${kind}` }, { status: 400 });

  const url = build(req.nextUrl.searchParams);
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 2000) }; }
    return Response.json(
      { ok: r.ok, kind, source: "three.ws", upstreamStatus: r.status, data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return Response.json({ ok: false, kind, error: String(e?.message ?? e) }, { status: 502 });
  }
}
