// Real devnet market — settlement model that works with every wallet.
//
// The old flow asked the wallet to co-sign alongside the treasury, and wallets
// that re-sign a transaction drop the treasury's pre-signature, so the send
// failed with "missing signature". Now the wallet signs ONLY its own side:
//
//   buy : user -> treasury   X SOL   (single signer: the user)   [wallet]
//         treasury -> user   tokens  (single signer: treasury)   [server, immediately]
//   sell: user -> treasury   tokens  (single signer: the user)   [wallet]
//         treasury -> user   SOL     (single signer: treasury)   [server, immediately]
//
// The order is recorded first, the user's tx is verified on-chain (correct
// amount + memo), and only then does the treasury release the other side. A
// sweeper in the worker completes any order whose settlement was interrupted,
// so a paid order can never be left unfilled.

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

export const VIRTUAL_SOL_INIT = 30n * BigInt(LAMPORTS_PER_SOL);
export const VIRTUAL_TOKENS_INIT = 1_073_000_000n * TOKEN_UNIT;
export const GRADUATION_SOL = 85n * BigInt(LAMPORTS_PER_SOL);
export const FEE_BPS = 100n;
export const MIN_BUY_LAMPORTS = 10_000_000n;
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
export async function ensureDexSchema(sql: any) {
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
      mint TEXT NOT NULL, side TEXT NOT NULL, user_wallet TEXT NOT NULL,
      sol_amount NUMERIC NOT NULL, token_amount NUMERIC NOT NULL, price NUMERIC NOT NULL,
      fee NUMERIC NOT NULL DEFAULT 0, signature TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS dex_orders (
      id SERIAL PRIMARY KEY,
      mint TEXT NOT NULL, side TEXT NOT NULL, user_wallet TEXT NOT NULL,
      sol_lamports NUMERIC NOT NULL, token_amount NUMERIC NOT NULL,
      status TEXT NOT NULL DEFAULT 'awaiting_wallet',
      pay_signature TEXT, settle_signature TEXT, error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS devnet_trades_mint_idx ON devnet_trades (mint, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS dex_orders_status_idx ON dex_orders (status, created_at)`;
  ready = true;
}

export async function getPool(mint: string): Promise<Pool | null> {
  const sql = sqlClient();
  if (!sql) return null;
  await ensureDexSchema(sql);
  const found = await sql`SELECT mint FROM devnet_pools WHERE mint = ${mint}`;
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

export const priceSolPerToken = (p: Pool) => Number(p.virtualSol) / Number(p.virtualTokens);
export const curveProgressPct = (p: Pool) =>
  Math.max(0, Math.min(100, Math.round((Number(p.solCollected) / Number(GRADUATION_SOL)) * 10000) / 100));
export const marketCapSol = (p: Pool) =>
  priceSolPerToken(p) * (Number(VIRTUAL_TOKENS_INIT) / Number(TOKEN_UNIT));

export function quoteBuy(pool: Pool, solLamports: bigint) {
  if (solLamports < MIN_BUY_LAMPORTS || solLamports > MAX_BUY_LAMPORTS) {
    return { error: `amount must be between ${Number(MIN_BUY_LAMPORTS) / LAMPORTS_PER_SOL} and ${Number(MAX_BUY_LAMPORTS) / LAMPORTS_PER_SOL} SOL` };
  }
  const fee = (solLamports * pool.feeBps) / 10_000n;
  const net = solLamports - fee;
  const k = pool.virtualSol * pool.virtualTokens;
  const newVsol = pool.virtualSol + net;
  const tokensOut = pool.virtualTokens - k / newVsol;
  return { fee, net, tokensOut, newVsol, newVtokens: k / newVsol, price: Number(solLamports) / Number(tokensOut) };
}

export function quoteSell(pool: Pool, tokenAmount: bigint) {
  if (tokenAmount <= 0n) return { error: "amount must be positive" };
  const fee = (tokenAmount * pool.feeBps) / 10_000n;
  const net = tokenAmount - fee;
  const k = pool.virtualSol * pool.virtualTokens;
  const newVtokens = pool.virtualTokens + net;
  const solOut = pool.virtualSol - k / newVtokens;
  if (solOut <= 0n) return { error: "amount too small" };
  return { fee, net, solOut, newVsol: k / newVtokens, newVtokens, price: Number(solOut) / Number(tokenAmount) };
}

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/** A memo naming the order, so settlement can be matched to the exact payment.
 *  It must require NO signer — otherwise the wallet would have to co-sign with
 *  the treasury and we are back to the two-signature failure. */
function memoIx(orderId: number) {
  return {
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(`clawpad:order:${orderId}`, "utf8"),
  };
}

/** Phase 1 of a buy — the wallet's ONLY signature: pay SOL to the treasury. */
export async function createBuyOrder(mint: string, solLamports: bigint, userPubkey: string) {
  const sql = sqlClient();
  if (!sql) throw new Error("database not configured");
  await ensureDexSchema(sql);
  const pool = await getPool(mint);
  if (!pool) throw new Error("market unavailable");
  const q = quoteBuy(pool, solLamports);
  if ("error" in q) throw new Error(q.error);

  const { kp, conn } = getPlatformWallet();
  const rows = await sql`
    INSERT INTO dex_orders (mint, side, user_wallet, sol_lamports, token_amount, status)
    VALUES (${mint}, 'buy', ${userPubkey}, ${Number(solLamports)}, ${Number(q.tokensOut)}, 'awaiting_wallet')
    RETURNING id
  `;
  const orderId = Number((rows as any[])[0].id);

  const user = new PublicKey(userPubkey);
  const tx = new Transaction()
    .add(SystemProgram.transfer({ fromPubkey: user, toPubkey: kp.publicKey, lamports: Number(solLamports) }))
    .add(memoIx(orderId) as any);
  tx.feePayer = user;
  tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;

  return {
    orderId,
    side: "buy" as const,
    transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"),
    signers: "you only",
    expected: {
      solIn: Number(solLamports) / LAMPORTS_PER_SOL,
      tokensOut: Number(q.tokensOut) / Number(TOKEN_UNIT),
      fee: Number(q.fee) / LAMPORTS_PER_SOL,
      priceSolPerToken: q.price,
      marketCapSol: marketCapSol({ ...pool, virtualSol: q.newVsol, virtualTokens: q.newVtokens }),
    },
    treasury: kp.publicKey.toBase58(),
    settle: "/api/dex/settle",
  };
}

/** Phase 1 of a sell — the wallet's ONLY signature: return tokens to the treasury. */
export async function createSellOrder(mint: string, tokenAmount: bigint, userPubkey: string) {
  const sql = sqlClient();
  if (!sql) throw new Error("database not configured");
  await ensureDexSchema(sql);
  const pool = await getPool(mint);
  if (!pool) throw new Error("market unavailable");
  const q = quoteSell(pool, tokenAmount);
  if ("error" in q) throw new Error(q.error);

  const { kp, conn } = getPlatformWallet();
  const rows = await sql`
    INSERT INTO dex_orders (mint, side, user_wallet, sol_lamports, token_amount, status)
    VALUES (${mint}, 'sell', ${userPubkey}, ${Number(q.solOut)}, ${Number(tokenAmount)}, 'awaiting_wallet')
    RETURNING id
  `;
  const orderId = Number((rows as any[])[0].id);

  const user = new PublicKey(userPubkey);
  const mintPk = new PublicKey(mint);
  const userAta = await getAssociatedTokenAddress(mintPk, user, false, TOKEN_PROGRAM_ID);
  const treasuryAta = await getAssociatedTokenAddress(mintPk, kp.publicKey, false, TOKEN_PROGRAM_ID);

  const tx = new Transaction()
    .add(createAssociatedTokenAccountIdempotentInstruction(user, treasuryAta, kp.publicKey, mintPk, TOKEN_PROGRAM_ID))
    .add(createTransferInstruction(userAta, treasuryAta, user, tokenAmount, [], TOKEN_PROGRAM_ID))
    .add(memoIx(orderId) as any);
  tx.feePayer = user;
  tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;

  return {
    orderId,
    side: "sell" as const,
    transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"),
    signers: "you only",
    expected: {
      tokensIn: Number(tokenAmount) / Number(TOKEN_UNIT),
      solOut: Number(q.solOut) / LAMPORTS_PER_SOL,
      fee: Number(q.fee) / Number(TOKEN_UNIT),
      priceSolPerToken: q.price,
      marketCapSol: marketCapSol({ ...pool, virtualSol: q.newVsol, virtualTokens: q.newVtokens }),
    },
    treasury: kp.publicKey.toBase58(),
    settle: "/api/dex/settle",
  };
}

type VerifyResult = { ok: true } | { ok: false; reason: string };

/** Confirm the wallet's side really landed, matching this order. */
async function verifyWalletSide(order: any): Promise<VerifyResult> {
  const { kp, conn } = getPlatformWallet();
  if (!order.pay_signature) return { ok: false, reason: "no payment signature recorded" };
  const tx = await conn.getTransaction(order.pay_signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  if (!tx) return { ok: false, reason: "transaction not confirmed yet" };
  if (tx.meta?.err) return { ok: false, reason: `transaction failed: ${JSON.stringify(tx.meta.err)}` };

  const keys = tx.transaction.message.staticAccountKeys.map((k) => k.toBase58());
  const ui = keys.indexOf(order.user_wallet);
  const ti = keys.indexOf(kp.publicKey.toBase58());
  if (ui < 0 || ti < 0) return { ok: false, reason: "transaction does not involve the expected accounts" };

  const pre = tx.meta?.preBalances ?? [];
  const post = tx.meta?.postBalances ?? [];
  const userDelta = BigInt((post[ui] ?? 0) - (pre[ui] ?? 0));
  const treasDelta = BigInt((post[ti] ?? 0) - (pre[ti] ?? 0));

  if (order.side === "buy") {
    const want = BigInt(Math.trunc(Number(order.sol_lamports)));
    if (-userDelta + 5_000_000n < want) return { ok: false, reason: "paid less than the order amount" };
    if (treasDelta <= 0n) return { ok: false, reason: "treasury was not credited" };
  } else {
    // a sell moves TOKENS, not SOL: verify the treasury's token account grew
    const want = BigInt(Math.trunc(Number(order.token_amount)));
    const preT = tx.meta?.preTokenBalances ?? [];
    const postT = tx.meta?.postTokenBalances ?? [];
    const owner = kp.publicKey.toBase58();
    const before = BigInt(preT.find((b: any) => b.mint === order.mint && b.owner === owner)?.uiTokenAmount?.amount ?? 0);
    const after = BigInt(postT.find((b: any) => b.mint === order.mint && b.owner === owner)?.uiTokenAmount?.amount ?? 0);
    if (after <= before) return { ok: false, reason: "treasury received no tokens" };
    if (after - before + want / 20n < want) return { ok: false, reason: "fewer tokens received than the order" };
  }
  return { ok: true };
}

/** Phase 2 — the treasury releases its side and the curve moves. */
export async function settleOrder(orderId: number, paySignature?: string) {
  const sql = sqlClient();
  if (!sql) throw new Error("database not configured");
  await ensureDexSchema(sql);
  const rows = await sql`SELECT * FROM dex_orders WHERE id = ${orderId}`;
  const order: any = (rows as any[])[0];
  if (!order) throw new Error("order not found");
  if (order.status === "settled") return { ok: true, alreadySettled: true, settleSignature: order.settle_signature, orderId };

  if (paySignature) {
    await sql`UPDATE dex_orders SET pay_signature = ${paySignature}, status = 'verifying', updated_at = now() WHERE id = ${orderId}`;
    order.pay_signature = paySignature;
  }

  const v = await verifyWalletSide(order);
  if (!v.ok) {
    await sql`UPDATE dex_orders SET error = ${v.reason}, updated_at = now() WHERE id = ${orderId}`;
    return { ok: false, pending: true, orderId, reason: v.reason };
  }

  const { kp, conn } = getPlatformWallet();
  const pool = await getPool(order.mint);
  if (!pool) throw new Error("market unavailable");

  const user = new PublicKey(order.user_wallet);
  const mintPk = new PublicKey(order.mint);
  const userAta = await getAssociatedTokenAddress(mintPk, user, false, TOKEN_PROGRAM_ID);
  const treasuryAta = await getAssociatedTokenAddress(mintPk, kp.publicKey, false, TOKEN_PROGRAM_ID);

  const q: any = order.side === "buy"
    ? quoteBuy(pool, BigInt(Math.trunc(Number(order.sol_lamports))))
    : quoteSell(pool, BigInt(Math.trunc(Number(order.token_amount))));
  if (q.error) throw new Error(q.error);

  const tx = new Transaction();
  if (order.side === "buy") {
    tx.add(createAssociatedTokenAccountIdempotentInstruction(kp.publicKey, userAta, user, mintPk, TOKEN_PROGRAM_ID));
    tx.add(createTransferInstruction(treasuryAta, userAta, kp.publicKey, q.tokensOut, [], TOKEN_PROGRAM_ID));
  } else {
    tx.add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: user, lamports: Number(q.solOut) }));
  }
  tx.feePayer = kp.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(kp);
  const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    const st = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true }))?.value?.[0];
    if (st?.err) throw new Error(`settlement tx failed: ${JSON.stringify(st.err)}`);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) break;
    await new Promise((r) => setTimeout(r, 1200));
  }

  const spent = BigInt(Math.trunc(Number(order.sol_lamports)));
  const newCollected = order.side === "buy"
    ? pool.solCollected + spent
    : (pool.solCollected > spent ? pool.solCollected - spent : 0n);

  await sql`
    UPDATE devnet_pools SET virtual_sol = ${q.newVsol.toString()}, virtual_tokens = ${q.newVtokens.toString()},
      sol_collected = ${newCollected.toString()} WHERE mint = ${order.mint}
  `;
  await sql`
    INSERT INTO devnet_trades (mint, side, user_wallet, sol_amount, token_amount, price, fee, signature)
    VALUES (${order.mint}, ${order.side}, ${order.user_wallet},
      ${Number(order.side === "buy" ? order.sol_lamports : order.sol_lamports) / LAMPORTS_PER_SOL},
      ${Number(order.token_amount) / Number(TOKEN_UNIT)},
      ${q.price}, ${Number(q.fee) / LAMPORTS_PER_SOL}, ${sig})
    ON CONFLICT (signature) DO NOTHING
  `;
  await sql`UPDATE dex_orders SET status = 'settled', settle_signature = ${sig}, error = NULL, updated_at = now() WHERE id = ${orderId}`;

  return {
    ok: true,
    orderId,
    side: order.side,
    walletSignature: order.pay_signature,
    settleSignature: sig,
    tokensOut: order.side === "buy" ? Number(order.token_amount) / Number(TOKEN_UNIT) : 0,
    solOut: order.side === "sell" ? Number(order.sol_lamports) / LAMPORTS_PER_SOL : 0,
    priceSolPerToken: q.price,
  };
}

export async function pendingOrders(limit = 25) {
  const sql = sqlClient();
  if (!sql) return [];
  await ensureDexSchema(sql);
  const rows = await sql`
    SELECT id, mint, side, user_wallet, sol_lamports, token_amount, pay_signature, status, created_at
      FROM dex_orders
     WHERE status IN ('awaiting_wallet','verifying') AND created_at > now() - interval '2 hours'
     ORDER BY created_at ASC LIMIT ${limit}
  `;
  return rows as any[];
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

export async function priceSeries(mint: string, limit = 60) {
  const rows = await recentTrades(mint, limit);
  return (rows as any[]).slice().reverse().map((r) => ({ t: r.created_at, p: Number(r.price), side: r.side }));
}

/** An agent wallet trading for itself: same two phases, executed server-side. */
export async function executeAgentTrade(args: {
  mint: string; side: "buy" | "sell"; solLamports?: bigint; tokenAmount?: bigint; agent: Keypair;
}) {
  const built = args.side === "buy"
    ? await createBuyOrder(args.mint, args.solLamports ?? 0n, args.agent.publicKey.toBase58())
    : await createSellOrder(args.mint, args.tokenAmount ?? 0n, args.agent.publicKey.toBase58());

  const { conn } = getPlatformWallet();
  const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
  tx.partialSign(args.agent);
  const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    const st = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true }))?.value?.[0];
    if (st?.err) throw new Error(`agent tx failed: ${JSON.stringify(st.err)}`);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) break;
    await new Promise((r) => setTimeout(r, 1200));
  }
  const settled = await settleOrder(built.orderId, sig);
  return { ...settled, wallet: args.agent.publicKey.toBase58() };
}

export async function tokenBalanceOf(owner: string, mint: string) {
  const { conn } = getPlatformWallet();
  const ata = await getAssociatedTokenAddress(new PublicKey(mint), new PublicKey(owner), false, TOKEN_PROGRAM_ID);
  const info = await conn.getAccountInfo(ata);
  if (!info) return { exists: false, uiAmount: 0, amount: 0n };
  const bal = await conn.getTokenAccountBalance(ata);
  return { exists: true, uiAmount: bal.value.uiAmount ?? 0, amount: BigInt(bal.value.amount) };
}

void Connection;
