import { NextRequest } from "next/server";
import { forge } from "@/lib/forge";
import { logoPrompt } from "@/lib/logo";
import { brainstorm } from "@/lib/brain";
import { groqText } from "@/lib/integrations";
import { insertCoin, listCoins, markLaunched } from "@/lib/db";
import { realDevnetLaunch } from "@/lib/launch-real";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Agent brain. Understands natural language plus explicit commands:
 *   launch <idea>   → forge branding + FLUX logo + real devnet mint
 *   forge <idea>    → branding + logo only (no chain write)
 *   trends          → live trend list
 *   coins           → launched mints
 *   status          → integration health
 *   help            → command list
 */

async function fluxLogo(name: string, desc: string, style: string): Promise<string | null> {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://gen.pollinations.ai/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "black-forest-labs/flux.1-schnell",
        prompt: logoPrompt(name, desc, style),
        n: 1, size: "512x512", response_format: "b64_json",
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const b64 = j?.data?.[0]?.b64_json;
    if (!b64) return null;
    // host it so the URL is usable outside this response
    try {
      const up = await fetch("https://media.pollinations.ai/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ data: b64, contentType: "image/png", name: `${name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.png` }),
        signal: AbortSignal.timeout(20000),
      });
      if (up.ok) { const uj = await up.json(); if (uj?.url) return uj.url; }
    } catch { /* fall through */ }
    return `data:image/png;base64,${b64}`;
  } catch { return null; }
}

function parseTemplate(text: string) {
  // "name | ticker | description" style reply from the brain
  const parts = text.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  return { name: parts[0], ticker: parts[1].toUpperCase().replace(/[^A-Z$]/g, ""), description: parts.slice(2).join(" ") };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const messages: { role: string; content: string }[] = body.messages ?? [];
  const last = String(messages[messages.length - 1]?.content ?? "").trim();
  const lower = last.toLowerCase();

  const help = `commands:
• launch <idea> — brand it, draw the logo, mint it for real on devnet
• forge <idea> — brand + logo only (no chain write)
• trends — what's hot right now
• coins — every mint we've launched
• status — which integrations are live
• or just describe a coin idea in plain words`;

  // --- explicit commands (no model needed: deterministic + real) ---
  if (!last || /^help$|^\?$/.test(lower)) {
    return Response.json({ reply: help, kind: "help" });
  }

  if (lower.startsWith("trends")) {
    try {
      const r = await fetch(new URL("/api/radar", req.nextUrl.origin), { cache: "no-store" });
      const j = await r.json();
      const lines = (j.trends ?? []).slice(0, 6).map((t: any) => `• [${t.source}] ${t.title} — ${t.heat}`).join("\n");
      return Response.json({ reply: `hot right now (${j.sources?.online ?? 0}/4 sources):\n${lines}`, kind: "trends" });
    } catch {
      return Response.json({ reply: "trend sources unreachable right now.", kind: "error" });
    }
  }

  if (lower.startsWith("coins") || lower.startsWith("launched")) {
    const rows = await listCoins(10);
    if (!rows.length) return Response.json({ reply: "nothing launched yet. try: launch a cat that refuses to pay taxes, in space", kind: "coins" });
    const lines = rows.map((c: any) => `• ${c.name} ${c.ticker} — ${c.status}${c.mint ? ` — ${c.mint.slice(0, 8)}…` : ""}`).join("\n");
    return Response.json({ reply: `${rows.length} coin(s):\n${lines}`, kind: "coins" });
  }

  if (lower.startsWith("status")) {
    try {
      const r = await fetch(new URL("/api/status", req.nextUrl.origin), { cache: "no-store" });
      const j = await r.json();
      const lines = Object.entries(j.checks ?? {}).map(([k, v]: any) => `• ${v?.ok ? "OK " : "-- "}${k}`).join("\n");
      return Response.json({ reply: `integrations ${j.online}/${j.total} online\n${lines}`, kind: "status" });
    } catch {
      return Response.json({ reply: "status check failed.", kind: "error" });
    }
  }

  const isLaunch = lower.startsWith("launch");
  const isForge = lower.startsWith("forge");
  if (isLaunch || isForge) {
    const idea = last.replace(/^(launch|forge)\s*/i, "").trim() || "a mystery cat";
    const base = forge({ prompt: idea, style: "auto" });
    let brain = await brainstorm(idea, "agent", process.env.FORGE_BRAIN_BASE, process.env.RIVER_API_KEY, process.env.FORGE_BRAIN_MODEL);
    if (!brain) {
      const txt = await groqText("Reply ONLY as: Name | TICKER | one-sentence description ending in 'Launched thru catclawpad.'", idea);
      const parsed = txt ? parseTemplate(txt) : null;
      if (parsed) brain = { ...parsed, tags: ["agent"], brain: "groq" } as any;
    }
    const coin: any = brain ? { ...base, ...brain } : base;
    const logo = await fluxLogo(coin.name, coin.description, coin.logoStyle);

    if (isForge) {
      await insertCoin({ ...coin, logoUrl: logo, source: "agent" });
      return Response.json({
        kind: "forge",
        reply: `${coin.name} ${coin.ticker}\n${coin.description}\nlogo: ${logo ?? "procedural"}\n—— say "launch ${idea}" to mint it for real.`,
        coin: { ...coin, logoUrl: logo },
      });
    }

    const rec = await insertCoin({ ...coin, logoUrl: logo, source: "agent" });
    try {
      const launch = await realDevnetLaunch({ name: coin.name, ticker: coin.ticker.replace("$", ""), description: coin.description });
      if (launch.ok) await markLaunched(coin.name, launch.mint!, launch.createSig, launch.mintSig, launch.explorer);
      return Response.json({
        kind: "launch",
        reply: launch.ok
          ? `LIVE on ${launch.cluster} — real mint\n${coin.name} ${coin.ticker}\nmint ${launch.mint}\nsupply ${launch.supply?.toLocaleString()} · cost ${launch.spentSol?.toFixed(5)} SOL\nhttps://explorer.solana.com/address/${launch.mint}?cluster=${launch.cluster}`
          : `branded but launch failed: ${launch.error}`,
        coin: { ...coin, logoUrl: logo, mint: launch.mint, explorer: launch.explorer },
        launch,
        coinId: rec?.id,
      });
    } catch (e: any) {
      return Response.json({ kind: "launch", reply: `launch error: ${String(e?.message ?? e).slice(0, 160)}` });
    }
  }

  // --- free-form: let the brain talk, and offer the launch command ---
  const sys = `You are CLAWPAD's launch agent for a Solana meme-coin launchpad. Be terse: 2-3 lines max, no markdown headers.
When the user describes a coin idea, reply with a short pitch AND end with the exact command they can run: "launch <their idea in a few words>".
You can also tell them: forge <idea>, trends, coins, status, help.`;
  let reply = await groqText(sys, last, 180);
  if (!reply) {
    const b = await brainstorm(last, "agent", process.env.FORGE_BRAIN_BASE, process.env.RIVER_API_KEY, process.env.FORGE_BRAIN_MODEL);
    reply = b
      ? `${b.name} ${b.ticker} — ${b.description}\nrun: launch ${last.slice(0, 60)}`
      : `I can brand and mint a coin for you. try: launch ${last.slice(0, 60)}`;
  }
  return Response.json({ reply, kind: "chat" });
}
