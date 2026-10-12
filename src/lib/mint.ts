import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, Connection } from "@solana/web3.js";
import { getConnection, loadAuthorityKeypair } from "./solana";
import { CLUSTER } from "./cluster";

/**
 * Real on-chain SPL mint (devnet/testnet). Not pump.fun bonding curve —
 * full pump SDK is separate; this gives a real tradeable mint + supply for testing.
 */
export async function createFamilyMint(params: {
  family: string;
  decimals?: number;
  supply?: bigint;
}): Promise<{ mint: string; signature: string; cluster: string }> {
  const conn = getConnection();
  const payer = loadAuthorityKeypair();
  const decimals = params.decimals ?? 6;
  const supply = params.supply ?? 1_000_000_000n * 10n ** BigInt(decimals); // 1B

  const mint = await createMint(conn, payer, payer.publicKey, payer.publicKey, decimals, undefined, undefined, TOKEN_PROGRAM_ID);
  const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
  const sig = await mintTo(conn, payer, mint, ata.address, payer, supply);

  return { mint: mint.toBase58(), signature: sig, cluster: CLUSTER };
}

export async function getRecentSlot(conn?: Connection): Promise<number> {
  return (conn || getConnection()).getSlot();
}
