import { listPools } from "@/lib/ledger";
import { CLUSTER } from "@/lib/cluster";

export const runtime = "nodejs";

export async function GET() {
  const pools = listPools().filter((p) => p.cluster === CLUSTER || true);
  return Response.json({
    engine: "01_model_tokens",
    cluster: CLUSTER,
    pools: pools.length,
    staked_usd: 0,
    stakers: 0,
    printed: 0,
    items: pools,
  });
}
