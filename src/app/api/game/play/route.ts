import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { sqlClient } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/**
 * The game brain. An agent (or a human) sends the board and our LLM decides the next move.
 * Same lane and key as every other agent decision: River / DeepSeek via FORGE_BRAIN_*.
 *
 * POST { snake: [[x,y],…], food: [x,y], grid: N, score: n, direction: "UP", hazard?: string }
 *   Authorization: Bearer <agentToken>   (optional — identifies which agent is playing)
 * -> { ok, move: "UP"|"DOWN"|"LEFT"|"RIGHT", reason, model, agent? }
 */
function opposite(a: string, b: string) {
  return (a === "UP" && b === "DOWN") || (a === "DOWN" && b === "UP") ||
         (a === "LEFT" && b === "RIGHT") || (a === "RIGHT" && b === "LEFT");
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const snake: number[][] = Array.isArray(body?.snake) ? body.snake : [];
  const food: number[] | null = Array.isArray(body?.food) ? body.food : null;
  const grid = Number(body?.grid) || 20;
  const score = Number(body?.score) || 0;
  const dir = String(body?.direction ?? "RIGHT");

  if (!snake.length || !food) {
    return Response.json({ ok: false, error: "snake and food required" }, { status: 400 });
  }

  // who is playing (optional) — the agent's API key doubles as identity
  let who: { id: number; name: string; apiKey?: string | null } | null = null;
  const raw = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (raw) {
    const sql = sqlClient();
    if (sql) {
      try {
        const h = createHash("sha256").update(raw).digest("hex");
        const rows = await sql`SELECT id, name, api_key FROM agents WHERE token = ${h} LIMIT 1`;
        const a: any = (rows as any[])[0];
        if (a) who = { id: a.id, name: a.name, apiKey: a.api_key };
      } catch { /* identity is optional */ }
    }
  }

  const head = snake[0];
  const legal = ["UP", "DOWN", "LEFT", "RIGHT"].filter((d) => !opposite(d, dir));
  const blocked = new Set(snake.slice(0, -1).map(([x, y]) => `${x},${y}`));
  const deltas: Record<string, [number, number]> = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] };
  const safe = legal.filter((d) => {
    const [dx, dy] = deltas[d];
    const nx = head[0] + dx, ny = head[1] + dy;
    if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) return false;
    return !blocked.has(`${nx},${ny}`);
  });

  const legalSet = new Set(legal);
  const base = process.env.FORGE_BRAIN_BASE || "https://api.river.ai/v1";
  const model = process.env.FORGE_BRAIN_MODEL || "deepseek-ai/DeepSeek-V4.1-Flash";
  const key = who?.apiKey || process.env.RIVER_API_KEY || process.env.HERMES_CUSTOM_API_RIVER_AI_API_KEY;

  let llmNote = "";
  if (key) {
    const prompt =
      `You are playing snake on a ${grid}x${grid} grid. Board reading:\n` +
      `snake head: ${head[0]},${head[1]}\nfood: ${food[0]},${food[1]}\ncurrent direction: ${dir}\n` +
      `your body (x,y): ${snake.map(([x, y]) => `${x},${y}`).join(" ")}\n` +
      `moves that do not reverse: ${legal.join(", ")}\n` +
      `moves that are immediately fatal: ${legal.filter((d) => !safe.includes(d)).join(", ") || "none"}\n` +
      `Answer with ONE move word only: UP, DOWN, LEFT, RIGHT. Then a dash and a reason of max 12 words.`;
    try {
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You play snake. Reply exactly: <MOVE> - <short reason>. Move must be one of UP, DOWN, LEFT, RIGHT." },
            { role: "user", content: prompt },
          ],
          max_tokens: 40,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(25000),
      });
      if (r.ok) {
        const j: any = await r.json();
        const text = String(j?.choices?.[0]?.message?.content ?? "").trim();
        const m = (text.toUpperCase().match(/\b(UP|DOWN|LEFT|RIGHT)\b/) || [])[1] as string | undefined;
        if (m && legalSet.has(m)) {
          const reason = text.split("-").slice(1).join("-").trim().slice(0, 120) || "model choice";
          return Response.json({ ok: true, move: m, reason, model, agent: who ?? null },
            { headers: { "Cache-Control": "no-store" } });
        }
      }
    } catch { /* fall through to the deterministic safe move */ }
  }

  // No usable model answer: still play well — pick the safe move that gets closest to the food.
  const pool = safe.length ? safe : legal;
  let best = pool[0] ?? "RIGHT";
  let bestD = Infinity;
  for (const d of pool) {
    const [dx, dy] = deltas[d];
    const d2 = Math.abs(head[0] + dx - food[0]) + Math.abs(head[1] + dy - food[1]);
    if (d2 < bestD) { bestD = d2; best = d; }
  }
  return Response.json(
    {
      ok: true,
      move: best,
      reason: key
        ? `fallback (${llmNote || "model gave no usable move"}) — greedy safe step toward food`
        : "fallback — no LLM key on this request, greedy safe step toward food",
      model: key ? model : "fallback",
      agent: who ?? null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
