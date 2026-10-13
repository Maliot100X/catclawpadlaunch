import { NextRequest } from "next/server";
import { getAgent, setAgentModel, setAgentAvatarJob } from "@/lib/agents";
import { enqueueJob, getJob } from "@/lib/threejobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Real 3D avatar for an agent, built on the 3D lane we run
 * (FLUX render → trellis-2 → GLB, the working half of the three.ws toolchain):
 *   POST -> queue a text→3D build from the agent's name + persona
 *   GET  -> check the build; once the GLB exists it is attached to the agent
 */
export async function POST(_req: NextRequest, ctx: { params: { id: string } }) {
  const id = Number(ctx?.params?.id);
  if (!Number.isFinite(id)) return Response.json({ ok: false, error: "bad id" }, { status: 400 });
  const found = await getAgent(id);
  if (!found) return Response.json({ ok: false, error: "agent not found" }, { status: 404 });
  const a: any = found.agent;
  const prompt = `a chunky collectible 3D figurine avatar of ${a.name}${
    a.personality ? `, ${String(a.personality).slice(0, 90)}` : ""
  }, mascot style, single subject, clean background`;
  const job = await enqueueJob(prompt.slice(0, 280));
  if (!job) return Response.json({ ok: false, error: "3D queue unavailable" }, { status: 503 });
  await setAgentAvatarJob(id, job.id);
  return Response.json(
    { ok: true, agentId: id, job: job.id, prompt, poll: `/api/agents/${id}/avatar` },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const id = Number(ctx?.params?.id);
  const found = await getAgent(id);
  if (!found) return Response.json({ ok: false, error: "agent not found" }, { status: 404 });
  const a: any = found.agent;
  const jobId = a.avatar_job ?? null;
  if (!jobId) return Response.json({ ok: true, agentId: id, status: "none", modelUrl: a.model_url ?? null });

  const job = await getJob(Number(jobId));
  if (job?.status === "done" && job.glb_url) {
    if (a.model_url !== job.glb_url) await setAgentModel(id, job.glb_url);
    return Response.json(
      { ok: true, agentId: id, status: "done", modelUrl: job.glb_url, bytes: job.bytes, source: job.source },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  return Response.json(
    { ok: true, agentId: id, status: job?.status ?? "unknown", error: job?.error ?? null, modelUrl: a.model_url ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
