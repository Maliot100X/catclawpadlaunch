import { CLUSTER } from "@/lib/cluster";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    engine: "02_trading_agents",
    cluster: CLUSTER,
    status: "paused",
    message: "new agents paused_ — deploying closed for now. existing owners can withdraw anytime.",
    agents: [],
  });
}
