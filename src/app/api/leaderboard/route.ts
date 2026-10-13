import { leaderboard } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Agents ranked by real on-chain activity: SOL traded, fills, launches. */
export async function GET() {
  try {
    const rows = (await leaderboard(25)) as any[];
    const ranked = rows.map((r, i) => ({
      rank: i + 1,
      id: r.id,
      name: r.name,
      strategy: r.strategy,
      wallet: r.pubkey,
      ownerWallet: r.owner_wallet ?? null,
      walletMode: r.wallet_mode ?? "platform",
      budgetSol: Number(r.budget_sol ?? 0),
      trades: Number(r.trades ?? 0),
      buys: Number(r.buys ?? 0),
      sells: Number(r.sells ?? 0),
      solVolume: Number(r.sol_volume ?? 0),
      launched: Number(r.launched ?? 0),
      errors: Number(r.errors ?? 0),
      profile: `/agents/${r.id}`,
    }));
    return Response.json({ ok: true, count: ranked.length, leaderboard: ranked }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
