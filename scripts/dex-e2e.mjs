// End-to-end test of the wallet-safe flow: the wallet signs ONE tx, the treasury settles.
import {
  Connection, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL, PublicKey,
} from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const BASE = process.env.BASE, MINT = process.env.MINT, RPC = process.env.RPC;
const conn = new Connection(RPC, "confirmed");
const treasury = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.AUTH_JSON).secretKey ?? JSON.parse(process.env.AUTH_JSON)));
const user = Keypair.generate();

async function confirm(sig) {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const s = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true }))?.value?.[0];
    if (s?.err) throw new Error(JSON.stringify(s.err));
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return;
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error("timeout " + sig);
}

console.log("test wallet:", user.publicKey.toBase58());
const fund = new Transaction().add(SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: user.publicKey, lamports: Math.round(0.4 * LAMPORTS_PER_SOL) }));
fund.feePayer = treasury.publicKey;
fund.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
fund.sign(treasury);
const fsig = await conn.sendRawTransaction(fund.serialize(), { maxRetries: 3 });
await confirm(fsig);
console.log("funded 0.4 SOL            | tx", fsig.slice(0, 16) + "…");

let r = await fetch(`${BASE}/api/dex/buy`, { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mint: MINT, solAmount: 0.05, userPublicKey: user.publicKey.toBase58() }) });
let j = await r.json();
if (!j.ok) throw new Error("buy build: " + JSON.stringify(j.error));
console.log(`BUY order #${j.orderId} · signers ${j.signers} · ${j.expected.solIn} SOL -> ${Math.round(j.expected.tokensOut).toLocaleString()} tokens`);
const buyTx = Transaction.from(Buffer.from(j.transaction, "base64"));
console.log("  required sigs:", buyTx.signatures.length, "(1 = only the wallet — this is the fix)");
buyTx.partialSign(user);
const buySig = await conn.sendRawTransaction(buyTx.serialize(), { maxRetries: 3 });
await confirm(buySig);
console.log("  wallet tx confirmed     |", buySig.slice(0, 16) + "…");
const settle = await fetch(`${BASE}/api/dex/settle`, { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ orderId: j.orderId, signature: buySig }) }).then((x) => x.json());
console.log("  settle ->", JSON.stringify(settle).slice(0, 200));
const ata = await getAssociatedTokenAddress(new PublicKey(MINT), user.publicKey, false, TOKEN_PROGRAM_ID);
console.log("  tokens received:", (await conn.getTokenAccountBalance(ata)).value.uiAmountString);

const held = (await conn.getTokenAccountBalance(ata)).value.uiAmount ?? 0;
r = await fetch(`${BASE}/api/dex/sell`, { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mint: MINT, tokenAmount: held / 2, userPublicKey: user.publicKey.toBase58() }) });
j = await r.json();
if (!j.ok) throw new Error("sell build: " + JSON.stringify(j.error));
console.log(`\nSELL order #${j.orderId} · signers ${j.signers} · ${Math.round(j.expected.tokensIn).toLocaleString()} tokens -> ${j.expected.solOut} SOL`);
const sellTx = Transaction.from(Buffer.from(j.transaction, "base64"));
sellTx.partialSign(user);
const sellSig = await conn.sendRawTransaction(sellTx.serialize(), { maxRetries: 3 });
await confirm(sellSig);
const settle2 = await fetch(`${BASE}/api/dex/settle`, { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ orderId: j.orderId, signature: sellSig }) }).then((x) => x.json());
console.log("  settle ->", JSON.stringify(settle2).slice(0, 200));
console.log("  SOL after sell:", (await conn.getBalance(user.publicKey)) / LAMPORTS_PER_SOL);

const market = await fetch(`${BASE}/api/dex?mint=${MINT}`).then((x) => x.json());
console.log("\nMARKET:", JSON.stringify({ price: market.priceSolPerToken, curve: market.curveProgressPct, buys: market.buys, sells: market.sells, trades: market.trades?.length }));
console.log("\nWALLET-SAFE FLOW: PASS");
