import { NextRequest } from "next/server";
import { getAgent, setAgentModel } from "@/lib/agents";
import { pinFile } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Agent 3D avatar, on the three.ws avatar stack (their viewer + their AvatarCreator),
 * NOT the coin-image lane:
 *   POST { src }   -> attach a hosted GLB URL (a three.ws avatar, or any .glb)
 *   PUT  multipart -> take the GLB exported by three.ws's AvatarCreator and pin it to IPFS
 *   GET            -> current avatar state
 */
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const id = Number(ctx?.params?.id);
  if (!Number.isFinite(id)) return Response.json({ ok: false, error: "bad id" }, { status: 400 });
  const found = await getAgent(id);
  if (!found) return Response.json({ ok: false, error: "agent not found" }, { status: 404 });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const src = typeof body?.src === "string" ? body.src.trim() : "";
  if (!/^https?:\/\/\S+\.glb($|\?)/i.test(src) && !/^https?:\/\/\S+/i.test(src)) {
    return Response.json({ ok: false, error: "provide { src } — a hosted .glb URL" }, { status: 400 });
  }
  await setAgentModel(id, src.slice(0, 600));
  return Response.json(
    { ok: true, agentId: id, status: "done", modelUrl: src, source: "attached" },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  const id = Number(ctx?.params?.id);
  if (!Number.isFinite(id)) return Response.json({ ok: false, error: "bad id" }, { status: 400 });
  const found = await getAgent(id);
  if (!found) return Response.json({ ok: false, error: "agent not found" }, { status: 404 });

  let form: FormData;
  try { form = await req.formData(); } catch { return Response.json({ ok: false, error: "expected multipart form-data" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ ok: false, error: "no file" }, { status: 400 });
  const mb = file.size / 1024 / 1024;
  if (mb > 40) return Response.json({ ok: false, error: `GLB too large (${mb.toFixed(1)} MB, max 40)` }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = `${(found.agent as any).name || "agent"}-${id}.glb`.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pinned = await pinFile(bytes, name, "model/gltf-binary");
  if (!pinned) return Response.json({ ok: false, error: "pin failed (PINATA_JWT missing?)" }, { status: 502 });

  await setAgentModel(id, pinned.gateway);
  return Response.json(
    { ok: true, agentId: id, status: "done", modelUrl: pinned.gateway, ipfs: pinned.uri, bytes: file.size, source: "three.ws AvatarCreator export" },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const id = Number(ctx?.params?.id);
  const found = await getAgent(id);
  if (!found) return Response.json({ ok: false, error: "agent not found" }, { status: 404 });
  const a: any = found.agent;
  const model = a.model_url ?? null;
  return Response.json(
    { ok: true, agentId: id, status: model ? "done" : "none", modelUrl: model, kind: model ? "glb" : null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
