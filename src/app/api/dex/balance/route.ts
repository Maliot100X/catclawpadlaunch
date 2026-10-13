import { NextRequest } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getPlatformWallet } from "@/lib/launch-real";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Real on-chain balance of a wallet's token account for one mint. */
export async function GET(req: NextRequest) {
  const mint = req.nextUrl.searchParams.get("mint") || "";
  const owner = req.nextUrl.searchParams.get("owner") || "";
  if (!mint || !owner) return Response.json({ ok: false, error: "mint and owner required" }, { status: 400 });
  try {
    const { conn } = getPlatformWallet();
    const ata = await getAssociatedTokenAddress(new PublicKey(mint), new PublicKey(owner), false, TOKEN_PROGRAM_ID);
    const info = await conn.getAccountInfo(ata);
    if (!info) return Response.json({ ok: true, ata: ata.toBase58(), exists: false, uiAmount: 0, amount: "0" }, { headers: { "Cache-Control": "no-store" } });
    const bal = await conn.getTokenAccountBalance(ata);
    return Response.json(
      { ok: true, ata: ata.toBase58(), exists: true, uiAmount: bal.value.uiAmount ?? 0, amount: bal.value.amount, decimals: bal.value.decimals },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
