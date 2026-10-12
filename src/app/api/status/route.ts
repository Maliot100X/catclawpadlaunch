import { listCoins } from "@/lib/db";
import { getRedis, pinataConfigured } from "@/lib/integrations";
import { neonConfigured } from "@/lib/neon";
import { getPlatformWallet } from "@/lib/launch-real";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live integration health — what is actually wired and responding right now.
export async function GET() {
  const checks: Record<string, any> = {};

  // Neon Postgres
  let coinCount: number | null = null;
  try {
    const rows = await listCoins(5);
    coinCount = rows.length;
    checks.neon_postgres = { ok: Boolean(process.env.DATABASE_URL), rows_read: coinCount };
  } catch (e) {
    checks.neon_postgres = { ok: false, error: String(e).slice(0, 100) };
  }

  // Neon Auth + Data API (public URLs)
  checks.neon_auth = {
    ok: neonConfigured,
    data_api: Boolean(process.env.NEXT_PUBLIC_NEON_DATA_API_URL),
    auth_url: Boolean(process.env.NEXT_PUBLIC_NEON_AUTH_URL),
  };

  // Neon AI Gateway
  checks.neon_ai_gateway = {
    ok: Boolean(process.env.NEON_AI_GATEWAY_BASE_URL && process.env.NEON_AI_GATEWAY_TOKEN),
    base_set: Boolean(process.env.NEON_AI_GATEWAY_BASE_URL),
    token_set: Boolean(process.env.NEON_AI_GATEWAY_TOKEN),
  };

  // Upstash Redis
  const r = getRedis();
  if (r) {
    try {
      await r.set("clawpad:health", Date.now(), { ex: 60 });
      const v = await r.get("clawpad:health");
      checks.upstash_redis = { ok: Boolean(v), url_set: Boolean(process.env.UPSTASH_REDIS_REST_URL) };
    } catch (e) {
      checks.upstash_redis = { ok: false, error: String(e).slice(0, 100) };
    }
  } else {
    checks.upstash_redis = { ok: false, note: "UPSTASH_REDIS_REST_URL/TOKEN not set" };
  }

  // Brain tiers
  const riverOk = Boolean(process.env.RIVER_API_KEY && process.env.FORGE_BRAIN_BASE);
  checks.brain = {
    ok: riverOk || Boolean(process.env.GROQ_API_KEY),
    river: riverOk,
    groq: Boolean(process.env.GROQ_API_KEY),
    model: process.env.FORGE_BRAIN_MODEL || null,
  };

  // Image gen
  checks.images = {
    ok: Boolean(process.env.POLLINATIONS_API_KEY),
    pollinations: Boolean(process.env.POLLINATIONS_API_KEY),
    model: "black-forest-labs/flux.1-schnell",
  };

  // IPFS
  checks.pinata_ipfs = { ok: pinataConfigured() };

  // Solana
  try {
    const { pubkey } = getPlatformWallet();
    checks.solana = {
      ok: true,
      platform_wallet: pubkey,
      cluster: process.env.NEXT_PUBLIC_CLUSTER || "devnet",
      rpc_set: Boolean(process.env.SOLANA_RPC_URL),
      mainnet_rpc_set: Boolean(process.env.HELIUS_MAINNET_RPC),
      mint_keypair: Boolean(process.env.AUTHORITY_SECRET_JSON || process.env.AUTHORITY_KEYPAIR_PATH),
    };
  } catch (e) {
    checks.solana = { ok: false, error: String(e).slice(0, 120) };
  }

  // Jupiter (public quote API needs no key)
  try {
    const jr = await fetch(
      "https://lite-api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000&slippageBps=50",
      { signal: AbortSignal.timeout(8000) }
    );
    const jj = jr.ok ? await jr.json() : null;
    checks.jupiter = {
      ok: jr.ok,
      quote_api: "lite-api.jup.ag",
      key_set: Boolean(process.env.JUPITER_API_KEY || process.env.JUPITER_SERVER_KEY),
      sample_out: jj?.outAmount ? String(jj.outAmount) : null,
    };
  } catch (e) {
    checks.jupiter = { ok: false, error: String(e).slice(0, 80) };
  }

  // Railway
  checks.railway = { ok: Boolean(process.env.RAILWAY_API_KEY) };

  const online = Object.values(checks).filter((c: any) => c?.ok).length;
  return Response.json(
    { ok: true, online, total: Object.keys(checks).length, checks },
    { headers: { "Cache-Control": "no-store" } }
  );
}
