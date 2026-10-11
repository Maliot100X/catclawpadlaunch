import { CREDIT_MARKET, RETAIL_PER_1M } from "@/lib/cluster";
import { creditWallet, getWallet } from "@/lib/ledger";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const rows = Object.entries(RETAIL_PER_1M).map(([model, retail]) => ({
    model,
    retail_per_1m: retail,
    builder_per_1m: retail * CREDIT_MARKET.builderPct,
  }));
  return Response.json({ market: "main_pool", rule: CREDIT_MARKET, rows, selling: "opens_soon" });
}

/** Buy credits at 60% retail — SOL settle stub until authority wallet wired */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const wallet = String(body.wallet || "");
  const sol = Number(body.sol || 0);
  if (!wallet || sol <= 0) return Response.json({ error: "wallet + sol required" }, { status: 400 });
  // stub: 1 SOL ~ $200 → credits at builder rate using claude retail mid
  const usd = sol * Number(process.env.SOL_USD_STUB || 200);
  const credits = usd; // 1 credit = $1 retail unit stub; adjust later
  const builderCredits = credits / CREDIT_MARKET.builderPct; // more credits at 60% price
  const w = creditWallet(wallet, builderCredits);
  return Response.json({
    ok: true,
    paid_sol: sol,
    credits_received: builderCredits,
    balance: w.credits,
    note: "SOL settlement is ledger-stub on devnet. Wire POOL_FEE_WALLET for real transfers.",
  });
}

export async function PUT(req: NextRequest) {
  // balance peek
  const body = await req.json().catch(() => ({}));
  return Response.json(getWallet(String(body.wallet || "")));
}
