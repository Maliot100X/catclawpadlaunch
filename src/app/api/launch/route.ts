import { createDevWalletRecord, getDevWallet, launchQuote, markFunded, markLaunched, mockPumpCreate } from "@/lib/launch";
import { CLUSTER } from "@/lib/cluster";
import { upsertPool } from "@/lib/ledger";
import {
  assertFundedForLaunch,
  authorityPubkey,
  getConnection,
  getSolBalance,
  loadAuthorityKeypair,
} from "@/lib/solana";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createFamilyMint } from "@/lib/mint";
import bs58 from "bs58";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const q = launchQuote();
  try {
    const auth = authorityPubkey();
    const bal = await getSolBalance(auth);
    return Response.json({ ...q, authority: auth, authority_sol: bal.sol });
  } catch {
    return Response.json(q);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "create");
  const family = String(body.family || "claude");

  if (action === "create") {
    const kp = Keypair.generate();
    const pub = kp.publicKey.toBase58();
    const secretEnc = bs58.encode(kp.secretKey);
    const row = createDevWalletRecord(family, pub, secretEnc);
    return Response.json({
      cluster: CLUSTER,
      family,
      fund_address: pub,
      quote: launchQuote(),
      status: row.status,
      next: "Fund fund_address, or POST action=fund_from_authority, then action=confirm",
    });
  }

  if (action === "fund_from_authority") {
    const fund = String(body.fund_address || "");
    const w = getDevWallet(fund);
    if (!w) return Response.json({ error: "unknown fund_address" }, { status: 404 });
    const need = launchQuote().totalSol;
    const authority = loadAuthorityKeypair();
    const conn = getConnection();
    const authBal = await conn.getBalance(authority.publicKey);
    if (authBal / LAMPORTS_PER_SOL < need + 0.01) {
      return Response.json(
        { error: "authority underfunded", authority_sol: authBal / LAMPORTS_PER_SOL, need },
        { status: 400 }
      );
    }
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: new PublicKey(fund),
        lamports: Math.ceil(need * LAMPORTS_PER_SOL),
      })
    );
    const sig = await sendAndConfirmTransaction(conn, tx, [authority], { commitment: "confirmed" });
    const bal = await getSolBalance(fund);
    markFunded(fund);
    return Response.json({ ok: true, signature: sig, fund_address: fund, fund_sol: bal.sol, cluster: CLUSTER });
  }

  if (action === "confirm") {
    const fund = String(body.fund_address || "");
    const w = getDevWallet(fund);
    if (!w) return Response.json({ error: "unknown fund_address" }, { status: 404 });
    const check = await assertFundedForLaunch(fund);
    if (!check.ok) {
      return Response.json(
        { error: "insufficient SOL on fund_address", ...check, tip: "fund_from_authority or send SOL" },
        { status: 400 }
      );
    }
    markFunded(fund);
    // REAL_MINT=1 → create real SPL mint on current cluster (devnet). Else mock id.
    if (process.env.REAL_MINT === "1") {
      try {
        const real = await createFamilyMint({ family: w.family });
        markLaunched(fund, real.mint);
        upsertPool({ mint: real.mint, family: w.family, staked: 0, apy: 0, cluster: CLUSTER });
        return Response.json({
          ok: true,
          mock: false,
          real_spl: true,
          cluster: CLUSTER,
          mint: real.mint,
          signature: real.signature,
          funded_sol: check.sol,
          status: "launched",
          note: "Real SPL mint created on cluster. Pump bonding curve still separate.",
        });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500 });
      }
    }
    const mock = process.env.LAUNCH_MOCK !== "0";
    if (mock) {
      const { mint, signature } = mockPumpCreate(w.family, CLUSTER);
      markLaunched(fund, mint);
      upsertPool({ mint, family: w.family, staked: 0, apy: 0, cluster: CLUSTER });
      return Response.json({
        ok: true,
        mock: true,
        cluster: CLUSTER,
        mint,
        signature,
        funded_sol: check.sol,
        status: "launched",
        note: "Fund check passed. Set REAL_MINT=1 for on-chain SPL mint.",
      });
    }
    return Response.json({ error: "set REAL_MINT=1 or LAUNCH_MOCK=1" }, { status: 501 });
  }

  if (action === "authority_balance") {
    const auth = authorityPubkey();
    const bal = await getSolBalance(auth);
    return Response.json({ cluster: CLUSTER, authority: auth, ...bal });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
