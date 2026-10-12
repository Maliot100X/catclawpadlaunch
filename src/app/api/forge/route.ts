import { forge } from "@/lib/forge";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const coin = forge({
    prompt: body.prompt,
    xPost: body.xPost,
    hashtag: body.hashtag,
    imageUrl: body.imageUrl,
    tiktok: body.tiktok,
    trend: body.trend,
    style: body.style,
  });
  return Response.json({ ok: true, coin });
}
