import { NextRequest } from "next/server";
import { getPlatformWallet } from "@/lib/launch-real";
import { cacheGet, cacheSet } from "@/lib/integrations";
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRIP_SOL = 0.05;
const COOLDOWN_SECONDS = 3600;

/** Treasury info (public data only). */
export async function GET() {
  try {
    const { kp, conn } = getPlatformWallet();
    const bal = await conn.getBalance(kp.publicKey);
    return Response.json({
      ok: true,
      cluster: process.env.NEXT_PUBLIC_CLUSTER || "devnet",
      treasury: kp.publicKey.toBase58(),
      balanceSol: bal / LAMPORTS_PER_SOL,
      dripSol: DRIP_SOL,
      cooldownSeconds: COOLDOWN_SECONDS,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e).slice(0, 140) }, { status: 500 });
  }
}

/** Real devnet SOL from the treasury wallet (faucet). One drip per address per hour. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const address = String(body.address || "").trim();
  if (!address) return Response.json({ ok: false, error: "address required" }, { status: 400 });

  let to: PublicKey;
  try { to = new PublicKey(address); } catch { return Response.json({ ok: false, error: "invalid address" }, { status: 400 }); }

  const key = `clawpad:faucet:${address}`;
  const last = await cacheGet<number>(key);
  if (last) {
    const wait = COOLDOWN_SECONDS - Math.floor((Date.now() - Number(last)) / 1000);
    return Response.json({ ok: false, error: "cooldown", retryInSeconds: Math.max(wait, 1) }, { status: 429 });
  }

  try {
    const { kp, conn } = getPlatformWallet();
    const bal = await conn.getBalance(kp.publicKey);
    if (bal < (DRIP_SOL + 0.002) * LAMPORTS_PER_SOL) {
      return Response.json({ ok: false, error: "treasury empty", balanceSol: bal / LAMPORTS_PER_SOL }, { status: 503 });
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: to, lamports: Math.floor(DRIP_SOL * LAMPORTS_PER_SOL) })
    );
    const sig = await conn.sendTransaction(tx, [kp], { maxRetries: 3 });

    // poll confirmation (no websocket dependency)
    const started = Date.now();
    let confirmed = false;
    while (Date.now() - started < 60000) {
      const st = await conn.getSignatureStatuses([sig], { searchTransactionHistory: true });
      const s = st?.value?.[0];
      if (s?.err) break;
      if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) { confirmed = true; break; }
      await new Promise((r) => setTimeout(r, 1200));
    }

    await cacheSet(key, Date.now(), COOLDOWN_SECONDS);
    return Response.json({
      ok: true,
      signature: sig,
      dripSol: DRIP_SOL,
      to: address,
      confirmed,
      treasury: kp.publicKey.toBase58(),
      explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e).slice(0, 160) }, { status: 500 });
  }
}
