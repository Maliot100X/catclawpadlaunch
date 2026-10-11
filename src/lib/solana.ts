import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import fs from "fs";
import { getRpcUrl, launchTotalSol, CLUSTER } from "./cluster";

export function getConnection(): Connection {
  return new Connection(getRpcUrl(), "confirmed");
}

export function loadAuthorityKeypair(): Keypair {
  const path = process.env.AUTHORITY_KEYPAIR_PATH;
  if (!path || !fs.existsSync(path)) {
    throw new Error("AUTHORITY_KEYPAIR_PATH missing — place devnet keypair JSON on disk");
  }
  const arr = JSON.parse(fs.readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

export async function getSolBalance(address: string): Promise<{ lamports: number; sol: number }> {
  const c = getConnection();
  const lamports = await c.getBalance(new PublicKey(address));
  return { lamports, sol: lamports / LAMPORTS_PER_SOL };
}

export async function assertFundedForLaunch(fundAddress: string): Promise<{
  ok: boolean;
  sol: number;
  need: number;
  cluster: string;
}> {
  const need = launchTotalSol();
  const { sol } = await getSolBalance(fundAddress);
  return { ok: sol + 1e-9 >= need, sol, need, cluster: CLUSTER };
}

export function authorityPubkey(): string {
  return process.env.AUTHORITY_PUBKEY || process.env.NEXT_PUBLIC_AUTHORITY_PUBKEY || loadAuthorityKeypair().publicKey.toBase58();
}
