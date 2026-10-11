import { CLUSTER, LAUNCH_FEES, launchTotalSol } from "./cluster";

export type DevWallet = {
  publicKey: string;
  /** encrypted secret — local mock stores base58 secret under ENCRYPTION_KEY */
  secretEnc: string;
  family: string;
  cluster: string;
  status: "awaiting_funds" | "funded" | "launched" | "failed";
  created: number;
  mint?: string;
};

const g = globalThis as unknown as { __ccpLaunch?: Map<string, DevWallet> };

function map() {
  if (!g.__ccpLaunch) g.__ccpLaunch = new Map();
  return g.__ccpLaunch;
}

export function createDevWalletRecord(family: string, publicKey: string, secretEnc: string): DevWallet {
  const row: DevWallet = {
    publicKey,
    secretEnc,
    family,
    cluster: CLUSTER,
    status: "awaiting_funds",
    created: Date.now(),
  };
  map().set(publicKey, row);
  return row;
}

export function getDevWallet(publicKey: string): DevWallet | undefined {
  return map().get(publicKey);
}

export function markFunded(publicKey: string): DevWallet | undefined {
  const w = map().get(publicKey);
  if (!w) return;
  w.status = "funded";
  return w;
}

export function markLaunched(publicKey: string, mint: string): DevWallet | undefined {
  const w = map().get(publicKey);
  if (!w) return;
  w.status = "launched";
  w.mint = mint;
  return w;
}

export function launchQuote() {
  return {
    cluster: CLUSTER,
    ...LAUNCH_FEES,
    totalSol: launchTotalSol(),
    note: "dev buy tokens are yours to claim; creator rewards -> stakers as LLM credits",
  };
}

/**
 * pump.fun create is same program on devnet/mainnet.
 * This mock returns a deterministic fake mint for local tests.
 * Real tx path: wire @solana/web3.js + pump SDK when SOL arrives on CLUSTER.
 */
export function mockPumpCreate(family: string, cluster: string): { mint: string; signature: string } {
  const mint = `Mock${family.slice(0, 4)}${Date.now().toString(36)}`.slice(0, 32);
  return { mint, signature: `mock_sig_${cluster}_${Date.now()}` };
}
