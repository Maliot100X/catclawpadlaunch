import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
const DB = path.join(process.cwd(), ".data", "coins.json");

export async function GET() {
  try {
    const raw = await fs.readFile(DB, "utf8");
    const coins = JSON.parse(raw);
    return Response.json({ ok: true, total: coins.length, coins });
  } catch {
    return Response.json({ ok: true, total: 0, coins: [] });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const coin = body.coin ?? body;
  if (!coin?.name) return Response.json({ ok: false, error: "coin.name required" }, { status: 400 });
  let coins: any[] = [];
  try { coins = JSON.parse(await fs.readFile(DB, "utf8")); } catch {}
  const rec = {
    id: coins.length + 1,
    mint: coin.mint ?? null,
    name: coin.name,
    ticker: coin.ticker,
    description: coin.description ?? "",
    tags: coin.tags ?? [],
    logoStyle: coin.logoStyle ?? "auto",
    source: coin.source ?? "forge",
    status: coin.mint ? "LIVE" : "SIM",
    when: new Date().toISOString(),
  };
  coins.unshift(rec);
  await fs.mkdir(path.dirname(DB), { recursive: true });
  await fs.writeFile(DB, JSON.stringify(coins, null, 2));
  return Response.json({ ok: true, coin: rec });
}
