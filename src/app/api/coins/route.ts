import { NextRequest } from "next/server";
import { listCoins, insertCoin, listCoinsFile, insertCoinFile } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prefix the table's snake_case columns back to the shape the UI expects.
function toUi(r: any) {
  return {
    id: r.id,
    mint: r.mint,
    name: r.name,
    ticker: r.ticker,
    description: r.description,
    tags: r.tags ?? [],
    logoStyle: r.logo_style ?? r.logoStyle ?? "auto",
    logoUrl: r.logo_url ?? r.logoUrl ?? null,
    source: r.source,
    status: r.status,
    createSig: r.create_sig ?? r.createSig ?? null,
    mintSig: r.mint_sig ?? r.mintSig ?? null,
    explorer: r.explorer ?? null,
    when: r.when,
  };
}

export async function GET() {
  const rows = await listCoins(100);
  if (rows.length > 0 || process.env.DATABASE_URL) {
    const coins = rows.map(toUi);
    return Response.json({ ok: true, total: coins.length, store: "neon", coins });
  }
  const fileCoins = await listCoinsFile();
  return Response.json({ ok: true, total: fileCoins.length, store: "file", coins: fileCoins.map(toUi) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const coin = body.coin ?? body;
  if (!coin?.name) return Response.json({ ok: false, error: "coin.name required" }, { status: 400 });

  const inserted = await insertCoin({
    name: coin.name,
    ticker: coin.ticker,
    description: coin.description,
    tags: coin.tags,
    logoStyle: coin.logoStyle,
    logoUrl: coin.logoUrl ?? null,
    source: coin.source,
    mint: coin.mint ?? null,
    status: coin.status ?? (coin.mint ? "LIVE" : "SIM"),
  });

  if (inserted) return Response.json({ ok: true, store: "neon", coin: toUi(inserted) });

  const row = await insertCoinFile({
    mint: coin.mint ?? null,
    name: coin.name,
    ticker: coin.ticker,
    description: coin.description ?? "",
    tags: coin.tags ?? [],
    logoStyle: coin.logoStyle ?? "auto",
    source: coin.source ?? "forge",
    status: coin.mint ? "LIVE" : "SIM",
  });
  return Response.json({ ok: true, store: "file", coin: toUi(row) });
}
