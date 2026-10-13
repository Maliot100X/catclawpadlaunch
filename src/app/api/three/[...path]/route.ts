import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Our own three.ws surface, served from catclawpad's domain.
 *
 *   /api/three/crypto/<ep>?...   -> https://three.ws/api/crypto/<ep>
 *   /api/three/x/<provider>/<ep> -> https://three.ws/api/v1/x/<provider>/<ep>
 *   /api/three/3d/<ep>?...       -> https://three.ws/api/3d/<ep>
 *   /api/three/mcp  (POST)       -> https://three.ws/api/mcp-studio (JSON-RPC 2.0)
 *   /api/three/awesome?path=...  -> their asset catalog
 *
 * Allow-listed paths only, so this can never be used as an open proxy.
 * Keyless + free upstream; nothing secret is forwarded.
 */
const ALLOW = [
  /^crypto(\/[\w-]+)?(\?.*)?$/,
  /^x(\/[\w-]+){1,3}(\?.*)?$/,
  /^3d(\/[\w-]+)?(\?.*)?$/,
  /^print(\/[\w-]+)?$/,
  /^okx(\/[\w-]+){1,3}$/,
];
const UP = "https://three.ws/api";

export async function GET(req: NextRequest, ctx: { params: { path?: string[] } }) {
  const seg = (ctx?.params?.path ?? []).join("/");
  const qs = req.nextUrl.searchParams.toString();
  const query = qs ? `?${qs}` : "";
  if (!ALLOW.some((r) => r.test(seg + query))) {
    return Response.json({ ok: false, error: "path not allowed", allowed: ALLOW.map(String) }, { status: 403 });
  }
  // their provider catalog lives under /api/v1/x, we expose it as /api/three/x
  const target = (seg.startsWith("x/") ? `v1/${seg}` : seg) + query;
  try {
    const r = await fetch(`${UP}/${target}`, {
      headers: { accept: "application/json", "user-agent": "catclawpad/1.0" },
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: `upstream failed: ${e?.message ?? e}` }, { status: 502 });
  }
}

export async function POST(req: NextRequest, ctx: { params: { path?: string[] } }) {
  const seg = (ctx?.params?.path ?? []).join("/");
  // MCP Studio is the JSON-RPC lane (tools: forge_free, forge_avatar, text_to_avatar,
  // search_catalog, create_agent_persona, persona_say, ...). Forward the call verbatim.
  const isMcp = seg === "mcp";
  const target = isMcp ? "mcp-studio" : seg;
  if (!isMcp && !/^3d\/[\w-]+$/.test(target) && !/^print\/[\w-]+$/.test(target)) {
    return Response.json({ ok: false, error: "post path not allowed" }, { status: 403 });
  }
  let payload: string;
  try { payload = JSON.stringify(await req.json()); } catch { payload = "{}"; }
  try {
    const r = await fetch(`${UP}/${target}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": "catclawpad/1.0" },
      body: payload,
      signal: AbortSignal.timeout(isMcp ? 180000 : 120000),
      cache: "no-store",
    });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: `upstream failed: ${e?.message ?? e}` }, { status: 502 });
  }
}
