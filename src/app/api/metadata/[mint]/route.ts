import { listCoins } from "@/lib/db";
import { pinJsonToIpfs, pinataConfigured } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Token metadata in the shape wallets/explorers expect.
// Served by us, so no IPFS pinning service is required for a devnet mint.
export async function GET(_req: Request, ctx: { params: { mint: string } }) {
  const mint = ctx?.params?.mint ?? "";
  const coins = await listCoins(200);
  const c: any = coins.find((x: any) => x.mint === mint) ?? coins.find((x: any) => String(x.id) === mint);
  if (!c) {
    return Response.json({ error: "unknown mint", mint }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://catclawpad.vercel.app";
  const meta = {
      name: c.name,
      symbol: String(c.ticker || "").replace("$", ""),
      description: c.description ?? "",
      image: c.logo_url ?? `${origin}/coin/${c.id}`,
      external_url: `${origin}/coin/${c.mint ?? c.id}`,
      attributes: [
        { trait_type: "source", value: c.source ?? "forge" },
        { trait_type: "logo_style", value: c.logo_style ?? "auto" },
        { trait_type: "cluster", value: process.env.NEXT_PUBLIC_CLUSTER || "devnet" },
      ],
      properties: {
        mint: c.mint,
        cluster: process.env.NEXT_PUBLIC_CLUSTER || "devnet",
        created: c.when,
      },
  };

  // Pin the metadata to IPFS when Pinata is configured, so the URI is permanent.
  const pinned = pinataConfigured() ? await pinJsonToIpfs(meta, `clawpad-${c.ticker || c.id}`) : null;
  return Response.json(
    pinned ? { ...meta, ipfs: pinned.uri, ipfs_gateway: pinned.gateway } : meta,
    { headers: { "Cache-Control": "no-store" } }
  );
}
