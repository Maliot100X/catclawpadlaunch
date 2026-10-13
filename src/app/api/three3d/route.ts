import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

/**
 * three.ws 3D toolchain — real, keyless, no account.
 *   GET  ?kind=catalog
 *   GET  ?kind=inspect&url=<glb url>
 *   GET  ?kind=poll&job=<id>
 *   POST ?kind=generate  { prompt }
 *   POST ?kind=prepare   { url, format? }     -> watertight printable export (STL/3MF/GLB)
 *   POST ?kind=quote     { url, material? }   -> printability report + print quote
 *   POST ?kind=diff      { a, b }             -> model diff with severity
 * Paid Forge Pro tiers settle in USDC over x402 and are NOT called here — free tier only.
 */
const API = "https://three.ws/api";

export async function GET(req: NextRequest) {
  const kind = (req.nextUrl.searchParams.get("kind") || "catalog").toLowerCase();
  const p = req.nextUrl.searchParams;
  let url = "";
  if (kind === "catalog") url = `${API}/3d`;
  else if (kind === "inspect") url = `${API}/3d/inspect?url=${encodeURIComponent(p.get("url") || "")}`;
  else if (kind === "poll") url = `${API}/3d/generate?job=${encodeURIComponent(p.get("job") || "")}`;
  else return Response.json({ ok: false, error: `unsupported GET kind ${kind}` }, { status: 400 });

  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(60000), cache: "no-store" });
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 3000) }; }
    return Response.json({ ok: r.ok, kind, source: "three.ws", upstreamStatus: r.status, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return Response.json({ ok: false, kind, error: String(e?.message ?? e) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const kind = (req.nextUrl.searchParams.get("kind") || "").toLowerCase();
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const map: Record<string, { path: string; payload: (b: any) => any }> = {
    generate: { path: "/3d/generate", payload: (b) => ({ prompt: String(b.prompt || "") }) },
    prepare: { path: "/print/prepare", payload: (b) => ({ glbUrl: String(b.url || b.glbUrl || ""), ...(b.format ? { format: String(b.format) } : {}) }) },
    quote: { path: "/print/quote", payload: (b) => ({ glbUrl: String(b.url || b.glbUrl || ""), ...(b.material ? { material: String(b.material) } : {}) }) },
    diff: { path: "/3d/diff", payload: (b) => ({ a: String(b.a || ""), b: String(b.b || "") }) },
  };
  const target = map[kind];
  if (!target) return Response.json({ ok: false, error: `unsupported POST kind ${kind}` }, { status: 400 });

  const payload = target.payload(body);
  const missing = Object.entries(payload).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return Response.json({ ok: false, error: `missing: ${missing.join(", ")}` }, { status: 400 });

  try {
    const r = await fetch(`${API}${target.path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(110000),
      cache: "no-store",
    });
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 3000) }; }
    return Response.json({ ok: r.ok, kind, source: "three.ws", upstreamStatus: r.status, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return Response.json({ ok: false, kind, error: String(e?.message ?? e) }, { status: 502 });
  }
}
