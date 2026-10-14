/**
 * Render an actual image for a subject (a radar topic, a signal, a post) with our Pollinations lane,
 * then host it so the post has a stable public URL. This is the same FLUX lane that draws coin logos —
 * the result is an image OF the topic, not a text card with a number on it.
 */
export async function generateTopicImage(
  subject: string,
  opts?: { style?: string; size?: string }
): Promise<{ url: string | null; model: string; note: string }> {
  const key = process.env.POLLINATIONS_API_KEY;
  const topic = String(subject ?? "").trim().slice(0, 200);
  if (!topic) return { url: null, model: "flux", note: "no subject given" };
  if (!key) return { url: null, model: "flux", note: "POLLINATIONS_API_KEY missing" };

  const style = opts?.style ?? "cinematic editorial illustration, bold colors, high contrast, no text, no words, no letters";
  const prompt =
    `A striking visual interpretation of: "${topic}". ` +
    `Single clear subject, dramatic lighting, poster quality, ${style}.`;

  try {
    const r = await fetch("https://gen.pollinations.ai/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "black-forest-labs/flux.1-schnell",
        prompt,
        n: 1,
        size: opts?.size ?? "1024x576",
        response_format: "b64_json",
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) return { url: null, model: "flux.1-schnell", note: `upstream ${r.status}` };
    const j: any = await r.json();
    const b64 = j?.data?.[0]?.b64_json;
    let hosted: string | null = j?.data?.[0]?.url ?? null;
    if (!b64 && !hosted) return { url: null, model: "flux.1-schnell", note: "no image in response" };

    if (b64) {
      try {
        const up = await fetch("https://media.pollinations.ai/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            data: b64,
            contentType: "image/png",
            name: `topic-${Date.now()}.png`,
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (up.ok) {
          const uj: any = await up.json();
          hosted = uj?.url ?? hosted;
        }
      } catch { /* hosting optional */ }
    }

    if (!hosted) return { url: null, model: "flux.1-schnell", note: "generated but could not host" };
    return { url: hosted, model: "flux.1-schnell", note: "pollinations image lane" };
  } catch (e: any) {
    return { url: null, model: "flux.1-schnell", note: String(e?.message ?? e).slice(0, 80) };
  }
}
