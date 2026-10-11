import { createDevWalletRecord, getDevWallet, launchQuote, markFunded, markLaunched, mockPumpCreate } from "@/lib/launch";
import { CLUSTER } from "@/lib/cluster";
import { upsertPool } from "@/lib/ledger";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(launchQuote());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "create");
  const family = String(body.family || "claude");

  if (action === "create") {
    const kp = Keypair.generate();
    const pub = kp.publicKey.toBase58();
    const secretEnc = bs58.encode(kp.secretKey); // local only; encrypt with AUTHORITY key in prod
    const row = createDevWalletRecord(family, pub, secretEnc);
    return Response.json({
      cluster: CLUSTER,
      family,
      fund_address: pub,
      quote: launchQuote(),
      status: row.status,
      next: "Send launch total SOL to fund_address on current CLUSTER, then POST action=confirm",
    });
  }

  if (action === "confirm") {
    const fund = String(body.fund_address || "");
    const w = getDevWallet(fund);
    if (!w) return Response.json({ error: "unknown fund_address" }, { status: 404 });
    markFunded(fund);
    // Real path: check balance via Helius RPC >= launchTotalSol(), then pump create
    const mock = process.env.LAUNCH_MOCK !== "0";
    if (mock || CLUSTER !== "mainnet-beta") {
      const { mint, signature } = mockPumpCreate(family, CLUSTER);
      markLaunched(fund, mint);
      upsertPool({ mint, family: w.family, staked: 0, apy: 0, cluster: CLUSTER });
      return Response.json({
        ok: true,
        mock: true,
        cluster: CLUSTER,
        mint,
        signature,
        status: "launched",
        note: "Mock pump create for devnet/testnet. Set LAUNCH_MOCK=0 + real pump SDK for live txs.",
      });
    }
    return Response.json({ error: "mainnet launch requires LAUNCH_MOCK=0 and pump integration" }, { status: 501 });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
