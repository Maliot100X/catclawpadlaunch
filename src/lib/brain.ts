// Real forge brain: River DeepSeek V4.1-Flash generates name/ticker/lore.
// Falls back to deterministic forge() only if the brain is unreachable.

export type BrainResult = {
  name: string;
  ticker: string;
  description: string;
  tags: string[];
  brain: "river-deepseek" | "local-fallback";
};

const SYSTEM = `You are the branding engine of a Solana meme-coin launchpad. Given a viral idea, respond ONLY with compact JSON:
{"name":"<max 3 words, catchy>","ticker":"<2-6 uppercase letters>","description":"<2 sentences of meme lore, ends with 'Launched thru catclawpad.'>","tags":["<src>","<2-3 hashtag words without #>"]}
No markdown, no commentary — JSON only.`;

export async function brainstorm(raw: string, source: string, base?: string, key?: string, model?: string): Promise<BrainResult | null> {
  if (!key || !base || !model) return null;
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        temperature: 0.9,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Idea (${source}): ${raw}` },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const txt: string = j?.choices?.[0]?.message?.content ?? "";
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const p = JSON.parse(m[0]);
    if (!p.name || !p.ticker || !p.description) return null;
    const ticker = String(p.ticker).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "CLAW";
    return {
      name: String(p.name).slice(0, 40),
      ticker: "$" + ticker,
      description: String(p.description).slice(0, 280),
      tags: Array.isArray(p.tags) ? p.tags.slice(0, 5).map(String) : [source, "meme"],
      brain: "river-deepseek",
    };
  } catch {
    return null;
  }
}
