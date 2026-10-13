// Give our own devnet tokens REAL market activity.
//
// For each live mint this creates a fresh devnet wallet, funds it from the
// treasury, then runs real buys and sells through the SAME order → sign →
// settle path the website uses. Every fill is a confirmed on-chain
// transaction, so /coins shows genuine volume, buy/sell counts and curve
// movement instead of an empty market.
//
//   node scripts/seed-market.mjs --mint <mint>          one token
//   node scripts/seed-market.mjs --all --trades 4       every live mint
//   node scripts/seed-market.mjs --all --dry            list what it would do

import fs from "fs";
import path from "path";
import {
  Connection, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const BASE = val("--base", "https://catclawpad.vercel.app");
const MINT = val("--mint", "");
const ALL = has("--all");
const TRADES = Number(val("--trades", "4"));
const DRY = has("--dry");
const SOL_PER_TRADE = Number(val("--sol", "0.02"));

// keys come from the box, never from chat
const ROOT = process.cwd();
const env = {};
for (const f of [".env.prod", ".env.local"]) {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, f), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* ignore */ }
}
const RPC = env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const AUTH = env.AUTHORITY_SECRET_JSON;
if (!AUTH) { console.error("no AUTHORITY_SECRET_JSON on this box"); process.exit(1); }

const conn = new Connection(RPC, "confirmed");
const parsed = AUTH.trim().startsWith("[") ? JSON.parse(AUTH) : JSON.parse(AUTH).secretKey;
const treasury = Keypair.fromSecretKey(Uint8Array.from(parsed));

async function confirm(sig, ms = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true }))?.value?.[0];
    if (s?.err) throw new Error("tx failed " + JSON.stringify(s.err));
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return sig;
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error("confirmation timeout " + sig);
}

async function fund(wallet, sol) {
  const tx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: treasury.publicKey, toPubkey: wallet, lamports: Math.round(sol * LAMPORTS_PER_SOL),
  }));
  tx.feePayer = treasury.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(treasury);
  const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  await confirm(sig);
  return sig;
}

/** One real trade through the live order/settle path. */
async function trade(mint, side, amount, kp, label) {
  const body = side === "buy"
    ? { mint, solAmount: amount, userPublicKey: kp.publicKey.toBase58() }
    : { mint, tokenAmount: amount, userPublicKey: kp.publicKey.toBase58() };

  const built = await fetch(`${BASE}/api/dex/${side}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).then((r) => r.json());
  if (!built.ok) throw new Error(`${side} build: ${built.error}`);

  const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
  tx.partialSign(kp);
  const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  await confirm(sig);

  let settled = null;
  for (let i = 0; i < 8; i++) {
    settled = await fetch(`${BASE}/api/dex/settle`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: built.orderId, signature: sig }),
    }).then((r) => r.json()).catch(() => null);
    if (settled?.ok) break;
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (!settled?.ok) throw new Error(`settle: ${settled?.reason ?? "unknown"}`);
  console.log(`    ${label} ${side} ok · ${sig.slice(0, 14)}… · settle ${String(settled.settleSignature).slice(0, 12)}…`);
  return settled;
}

async function holdings(kp, mint) {
  const r = await fetch(`${BASE}/api/dex/balance?mint=${mint}&owner=${kp.publicKey.toBase58()}`, { cache: "no-store" });
  const j = await r.json();
  return Number(j?.uiAmount ?? 0);
}

async function seedMint(mint, name) {
  console.log(`  ${name ?? ""} ${mint}`);
  const kp = Keypair.generate();
  const fundSig = await fund(kp.publicKey, 0.15);
  console.log(`    funded 0.15 SOL · ${fundSig.slice(0, 14)}…`);

  let done = 0;
  for (let i = 0; i < TRADES; i++) {
    try {
      await trade(mint, "buy", SOL_PER_TRADE, kp, `[${i + 1}]`);
      done++;
      const held = await holdings(kp, mint);
      if (held > 0) {
        await trade(mint, "sell", held * 0.35, kp, `[${i + 1}]`);
        done++;
      }
    } catch (e) {
      console.log(`    trade ${i + 1} failed: ${String(e.message).slice(0, 120)}`);
    }
  }
  // send what's left back to the treasury so seeding stays cheap
  try {
    const bal = await conn.getBalance(kp.publicKey);
    if (bal > 20_000_000) {
      const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: kp.publicKey, toPubkey: treasury.publicKey, lamports: bal - 5_000_000,
      }));
      tx.feePayer = kp.publicKey;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      tx.sign(kp);
      await confirm(await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 }));
    }
  } catch { /* not important */ }
  console.log(`    ${done} real fill(s)`);
}

(async () => {
  let mints = [];
  if (MINT) {
    mints = [{ mint: MINT, name: "" }];
  } else if (ALL) {
    const j = await fetch(`${BASE}/api/coins`, { cache: "no-store" }).then((r) => r.json());
    mints = (j.coins ?? []).filter((c) => c.mint).map((c) => ({ mint: c.mint, name: `${c.name} (${c.ticker})` }));
  } else {
    console.log("pass --mint <mint> or --all");
    process.exit(0);
  }

  console.log(`market seeding · ${BASE} · ${mints.length} token(s) · ${TRADES} round(s) each · ${SOL_PER_TRADE} SOL per buy`);
  if (DRY) {
    mints.forEach((m) => console.log("  would seed", m.name, m.mint));
    process.exit(0);
  }

  let ok = 0;
  for (const m of mints) {
    try { await seedMint(m.mint, m.name); ok++; }
    catch (e) { console.log(`  ${m.mint} failed: ${String(e.message).slice(0, 140)}`); }
  }
  console.log(`\nseeded ${ok}/${mints.length} token(s)`);
})();
