// Real devnet market for our own mints.
//
// Every buy/sell is a real Solana devnet transaction settled on-chain: the user
// signs a transfer of SOL (buy) or tokens (sell), the treasury wallet co-signs
// and moves the other side in the SAME atomic transaction. Pricing follows a
// pump.fun-style constant-product bonding curve with virtual reserves.
//   buy : tokensOut = vTokens - k/(vSol + netIn)
//   sell: solOut    = vSol    - k/(vTokens + netIn)
// Nothing is simulated: no fill can happen without a confirmed on-chain tx.

import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction,
  getAssociatedTokenAddress, TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { neon } from "@neondatabase/serverless";
import { getPlatformWallet } from "./launch-real";

export const DECIMALS = 9;
export const TOKEN_UNIT = 10n ** BigInt(DECIMALS);

// pump.fun-shaped curve: 30 virtual SOL against ~1.073B virtual tokens.
export const VIRTUAL_SOL_INIT = 30n * BigInt(LAMPORTS_PER_SOL);
export const VIRTUAL_TOKENS_INIT = 1_073_000_000n * TOKEN_UNIT;
export const GRADUATION_SOL = 85n * BigInt(LAMPORTS_PER_SOL);
export const FEE_BPS = 100n;                 // 1% -> treasury (matches tokenomics)
export const MIN_BUY_LAMPORTS = 10_000_000n; // 0.01 SOL
export const MAX_BUY_LAMPORTS = 5n * BigInt(LAMPORTS_PER_SOL);

export type Pool = {
  mint: string;
  virtualSol: bigint;
  virtualTokens: bigint;
  solCollected: bigint;
  feeBps: bigint;
  buys: number;
  sells: number;
  lastPrice: number | null;
};

function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

let ready = false;
async function ensureDexSchema(sql: any) {
  if (ready) return;
  await sql`
    CREATE TABLE IF NOT EXISTS devnet_pools (
      mint TEXT PRIMARY KEY,
      virtual_sol NUMERIC NOT NULL,
      virtual_tokens NUMERIC NOT NULL,
      sol_collected NUMERIC NOT NULL DEFAULT 0,
      fee_bps INT NOT NULL DEFAULT 100,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS devnet_trades (
      id BIGSERIAL PRIMARY KEY,
      mint TEXT NOT NULL,
      side TEXT NOT NULL,
      user_wallet TEXT NOT NULL,
      sol_amount NUMERIC NOT NULL,
      token_amount NUMERIC NOT NULL,
      price NUMERIC NOT NULL,
      fee NUMERIC NOT NULL DEFAULT 0,
      signature TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS devnet_trades_mint_idx ON devnet_trades (mint, created_at DESC)`;
  ready = true;
}

/** Pool for a mint, created on first touch with the curve's initial reserves. */
export async function getPool(mint: string): Promise<Pool | null> {
  const sql = sqlClient();
  if (!sql) return null;
  await ensureDexSchema(sql);
  const found = await sql`SELECT * FROM devnet_pools WHERE mint = ${mint}`;
  if (!found.length) {
    await sql`
      INSERT INTO devnet_pools (mint, virtual_sol, virtual_tokens, sol_collected, fee_bps)
      VALUES (${mint}, ${VIRTUAL_SOL_INIT.toString()}, ${VIRTUAL_TOKENS_INIT.toString()}, 0, ${Number(FEE_BPS)})
      ON CONFLICT (mint) DO NOTHING
    `;
  }
  const rows = await sql`
    SELECT p.mint, p.virtual_sol, p.virtual_tokens, p.sol_collected, p.fee_bps,
           (SELECT count(*) FROM devnet_trades t WHERE t.mint = p.mint AND t.side = 'buy')  AS buys,
           (SELECT count(*) FROM devnet_trades t WHERE t.mint = p.mint AND t.side = 'sell') AS sells,
           (SELECT price FROM devnet_trades t WHERE t.mint = p.mint ORDER BY created_at DESC LIMIT 1) AS last_price
    FROM devnet_pools p WHERE p.mint = ${mint}
  `;
  const r: any = rows[0];
  if (!r) return null;
  return {
    mint: r.mint,
    virtualSol: BigInt(Math.trunc(Number(r.virtual_sol))),
    virtualTokens: BigInt(Math.trunc(Number(r.virtual_tokens))),
    solCollected: BigInt(Math.trunc(Number(r.sol_collected))),
    feeBps: BigInt(Number(r.fee_bps)),
    buys: Number(r.buys ?? 0),
    sells: Number(r.sells ?? 0),
    lastPrice: r.last_price == null ? null : Number(r.last_price),
  };
}

export function priceSolPerToken(pool: Pool): number {
  return Number(pool.virtualSol) / Number(pool.virtualTokens);
}

export function curveProgressPct(pool: Pool): number {
  const pct = (Number(pool.solCollected) / Number(GRADUATION_SOL)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
}

export function marketCapSol(pool: Pool): number {
  const tokens = Number(VIRTUAL_TOKENS_INIT) / Number(TOKEN_UNIT);
  return priceSolPerToken(pool) * tokens;
}

/** Constant-product quote. Returns null when the trade is out of bounds. */
export function quoteBuy(pool: Pool, solLamports: bigint) {
  if (solLamports < MIN_BUY_LAMPORTS || solLamports > MAX_BUY_LAMPORTS) {
    return { error: `amount must be between ${Number(MIN_BUY_LAMPORTS) / LAMPORTS_PER_SOL} and ${Number(MAX_BUY_LAMPORTS) / LAMPORTS_PER_SOL} SOL` };
  }
  const fee = (solLamports * pool.feeBps) / 10_000n;
  const net = solLamports - fee;
  const k = pool.virtualSol * pool.virtualTokens;
  const newVsol = pool.virtualSol + net;
  const tokensOut = pool.virtualTokens - k / newVsol;
  const price = Number(solLamports) / Number(tokensOut);
  return { fee, net, tokensOut, newVsol, newVtokens: k / newVsol, price };
}

export function quoteSell(pool: Pool, tokenAmount: bigint) {
  if (tokenAmount <= 0n) return { error: "amount must be positive" };
  const fee = (tokenAmount * pool.feeBps) / 10_000n;
  const net = tokenAmount - fee;
  const k = pool.virtualSol * pool.virtualTokens;
  const newVtokens = pool.virtualTokens + net;
  const solOut = pool.virtualSol - k / newVtokens;
  if (solOut <= 0n) return { error: "amount too small" };
  const price = Number(solOut) / Number(tokenAmount);
  return { fee, net, solOut, newVsol: k / newVtokens, newVtokens, price };
}

/** Build the atomic buy tx: user pays SOL, treasury delivers tokens. Treasury co-signs. */
export async function buildBuyTx(mint: string, solLamports: bigint, userPubkey: string) {
  const { kp, conn } = getPlatformWallet();
  const pool = await getPool(mint);
  if (!pool) throw new Error("pool unavailable (database not configured)");
  const q = quoteBuy(pool, solLamports);
  if ("error" in q) throw new Error(q.error);

  const user = new PublicKey(userPubkey);
  const mintPk = new PublicKey(mint);
  const treasuryAta = await getAssociatedTokenAddress(mintPk, kp.publicKey, false, TOKEN_PROGRAM_ID);
  const userAta = await getAssociatedTokenAddress(mintPk, user, false, TOKEN_PROGRAM_ID);

  const tx = new Transaction();
  tx.add(SystemProgram.transfer({ fromPubkey: user, toPubkey: kp.publicKey, lamports: Number(solLamports) }));
  tx.add(createAssociatedTokenAccountIdempotentInstruction(user, userAta, user, mintPk, TOKEN_PROGRAM_ID));
  tx.add(createTransferInstruction(treasuryAta, userAta, kp.publicKey, q.tokensOut, [], TOKEN_PROGRAM_ID));

  tx.feePayer = user;
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.partialSign(kp);

  return {
    side: "buy" as const,
    transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"),
    expected: {
      solIn: Number(solLamports) / LAMPORTS_PER_SOL,
      tokensOut: Number(q.tokensOut) / Number(TOKEN_UNIT),
      fee: Number(q.fee) / LAMPORTS_PER_SOL,
      priceSolPerToken: q.price,
      newPriceSolPerToken: Number(q.newVsol) / Number(q.newVtokens),
      marketCapSol: (Number(q.newVsol) / Number(q.newVtokens)) * (Number(VIRTUAL_TOKENS_INIT) / Number(TOKEN_UNIT)),
    },
    treasury: kp.publicKey.toBase58(),
    userAta: userAta.toBase58(),
  };
}

/** Build the atomic sell tx: user returns tokens, treasury pays SOL. Treasury co-signs. */
export async function buildSellTx(mint: string, tokenAmount: bigint, userPubkey: string) {
  const { kp, conn } = getPlatformWallet();
  const pool = await getPool(mint);
  if (!pool) throw new Error("pool unavailable (database not configured)");
  const q = quoteSell(pool, tokenAmount);
  if ("error" in q) throw new Error(q.error);

  const user = new PublicKey(userPubkey);
  const mintPk = new PublicKey(mint);
  const treasuryAta = await getAssociatedTokenAddress(mintPk, kp.publicKey, false, TOKEN_PROGRAM_ID);
  const userAta = await getAssociatedTokenAddress(mintPk, user, false, TOKEN_PROGRAM_ID);

  // make sure the treasury can receive the tokens back
  const tx = new Transaction();
  tx.add(createAssociatedTokenAccountIdempotentInstruction(user, treasuryAta, kp.publicKey, mintPk, TOKEN_PROGRAM_ID));
  tx.add(createTransferInstruction(userAta, treasuryAta, user, tokenAmount, [], TOKEN_PROGRAM_ID));
  tx.add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: user, lamports: Number(q.solOut) }));

  tx.feePayer = user;
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.partialSign(kp);

  return {
    side: "sell" as const,
    transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"),
    expected: {
      tokensIn: Number(tokenAmount) / Number(TOKEN_UNIT),
      solOut: Number(q.solOut) / LAMPORTS_PER_SOL,
      fee: Number(q.fee) / Number(TOKEN_UNIT),
      priceSolPerToken: q.price,
      newPriceSolPerToken: Number(q.newVsol) / Number(q.newVtokens),
      marketCapSol: (Number(q.newVsol) / Number(q.newVtokens)) * (Number(VIRTUAL_TOKENS_INIT) / Number(TOKEN_UNIT)),
    },
    treasury: kp.publicKey.toBase58(),
    userAta: userAta.toBase58(),
  };
}

/**
 * Verify the trade really landed on chain, then move the curve.
 * We re-read the transaction and require: success + the exact SOL movement between
 * user and treasury. Only then is the pool updated and the trade recorded.
 */
export async function confirmTrade(args: {
  mint: string; side: "buy" | "sell"; userWallet: string;
  solLamports: bigint; tokenAmount: bigint; signature: string;
}) {
  const { kp, conn } = getPlatformWallet();
  const sql = sqlClient();
  if (!sql) throw new Error("database not configured");
  await ensureDexSchema(sql);

  const tx = await conn.getTransaction(args.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  if (!tx) throw new Error("transaction not found yet — retry once confirmed");
  if (tx.meta?.err) throw new Error(`transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`);

  const treasury = kp.publicKey.toBase58();
  const keys = tx.transaction.message.staticAccountKeys.map((k) => k.toBase58());
  const userIdx = keys.indexOf(args.userWallet);
  const treasIdx = keys.indexOf(treasury);
  if (userIdx < 0 || treasIdx < 0) throw new Error("transaction does not involve this wallet and the treasury");

  const pre = (tx.meta?.preBalances ?? []) as number[];
  const post = (tx.meta?.postBalances ?? []) as number[];
  const userDelta = BigInt((post[userIdx] ?? 0) - (pre[userIdx] ?? 0));
  const treasuryDelta = BigInt((post[treasIdx] ?? 0) - (pre[treasIdx] ?? 0));

  const lamports = args.solLamports;
  // user loses ~lamports on a buy (plus fees) and gains solOut minus fees on a sell
  if (args.side === "buy") {
    if (userDelta >= 0n) throw new Error("buy did not debit the user");
    if (-userDelta < lamports) throw new Error("buy debited less SOL than quoted");
    if (treasuryDelta <= 0n) throw new Error("treasury was not credited");
  } else {
    if (treasuryDelta >= 0n) throw new Error("sell did not debit the treasury");
    if (userDelta <= 0n) throw new Error("sell did not credit the user");
  }

  const pool = await getPool(args.mint);
  if (!pool) throw new Error("pool missing");

  const q = args.side === "buy" ? quoteBuy(pool, lamports) : quoteSell(pool, args.tokenAmount);
  if ("error" in q) throw new Error(q.error);

  const newVsol = q.newVsol, newVtokens = q.newVtokens;
  const newCollected = args.side === "buy" ? pool.solCollected + lamports : (pool.solCollected > lamports ? pool.solCollected - lamports : 0n);

  const already = await sql`SELECT id FROM devnet_trades WHERE signature = ${args.signature}`;
  if (already.length) return { ok: true, duplicate: true, signature: args.signature };

  await sql`
    UPDATE devnet_pools
       SET virtual_sol = ${newVsol.toString()}, virtual_tokens = ${newVtokens.toString()},
           sol_collected = ${newCollected.toString()}
     WHERE mint = ${args.mint}
  `;
  await sql`
    INSERT INTO devnet_trades (mint, side, user_wallet, sol_amount, token_amount, price, fee, signature)
    VALUES (${args.mint}, ${args.side}, ${args.userWallet},
            ${(args.side === "buy" ? Number(lamports) : Number((q as any).solOut)) / LAMPORTS_PER_SOL},
            ${(args.side === "buy" ? Number((q as any).tokensOut) : Number(args.tokenAmount)) / Number(TOKEN_UNIT)},
            ${q.price}, ${Number(q.fee) / LAMPORTS_PER_SOL}, ${args.signature})
  `;

  return { ok: true, signature: args.signature, priceSolPerToken: q.price };
}

export async function recentTrades(mint: string, limit = 30) {
  const sql = sqlClient();
  if (!sql) return [];
  await ensureDexSchema(sql);
  const rows = await sql`
    SELECT side, user_wallet, sol_amount, token_amount, price, signature, created_at
      FROM devnet_trades WHERE mint = ${mint} ORDER BY created_at DESC LIMIT ${limit}
  `;
  return rows as any[];
}

/** A real sparkline series: last price per trade bucket, oldest -> newest. */
export async function priceSeries(mint: string, limit = 60) {
  const rows = await recentTrades(mint, limit);
  return (rows as any[])
    .slice()
    .reverse()
    .map((r) => ({ t: r.created_at, p: Number(r.price), side: r.side }));
}

/**
 * An autonomous agent's own wallet executing a real trade server-side.
 * The treasury co-signs (it is the counterparty of the curve), the agent
 * keypair signs for itself, and the tx is broadcast + confirmed on devnet.
 * Returns the on-chain signature — nothing is recorded unless it landed.
 */
export async function executeAgentTrade(args: {
  mint: string;
  side: "buy" | "sell";
  solLamports?: bigint;
  tokenAmount?: bigint;
  agent: Keypair;
}) {
  const { kp, conn } = getPlatformWallet();
  const pool = await getPool(args.mint);
  if (!pool) throw new Error("market pool unavailable");

  const user = args.agent.publicKey;
  const userPub = user.toBase58();
  const mintPk = new PublicKey(args.mint);
  const treasuryAta = await getAssociatedTokenAddress(mintPk, kp.publicKey, false, TOKEN_PROGRAM_ID);
  const userAta = await getAssociatedTokenAddress(mintPk, user, false, TOKEN_PROGRAM_ID);

  let tx: Transaction;
  let usedLamports = 0n;
  let usedTokens = 0n;

  if (args.side === "buy") {
    const lamports = args.solLamports ?? 0n;
    const q = quoteBuy(pool, lamports);
    if ("error" in q) throw new Error(q.error);
    usedLamports = lamports;
    tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: user, toPubkey: kp.publicKey, lamports: Number(lamports) }),
      createAssociatedTokenAccountIdempotentInstruction(user, userAta, user, mintPk, TOKEN_PROGRAM_ID),
      createTransferInstruction(treasuryAta, userAta, kp.publicKey, q.tokensOut, [], TOKEN_PROGRAM_ID)
    );
  } else {
    const amount = args.tokenAmount ?? 0n;
    const q = quoteSell(pool, amount);
    if ("error" in q) throw new Error(q.error);
    usedTokens = amount;
    tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(user, treasuryAta, kp.publicKey, mintPk, TOKEN_PROGRAM_ID),
      createTransferInstruction(userAta, treasuryAta, user, amount, [], TOKEN_PROGRAM_ID),
      SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: user, lamports: Number(q.solOut) })
    );
  }

  tx.feePayer = kp.publicKey;
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.partialSign(kp);
  tx.partialSign(args.agent);

  const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  const t0 = Date.now();
  while (Date.now() - t0 < 90_000) {
    const st = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true }))?.value?.[0];
    if (st?.err) throw new Error(`agent tx failed: ${JSON.stringify(st.err)}`);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) break;
    await new Promise((r) => setTimeout(r, 1200));
  }

  const confirmed = await confirmTrade({
    mint: args.mint,
    side: args.side,
    userWallet: userPub,
    solLamports: args.side === "buy" ? usedLamports : 0n,
    tokenAmount: args.side === "sell" ? usedTokens : 0n,
    signature: sig,
  });

  return { ...confirmed, signature: sig, wallet: userPub };
}

/** Real balance of an agent/user wallet for one mint. */
export async function tokenBalanceOf(owner: string, mint: string) {
  const { conn } = getPlatformWallet();
  const ata = await getAssociatedTokenAddress(new PublicKey(mint), new PublicKey(owner), false, TOKEN_PROGRAM_ID);
  const info = await conn.getAccountInfo(ata);
  if (!info) return { exists: false, uiAmount: 0, amount: 0n };
  const bal = await conn.getTokenAccountBalance(ata);
  return { exists: true, uiAmount: bal.value.uiAmount ?? 0, amount: BigInt(bal.value.amount) };
}
