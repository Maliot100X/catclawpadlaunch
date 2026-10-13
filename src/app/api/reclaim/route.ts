import { NextRequest } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createCloseAccountInstruction } from "@solana/spl-token";
import { getPlatformWallet } from "@/lib/launch-real";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const RENT_PER_ACCOUNT = 0.00203928; // rent-exempt minimum for an SPL token account

/**
 * Reclaim rent from a devnet wallet: list its empty SPL token accounts and,
 * when there are any, build one real transaction that closes them.
 * The treasury pays the fee; the reclaimed SOL goes back to the wallet owner.
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") || "";
  if (!wallet) return Response.json({ ok: false, error: "wallet required" }, { status: 400 });
  try {
    const { kp, conn } = getPlatformWallet();
    const owner = new PublicKey(wallet);
    if (owner.toBase58() === kp.publicKey.toBase58()) {
      return Response.json({ ok: false, error: "refusing to sweep the treasury wallet" }, { status: 400 });
    }

    const { value: accounts } = await conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID });
    const empty = accounts.filter((a: any) => {
      const amt = a.account?.data?.parsed?.info?.tokenAmount;
      return amt && Number(amt.uiAmount ?? 0) === 0;
    });
    if (!empty.length) {
      return Response.json({ ok: true, emptyCount: 0, recoveredSol: 0, note: "nothing to reclaim" }, { headers: { "Cache-Control": "no-store" } });
    }

    const tx = new Transaction();
    for (const a of empty.slice(0, 20)) {
      tx.add(createCloseAccountInstruction(a.pubkey, owner, owner, [], TOKEN_PROGRAM_ID));
    }
    tx.feePayer = kp.publicKey;
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.partialSign(kp);

    return Response.json(
      {
        ok: true,
        emptyCount: empty.length,
        recoveredSol: Number((empty.length * RENT_PER_ACCOUNT).toFixed(6)),
        transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"),
        note: "sign to close the accounts and collect the rent",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
