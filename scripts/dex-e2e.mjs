// Real end-to-end test of the devnet market: fund a wallet, buy, sell, verify on chain.
import fs from "fs";
import {
  Connection, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL, PublicKey,
} from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const BASE = process.env.BASE || "http://127.0.0.1:3220";
const MINT = process.env.MINT;
const RPC = process.env.RPC;

const conn = new Connection(RPC, "confirmed");
const treasury = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.AUTH_JSON).secretKey ?? JSON.parse(process.env.AUTH_JSON)));
const user = Keypair.generate();

async function confirm(sig, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await conn.getSignatureStatuses([sig], { searchTransactionHistory: true });
    const s = r?.value?.[0];
    if (s?.err) throw new Error("tx err " + JSON.stringify(s.err));
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return;
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error("timeout " + sig);
}

console.log("user  :", user.publicKey.toBase58());
console.log("mint  :", MINT);
console.log("treasury:", treasury.publicKey.toBase58());

// 1) fund the test wallet from the treasury (real tx)
const fund = new Transaction().add(SystemProgram.transfer({
  fromPubkey: treasury.publicKey, toPubkey: user.publicKey, lamports: Math.round(0.5 * LAMPORTS_PER_SOL),
}));
fund.feePayer = treasury.publicKey;
fund.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
fund.sign(treasury);
const fundSig = await conn.sendRawTransaction(fund.serialize(), { maxRetries: 3 });
await confirm(fundSig);
console.log("funded 0.5 SOL · tx", fundSig.slice(0, 20) + "…", "| balance:", (await conn.getBalance(user.publicKey)) / LAMPORTS_PER_SOL);

// 2) BUY 0.05 SOL of the token through our API
let r = await fetch(`${BASE}/api/dex/buy`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mint: MINT, solAmount: 0.05, userPublicKey: user.publicKey.toBase58() }),
});
let j = await r.json();
if (!j.ok) throw new Error("buy build failed: " + JSON.stringify(j.error));
console.log("\nBUY quote: in", j.expected.solIn, "SOL -> out", j.expected.tokensOut.toLocaleString(), "tokens | price", j.expected.priceSolPerToken.toExponential(4), "SOL/token | fee", j.expected.fee);

const buyTx = Transaction.from(Buffer.from(j.transaction, "base64"));
buyTx.partialSign(user);
const buySig = await conn.sendRawTransaction(buyTx.serialize(), { maxRetries: 3 });
await confirm(buySig);
console.log("BUY landed on devnet:", buySig);

r = await fetch(`${BASE}/api/dex/confirm`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mint: MINT, side: "buy", userWallet: user.publicKey.toBase58(), solAmount: 0.05, signature: buySig }),
});
console.log("confirm ->", JSON.stringify(await r.json()).slice(0, 200));

// 3) check the user really holds tokens
const ata = await getAssociatedTokenAddress(new PublicKey(MINT), user.publicKey, false, TOKEN_PROGRAM_ID);
const bal = await conn.getTokenAccountBalance(ata);
console.log("user token balance:", bal.value.uiAmountString);

// 4) SELL half back
const half = Number(bal.value.amount) / 2;
r = await fetch(`${BASE}/api/dex/sell`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mint: MINT, tokenAmount: Number(bal.value.uiAmount) / 2, userPublicKey: user.publicKey.toBase58() }),
});
j = await r.json();
if (!j.ok) throw new Error("sell build failed: " + JSON.stringify(j.error));
console.log("\nSELL quote: in", j.expected.tokensIn.toLocaleString(), "tokens -> out", j.expected.solOut, "SOL");
const sellTx = Transaction.from(Buffer.from(j.transaction, "base64"));
sellTx.partialSign(user);
const sellSig = await conn.sendRawTransaction(sellTx.serialize(), { maxRetries: 3 });
await confirm(sellSig);
console.log("SELL landed on devnet:", sellSig);

r = await fetch(`${BASE}/api/dex/confirm`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mint: MINT, side: "sell", userWallet: user.publicKey.toBase58(), tokenAmount: Number(bal.value.uiAmount) / 2, signature: sellSig }),
});
console.log("confirm ->", JSON.stringify(await r.json()).slice(0, 200));

const bal2 = await conn.getTokenAccountBalance(ata);
console.log("user tokens after sell:", bal2.value.uiAmountString);
console.log("user SOL after sell  :", (await conn.getBalance(user.publicKey)) / LAMPORTS_PER_SOL);

// 5) market state from the API
r = await fetch(`${BASE}/api/dex?mint=${MINT}`);
j = await r.json();
console.log("\nMARKET:", JSON.stringify({ price: j.priceSolPerToken, mcapSol: j.marketCapSol, curve: j.curveProgressPct, buys: j.buys, sells: j.sells, trades: j.trades?.length }));

fs.writeFileSync("/tmp/dex-test-result.json", JSON.stringify({ mint: MINT, buySig, sellSig, user: user.publicKey.toBase58(), fundSig }, null, 2));
console.log("\nDEX E2E: PASS");
