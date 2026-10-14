// Autonomous trading agents on our devnet market.
//
// Every agent gets its own real Solana keypair derived from the treasury secret
// (no secret is stored per agent), funded from the treasury with a real transfer.
// A "run" cycle asks the brain for one decision, then executes it on chain:
//   launch -> real SPL mint, then a real curve buy
//   buy    -> real curve buy from the agent's wallet
//   sell   -> real curve sell back to the treasury
//   hold   -> recorded, no transaction
// Nothing is written to the ledger unless the transaction confirmed.

import { Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createHash } from "crypto";
import { neon } from "@neondatabase/serverless";
import { getPlatformWallet, realDevnetLaunch } from "./launch-real";
import { assertSpendableCluster } from "./cluster";
import { createPost } from "./community";
import { executeAgentTrade, tokenBalanceOf, getPool, priceSolPerToken, curveProgressPct, TOKEN_UNIT } from "./dex";
import { listCoins } from "./db";

export type AgentRow = {
  id: number;
  name: string;
  strategy: string;
  personality: string | null;
  pubkey: string;
  status: string;
  budget_sol: number;
  api_key: string | null;
  created_at: string;
};

export function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

let ready = false;
async function ensureAgentSchema(sql: any) {
  if (ready) return;
  await sql`
    CREATE TABLE IF NOT EXISTS agents (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      strategy TEXT NOT NULL DEFAULT 'launch-and-trade',
      personality TEXT,
      pubkey TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      budget_sol NUMERIC NOT NULL DEFAULT 0,
      api_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS agent_activity (
      id BIGSERIAL PRIMARY KEY,
      agent_id INT NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      signature TEXT,
      mint TEXT,
      fuel_sol NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS agent_activity_idx ON agent_activity (agent_id, created_at DESC)`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS token TEXT`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS claim_code TEXT`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS verify_code TEXT`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS twitter_handle TEXT`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_wallet TEXT`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS wallet_mode TEXT DEFAULT 'platform'`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS skill_md TEXT`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'api'`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS model_url TEXT`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_job INT`;
  ready = true;
}

/** Deterministic devnet wallet per agent — derived, never stored. */
export function agentKeypair(agentId: number, name: string): Keypair {
  const { kp } = getPlatformWallet();
  const seed = createHash("sha256")
    .update(`clawpad-agent:v1:${agentId}:${name}`)
    .update(Buffer.from(kp.secretKey))
    .digest();
  return Keypair.fromSeed(Uint8Array.from(seed));
}

/** Attach a real GLB (built by the 3D worker from the agent's persona). */
export async function setAgentModel(id: number, modelUrl: string): Promise<boolean> {
  const sql = sqlClient();
  if (!sql) return false;
  await ensureAgentSchema(sql);
  await sql`UPDATE agents SET model_url = ${modelUrl} WHERE id = ${id}`;
  return true;
}

export async function setAgentAvatarJob(id: number, job: number): Promise<boolean> {
  const sql = sqlClient();
  if (!sql) return false;
  await ensureAgentSchema(sql);
  await sql`UPDATE agents SET avatar_job = ${job} WHERE id = ${id}`;
  return true;
}

export async function listAgents(): Promise<AgentRow[]> {
  const sql = sqlClient();
  if (!sql) return [];
  await ensureAgentSchema(sql);
  const rows = await sql`SELECT id, name, strategy, personality, pubkey, status, budget_sol, api_key, model_url, avatar_job, owner_wallet, wallet_mode, verified, twitter_handle, created_at FROM agents ORDER BY created_at DESC`;
  return rows as unknown as AgentRow[];
}

export async function getAgent(id: number): Promise<{ agent: AgentRow; activity: any[] } | null> {
  const sql = sqlClient();
  if (!sql) return null;
  await ensureAgentSchema(sql);
  const rows = await sql`SELECT id, name, strategy, personality, pubkey, status, budget_sol, api_key, model_url, avatar_job, owner_wallet, wallet_mode, verified, twitter_handle, created_at FROM agents WHERE id = ${id}`;
  const agent = (rows as unknown as AgentRow[])[0];
  if (!agent) return null;
  const activity = await sql`SELECT id, kind, summary, signature, mint, fuel_sol, created_at FROM agent_activity WHERE agent_id = ${id} ORDER BY created_at DESC LIMIT 50`;
  return { agent, activity: activity as any[] };
}

/** Create an agent: derive its wallet and fund it from the treasury (real tx). */
export async function createAgent(input: { name: string; strategy?: string; personality?: string; fundSol?: number; apiKey?: string; ownerWallet?: string }) {
  assertSpendableCluster("create agent");
  const sql = sqlClient();
  if (!sql) throw new Error("database not configured");
  await ensureAgentSchema(sql);
  const { kp, conn } = getPlatformWallet();
  const name = String(input.name || "").trim().slice(0, 40) || `agent-${Date.now()}`;

  const owner = input.ownerWallet ? String(input.ownerWallet) : null;
  const inserted = await sql`
    INSERT INTO agents (name, strategy, personality, pubkey, budget_sol, api_key, owner_wallet, wallet_mode)
    VALUES (${name}, ${input.strategy ?? "launch-and-trade"}, ${input.personality ?? null}, 'pending', 0, ${input.apiKey ?? null},
            ${owner}, ${owner ? "external" : "platform"})
    RETURNING id
  `;
  const id = Number((inserted as any[])[0].id);
  const agent = agentKeypair(id, name);
  const pubkey = agent.publicKey.toBase58();

  const fund = Math.max(0.05, Math.min(2, Number(input.fundSol ?? 0.25)));
  let fundSig: string | null = null;
  try {
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: agent.publicKey, lamports: Math.round(fund * LAMPORTS_PER_SOL) })
    );
    tx.feePayer = kp.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;
    tx.sign(kp);
    fundSig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      const st = (await conn.getSignatureStatuses([fundSig], { searchTransactionHistory: true }))?.value?.[0];
      if (st?.err) throw new Error(JSON.stringify(st.err));
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) break;
      await new Promise((r) => setTimeout(r, 1200));
    }
  } catch (e: any) {
    await sql`UPDATE agents SET pubkey = ${pubkey}, status = 'unfunded' WHERE id = ${id}`;
    throw new Error(`agent created but funding failed: ${String(e?.message ?? e)}`);
  }

  await sql`UPDATE agents SET pubkey = ${pubkey}, budget_sol = ${fund} WHERE id = ${id}`;
  await sql`
    INSERT INTO agent_activity (agent_id, kind, summary, signature, fuel_sol)
    VALUES (${id}, 'fund', ${`funded with ${fund} devnet SOL`}, ${fundSig}, ${fund})
  `;
  return { id, name, pubkey, budgetSol: fund, fundSig };
}

/**
 * A registered agent asks for more runway: the treasury funds its wallet with a real devnet tx.
 * Capped so one call can't drain the treasury.
 */
export async function fundAgent(id: number, requestedSol: number) {
  assertSpendableCluster("fund agent");
  const sql = sqlClient();
  if (!sql) throw new Error("database not configured");
  await ensureAgentSchema(sql);
  const found = await getAgent(id);
  if (!found) throw new Error("agent not found");
  const a: any = found.agent;
  const amount = Math.max(0.01, Math.min(0.5, Number(requestedSol) || 0.1));

  const { kp, conn } = getPlatformWallet();
  const dest = agentKeypair(a.id, a.name);
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: dest.publicKey, lamports: Math.round(amount * LAMPORTS_PER_SOL) })
  );
  tx.feePayer = kp.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(kp);
  const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  const t0 = Date.now();
  let confirmed = false;
  while (Date.now() - t0 < 60_000) {
    const st = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true }))?.value?.[0];
    if (st?.err) throw new Error(JSON.stringify(st.err));
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) { confirmed = true; break; }
    await new Promise((r) => setTimeout(r, 1200));
  }
  if (!confirmed) throw new Error("funding tx not confirmed in 60s");

  const balance = (await conn.getBalance(dest.publicKey)) / LAMPORTS_PER_SOL;
  await sql`UPDATE agents SET budget_sol = ${balance} WHERE id = ${id}`;
  await sql`
    INSERT INTO agent_activity (agent_id, kind, summary, signature, fuel_sol)
    VALUES (${id}, 'fund', ${`treasury funded ${amount} SOL on request`}, ${sig}, ${amount})
  `;
  return { id, pubkey: dest.publicKey.toBase58(), amount, signature: sig, balanceSol: balance };
}

/**
 * Manual sell, owner-triggered from the agent profile (the cycle's sell path, on demand).
 * Sells pct (10-100) of whatever this agent holds of `mint`, back into the curve, on chain.
 */
export async function sellAgentPosition(id: number, mint: string, pct = 50) {
  assertSpendableCluster("manual sell");
  const sql = sqlClient();
  if (!sql) throw new Error("database not configured");
  await ensureAgentSchema(sql);
  const found = await getAgent(id);
  if (!found) throw new Error("agent not found");
  const a: any = found.agent;
  if (!mint || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw new Error("bad mint");

  const kp = agentKeypair(a.id, a.name);
  const held = await tokenBalanceOf(kp.publicKey.toBase58(), mint);
  if (!held.exists || held.amount <= 0n) throw new Error("this agent holds none of that mint");

  const p = Math.max(10, Math.min(100, Number(pct) || 50));
  const amount = (held.amount * BigInt(Math.round(p))) / 100n;
  const sell = await executeAgentTrade({ mint, side: "sell", tokenAmount: amount, agent: kp });
  await logActivity(id, "sell", `owner sold ${p}% of the position back to the curve`, sell.settleSignature, mint);
  try {
    const coins = await listCoins(50);
    const sym = String((coins as any[]).find((c) => String(c.mint) === mint)?.ticker || mint.slice(0, 6)).split("$").join("");
    const out = Number((sell as any).solOut ?? 0);
    const bought = await sql`
      SELECT COALESCE(SUM(fuel_sol), 0)::float AS sol FROM agent_activity
      WHERE agent_id = ${id} AND kind = 'buy' AND mint = ${mint}
    `;
    const basis = Number((bought as any[])[0]?.sol ?? 0) * (p / 100);
    const pnl = out - basis;
    const pnlTxt = basis > 0 ? ` Realised ${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)} SOL (${((pnl / basis) * 100).toFixed(1)}%) on this leg.` : "";
    await createPost(id, `Sold ${p}% of $${sym} back to the curve for ${out.toFixed(4)} SOL.${pnlTxt}`, "signal", mint);
  } catch { /* posting must never break the trade */ }
  return { id, mint, sellPct: p, tokensIn: Number(amount) / Number(TOKEN_UNIT), ...sell };
}

/** Every live mint this agent currently holds a position in — for the profile's holdings list. */
export async function agentHoldings(id: number) {
  const found = await getAgent(id);
  if (!found) return [];
  const a: any = found.agent;
  const kp = agentKeypair(a.id, a.name);
  const coins = await listCoins(50);
  const out: any[] = [];
  for (const c of coins as any[]) {
    if (!c.mint) continue;
    try {
      const b = await tokenBalanceOf(kp.publicKey.toBase58(), String(c.mint));
      if (b.exists && b.amount > 0n) {
        const pool = await getPool(String(c.mint));
        out.push({
          mint: c.mint, name: c.name, ticker: c.ticker,
          amount: Number(b.amount) / Number(TOKEN_UNIT),
          priceSol: pool ? priceSolPerToken(pool) : null,
          curvePct: pool ? curveProgressPct(pool) : null,
        });
      }
    } catch { /* skip unreachable mint */ }
  }
  return out;
}

export async function logActivity(agentId: number, kind: string, summary: string, signature?: string | null, mint?: string | null, fuelSol?: number | null) {
  const sql = sqlClient();
  if (!sql) return;
  await ensureAgentSchema(sql);
  await sql`
    INSERT INTO agent_activity (agent_id, kind, summary, signature, mint, fuel_sol)
    VALUES (${agentId}, ${kind}, ${summary}, ${signature ?? null}, ${mint ?? null}, ${fuelSol ?? null})
  `;
}

/** What is actually tradable: our live devnet mints, ranked by real curve activity. */
async function marketSnapshot() {
  const coins = await listCoins(50);
  const live = coins.filter((c: any) => c.mint);
  const out: any[] = [];
  for (const c of live.slice(0, 12)) {
    const pool = await getPool(String(c.mint));
    if (!pool) continue;
    out.push({
      mint: c.mint,
      name: c.name,
      ticker: c.ticker,
      priceSolPerToken: priceSolPerToken(pool),
      curveProgressPct: curveProgressPct(pool),
      buys: pool.buys,
      sells: pool.sells,
    });
  }
  return out;
}

/** One brain decision. Uses the agent's own key when given, else our River key. */
export async function decide(agent: AgentRow, markets: any[]) {
  const base = process.env.FORGE_BRAIN_BASE || "https://api.river.ai/v1";
  const model = process.env.FORGE_BRAIN_MODEL || "deepseek-ai/DeepSeek-V4.1-Flash";
  const key = agent.api_key || process.env.RIVER_API_KEY || process.env.HERMES_CUSTOM_API_RIVER_AI_API_KEY;

  const sys = `You are ${agent.name}, an autonomous Solana devnet trading agent. Strategy: ${agent.strategy}. Personality: ${agent.personality || "cold and quantitative"}.
You operate on a real devnet bonding curve market. Answer with ONE JSON object and nothing else:
{"action":"launch"|"buy"|"sell"|"hold","mint":"<mint or empty>","solAmount":<number>,"sellPct":<number>,"reason":"<short>"}
Rules: launch = create a new token then buy 0.03 SOL of it. buy = spend 0.02-0.1 SOL of an existing mint. sell = sell 25-100% of a held mint (give the mint). hold = no trade. Stay inside your budget of ${agent.budget_sol} SOL.`;

  const user = `Live markets you can trade:\n${JSON.stringify(markets, null, 1)}\n\nDecide your next single action.`;

  if (!key) return null;
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        temperature: 0.8,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const text = j?.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch { return null; }
}

/** Deterministic fallback so an agent never idles when the brain is unreachable. */
function fallbackDecision(markets: any[]) {
  if (!markets.length) return { action: "launch", reason: "no live market yet — seed one" };
  const target = markets[0];
  if (target.buys + target.sells === 0) return { action: "buy", mint: target.mint, solAmount: 0.03, reason: "first liquidity on an untouched curve" };
  return { action: "buy", mint: markets[Math.floor(Math.random() * markets.length)].mint, solAmount: 0.02, reason: "momentum entry" };
}

/** Execute one full decision cycle for an agent. Every trade is real. */
export async function runAgent(id: number) {
  assertSpendableCluster("agent cycle");
  const sql = sqlClient();
  if (!sql) throw new Error("database not configured");
  const found = await getAgent(id);
  if (!found) throw new Error(`agent ${id} not found`);
  const { agent } = found;
  const kp = agentKeypair(agent.id, agent.name);
  const { conn } = getPlatformWallet();
  const balance = (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;

  const markets = await marketSnapshot();
  let decision = await decide(agent, markets);
  let brain = "river";
  if (!decision) { decision = fallbackDecision(markets); brain = "fallback"; }

  const action = String(decision.action || "hold").toLowerCase();
  const result: any = { agent: agent.name, brain, action, reason: decision.reason ?? null, wallet: kp.publicKey.toBase58(), balanceSol: balance };

  try {
    if (action === "launch") {
      const { brainstorm } = await import("./brain");
      const idea = await brainstorm(`a viral memecoin concept for an autonomous trading agent named ${agent.name}`, (agent.personality || "degen") as any).catch(() => null);
      const meta = idea && idea.name ? idea : { name: `${agent.name} Coin`, ticker: agent.name.slice(0, 4).toUpperCase(), description: `Launched by agent ${agent.name}.` };
      const launch = await realDevnetLaunch({ name: meta.name, ticker: meta.ticker, description: meta.description ?? "" });
      if (!launch.ok || !launch.mint) throw new Error(launch.error || "launch failed");
      // never record a coin as LIVE unless the mint really exists on chain
      const exists = await conn.getAccountInfo(new PublicKey(launch.mint)).catch(() => null);
      if (!exists) throw new Error(`mint ${launch.mint} is not on chain — refusing to record it as live`);
      await sql`
        INSERT INTO coins (mint, name, ticker, description, source, status, explorer)
        VALUES (${launch.mint}, ${meta.name}, ${meta.ticker}, ${meta.description ?? ""}, 'agent', 'LIVE', ${launch.explorer ?? null})
        ON CONFLICT (mint) DO NOTHING
      `;
      await logActivity(agent.id, "launch", `launched ${meta.name} ($${meta.ticker})`, launch.createSig ?? null, launch.mint);
      try {
        await createPost(agent.id, `Launched $${meta.ticker} — ${meta.name}. Mint ${launch.mint}.`, "signal", launch.mint);
      } catch { /* posting must never break the launch */ }
      result.launched = { mint: launch.mint, name: meta.name, ticker: meta.ticker, explorer: launch.explorer };

      const buy = await executeAgentTrade({ mint: launch.mint, side: "buy", solLamports: BigInt(Math.round(0.03 * LAMPORTS_PER_SOL)), agent: kp });
      await logActivity(agent.id, "buy", `dev-bought 0.03 SOL of ${meta.name}`, buy.settleSignature, launch.mint, 0.03);
      result.trade = { side: "buy", ...buy, solAmount: 0.03 };
    } else if (action === "buy") {
      const mint = String(decision.mint || markets[0]?.mint || "");
      if (!mint) throw new Error("no mint to buy");
      const sol = Math.max(0.01, Math.min(0.2, Number(decision.solAmount ?? 0.02)));
      const buy = await executeAgentTrade({ mint, side: "buy", solLamports: BigInt(Math.round(sol * LAMPORTS_PER_SOL)), agent: kp });
      await logActivity(agent.id, "buy", `bought ${sol} SOL on curve`, buy.settleSignature, mint, sol);
      // announce the buy on the agent's profile + the community feed
      try {
        const pool = await getPool(mint);
        const sym = String((markets.find((m) => m.mint === mint)?.ticker) || mint.slice(0, 6)).split("$").join("");
        await createPost(
          agent.id,
          `Bought ${sol} SOL of $${sym} on the curve${pool ? ` at ${priceSolPerToken(pool).toExponential(3)} SOL/token` : ""}.`,
          "signal",
          mint
        );
      } catch { /* posting must never break the trade */ }
      result.trade = { side: "buy", ...buy, solAmount: sol };
    } else if (action === "sell") {
      const mint = String(decision.mint || (markets.find((m) => m.buys > 0)?.mint ?? ""));
      if (!mint) throw new Error("no mint to sell");
      const held = await tokenBalanceOf(kp.publicKey.toBase58(), mint);
      if (!held.exists || held.amount <= 0n) throw new Error("agent holds nothing of that mint");
      const pct = Math.max(10, Math.min(100, Number(decision.sellPct ?? 50)));
      const amount = (held.amount * BigInt(Math.round(pct))) / 100n;
      const sell = await executeAgentTrade({ mint, side: "sell", tokenAmount: amount, agent: kp });
      await logActivity(agent.id, "sell", `sold ${pct}% of position back to the curve`, sell.settleSignature, mint);
      // announce the sale with its realised result (entry basis from the agent's own buy posts)
      try {
        const sym = String((markets.find((m) => m.mint === mint)?.ticker) || mint.slice(0, 6)).split("$").join("");
        const out = Number((sell as any).solOut ?? 0);
        const bought = await sql`
          SELECT COALESCE(SUM(fuel_sol), 0)::float AS sol FROM agent_activity
          WHERE agent_id = ${agent.id} AND kind = 'buy' AND mint = ${mint}
        `;
        const basis = Number((bought as any[])[0]?.sol ?? 0);
        const soldFrac = pct / 100;
        const cost = basis * soldFrac;
        const pnl = out - cost;
        const pnlTxt = cost > 0
          ? ` Realised ${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)} SOL (${((pnl / cost) * 100).toFixed(1)}%) on this leg.`
          : "";
        await createPost(
          agent.id,
          `Sold ${pct}% of $${sym} back to the curve for ${out.toFixed(4)} SOL.${pnlTxt}`,
          "signal",
          mint
        );
      } catch { /* posting must never break the trade */ }
      result.trade = { side: "sell", ...sell, sellPct: pct, tokensIn: Number(amount) / Number(TOKEN_UNIT) };
    } else {
      await logActivity(agent.id, "hold", decision.reason ? `held — ${decision.reason}` : "held — nothing worth trading");
      result.held = true;
    }
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 300);
    await logActivity(agent.id, "error", msg);
    result.error = msg;
  }

  const after = (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
  result.balanceAfterSol = after;
  return result;
}

/** Leaderboard: ranked by real on-chain activity, not by promises. */
export async function leaderboard(limit = 25) {
  const sql = sqlClient();
  if (!sql) return [];
  await ensureAgentSchema(sql);
  const rows = await sql`
    SELECT a.id, a.name, a.strategy, a.pubkey, a.owner_wallet, a.wallet_mode, a.budget_sol,
           (SELECT count(*) FROM devnet_trades t WHERE t.user_wallet = a.pubkey)                          AS trades,
           (SELECT COALESCE(sum(t.sol_amount), 0) FROM devnet_trades t WHERE t.user_wallet = a.pubkey)     AS sol_volume,
           (SELECT count(*) FROM devnet_trades t WHERE t.user_wallet = a.pubkey AND t.side = 'buy')        AS buys,
           (SELECT count(*) FROM devnet_trades t WHERE t.user_wallet = a.pubkey AND t.side = 'sell')       AS sells,
           (SELECT count(*) FROM coins c WHERE c.source = 'agent' AND c.mint IN
              (SELECT DISTINCT t.mint FROM devnet_trades t WHERE t.user_wallet = a.pubkey))                AS launched,
           (SELECT count(*) FROM agent_activity x WHERE x.agent_id = a.id AND x.kind = 'error')            AS errors
      FROM agents a
     ORDER BY sol_volume DESC, trades DESC
     LIMIT ${limit}
  `;
  return rows as any[];
}
