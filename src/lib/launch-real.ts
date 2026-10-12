// Real devnet launch: SPL mint via @solana/web3.js + @solana/spl-token.
// Platform wallet pays. Confirmation uses RPC polling (no websocket) so it works on locked-down hosts.

import {
  Connection, Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createInitializeMintInstruction, mintTo, MINT_SIZE,
  getMinimumBalanceForRentExemptMint, createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress, TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { readFileSync } from "fs";
import path from "path";

export type LaunchResult = {
  ok: boolean;
  cluster: string;
  wallet?: string;
  mint?: string;
  ata?: string;
  createSig?: string;
  mintSig?: string;
  supply?: number;
  spentSol?: number;
  explorer?: string;
  error?: string;
};

let cached: { kp: Keypair; conn: Connection } | null = null;

export function getPlatformWallet() {
  if (cached) return { kp: cached.kp, conn: cached.conn, pubkey: cached.kp.publicKey.toBase58() };
  // Works on Vercel too: full keypair JSON in AUTHORITY_SECRET_JSON, else the on-box file.
  const inline = process.env.AUTHORITY_SECRET_JSON;
  let secret: Uint8Array;
  if (inline) {
    const parsed = inline.trim().startsWith("[") ? JSON.parse(inline) : JSON.parse(inline).secretKey;
    secret = Uint8Array.from(parsed as number[]);
  } else {
    const p = process.env.AUTHORITY_KEYPAIR_PATH || path.join(process.cwd(), "dev-wallets/authority.devnet.json");
    secret = Uint8Array.from(JSON.parse(readFileSync(p, "utf8")) as number[]);
  }
  const kp = Keypair.fromSecretKey(secret);
  const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const conn = new Connection(rpc, "confirmed");
  cached = { kp, conn };
  return { kp, conn, pubkey: kp.publicKey.toBase58() };
}

/** Poll-based confirmation — avoids websocket dependency entirely. */
async function confirmByPolling(conn: Connection, sig: string, timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await conn.getSignatureStatuses([sig], { searchTransactionHistory: true });
    const st = res?.value?.[0];
    if (st?.err) throw new Error(`tx failed on-chain: ${JSON.stringify(st.err)}`);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return;
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error(`confirmation timeout for ${sig}`);
}

async function sendPolled(conn: Connection, tx: Transaction, signers: Keypair[]): Promise<string> {
  const sig = await conn.sendTransaction(tx, signers, { maxRetries: 3 });
  await confirmByPolling(conn, sig);
  return sig;
}

/** Real SPL token creation on the configured cluster: 1B supply, 9 decimals, all to treasury ATA. */
export async function realDevnetLaunch(coin: { name: string; ticker: string; description?: string }): Promise<LaunchResult> {
  const { kp, conn } = getPlatformWallet();
  const cluster = process.env.NEXT_PUBLIC_CLUSTER || "devnet";
  const bal0 = await conn.getBalance(kp.publicKey);

  const mint = Keypair.generate();
  const ata = await getAssociatedTokenAddress(mint.publicKey, kp.publicKey, false, TOKEN_PROGRAM_ID);
  const rent = await getMinimumBalanceForRentExemptMint(conn);

  const createTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: kp.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports: rent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mint.publicKey, 9, kp.publicKey, kp.publicKey),
  );
  const createSig = await sendPolled(conn, createTx, [kp, mint]);

  const ataTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(kp.publicKey, ata, kp.publicKey, mint.publicKey, TOKEN_PROGRAM_ID)
  );
  await sendPolled(conn, ataTx, [kp]);

  const supply = 1_000_000_000_000_000_000n; // 1B * 10^9
  const mintTx = await mintTo(conn, kp, mint.publicKey, ata, kp, supply);

  const bal1 = await conn.getBalance(kp.publicKey);

  return {
    ok: true,
    cluster,
    wallet: kp.publicKey.toBase58(),
    mint: mint.publicKey.toBase58(),
    ata: ata.toBase58(),
    createSig,
    mintSig: mintTx,
    supply: 1_000_000_000,
    spentSol: (bal0 - bal1) / LAMPORTS_PER_SOL,
    explorer: `https://explorer.solana.com/address/${mint.publicKey.toBase58()}?cluster=${cluster}`,
  };
}
