import { createApiKey, creditWallet, getWallet } from "@/lib/ledger";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

/** Dev/test helper: top up credits + issue key for a wallet. Mainnet will gate with SIWS. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const wallet = String(body.wallet || "devnet-test-wallet");
  const credits = Number(body.credits ?? 100);
  creditWallet(wallet, credits);
  const { raw, row } = createApiKey(wallet);
  const w = getWallet(wallet);
  return Response.json({
    wallet: w.wallet,
    credits: w.credits,
    api_key: raw,
    key_meta: { id: row.id, prefix: row.prefix, created: row.created },
    note: "api_key shown once. Store it. CLUSTER is not mainnet by default.",
  });
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") || "devnet-test-wallet";
  const w = getWallet(wallet);
  return Response.json(w);
}
