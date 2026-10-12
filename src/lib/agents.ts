/**
 * Trading agents — paper + live quote engine.
 * Status can be paused globally; paper trades still simulate against Jupiter quotes.
 */
import { getQuote, SOL_MINT, USDC_MINT } from "./jupiter";
import { CLUSTER } from "./cluster";

export type Agent = {
  id: string;
  name: string;
  owner: string;
  status: "running" | "paused" | "stopped";
  mode: "paper" | "live";
  solBalance: number;
  usdcBalance: number;
  pnlSol: number;
  trades: { t: number; side: "buy" | "sell"; inAmount: string; outAmount: string; note: string }[];
  lastQuote?: { outAmount: string; priceImpactPct?: string; t: number };
  created: number;
};

const g = globalThis as unknown as { __ccpAgents?: Map<string, Agent> };
function store() {
  if (!g.__ccpAgents) g.__ccpAgents = new Map();
  return g.__ccpAgents;
}

export function listAgents(): Agent[] {
  return [...store().values()].sort((a, b) => b.created - a.created);
}

export function getAgent(id: string): Agent | undefined {
  return store().get(id);
}

export function createAgent(owner: string, name?: string, sol = 1): Agent {
  const id = `ag_${Date.now().toString(36)}`;
  const a: Agent = {
    id,
    name: name || `claw-bot-${id.slice(-4)}`,
    owner,
    status: process.env.AGENTS_PAUSED === "0" ? "running" : "paused",
    mode: "paper",
    solBalance: sol,
    usdcBalance: 0,
    pnlSol: 0,
    trades: [],
    created: Date.now(),
  };
  store().set(id, a);
  return a;
}

export async function tickAgent(id: string): Promise<Agent> {
  const a = store().get(id);
  if (!a) throw new Error("agent not found");

  // Always refresh live market quote (real Jupiter)
  const lamports = Math.floor(0.01 * 1e9); // 0.01 SOL sample
  try {
    const q = await getQuote({
      inputMint: SOL_MINT,
      outputMint: USDC_MINT,
      amount: lamports,
      slippageBps: 50,
    });
    a.lastQuote = { outAmount: q.outAmount, priceImpactPct: q.priceImpactPct, t: Date.now() };

    if (a.status === "running" && a.mode === "paper" && a.solBalance >= 0.01) {
      // paper buy USDC with 0.01 SOL
      const usdcOut = Number(q.outAmount) / 1e6;
      a.solBalance -= 0.01;
      a.usdcBalance += usdcOut;
      a.trades.unshift({
        t: Date.now(),
        side: "buy",
        inAmount: "0.01 SOL",
        outAmount: `${usdcOut.toFixed(4)} USDC`,
        note: `paper via jupiter quote impact=${q.priceImpactPct ?? "?"}% cluster=${CLUSTER}`,
      });
      a.trades = a.trades.slice(0, 40);
      // rough pnl: mark USDC as SOL equivalent using inverse quote approx
      a.pnlSol = a.solBalance + a.usdcBalance * (0.01 / Math.max(usdcOut, 1e-9)) - 1;
    }
  } catch (e) {
    a.trades.unshift({
      t: Date.now(),
      side: "buy",
      inAmount: "0",
      outAmount: "0",
      note: `quote error: ${String(e)}`,
    });
  }
  return a;
}

export function setAgentStatus(id: string, status: Agent["status"]): Agent {
  const a = store().get(id);
  if (!a) throw new Error("not found");
  a.status = status;
  return a;
}
