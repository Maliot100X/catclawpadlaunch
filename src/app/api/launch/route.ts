import { NextRequest } from "next/server";
import { realDevnetLaunch, getPlatformWallet } from "@/lib/launch-real";
import { markLaunched } from "@/lib/db";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB = path.join(process.cwd(), ".data", "coins.json");

export async function GET() {
  try {
    const { pubkey } = getPlatformWallet();
    return Response.json({ ok: true, wallet: pubkey, cluster: process.env.NEXT_PUBLIC_CLUSTER || "devnet" });
  } catch (e) {
    return Response.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 });
  }
}

/** Real devnet launch: SPL mint on the platform wallet. body: { coin: {...}, devBuy?: number } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const coin = body.coin;
  if (!coin?.name || !coin?.ticker) {
    return Response.json({ ok: false, error: "coin.name and coin.ticker required" }, { status: 400 });
  }
  try {
    const res = await realDevnetLaunch({
      name: coin.name,
      ticker: String(coin.ticker).replace("$", ""),
      description: coin.description ?? "",
    });

    if (res.ok) {
      // persist LIVE status on the coin record (Neon first, JSON fallback)
      await markLaunched(coin.name, res.mint!, res.createSig, res.mintSig, res.explorer);

      let coins: any[] = [];
      try { coins = JSON.parse(await fs.readFile(DB, "utf8")); } catch {}
      const target = coins.find((c) => c.name === coin.name && (!c.mint || c.mint === coin.mint));
      if (target) {
        target.mint = res.mint;
        target.status = "LIVE";
        target.createSig = res.createSig;
        target.mintSig = res.mintSig;
        target.explorer = res.explorer;
        target.launchedAt = new Date().toISOString();
        await fs.mkdir(path.dirname(DB), { recursive: true });
        await fs.writeFile(DB, JSON.stringify(coins, null, 2));
      }
    }
    return Response.json(res);
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e).slice(0, 300) }, { status: 500 });
  }
}
