export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tokenomics — devnet sim ledger. Live buyback/burn wired at mainnet phase.
export async function GET() {
  return Response.json({
    ok: true,
    mint: "CLAW_SIM_DEVNET",
    sol_fee: "0.00",
    buyback: 0,
    burn: 0,
    txs: [],
    note: "devnet simulation — fees accrue 0.02 SOL per live launch + 1% buys at mainnet phase",
  });
}
