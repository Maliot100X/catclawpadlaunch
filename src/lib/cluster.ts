/**
 * Cluster switch — NEVER hardcode mainnet as the only path.
 * Set NEXT_PUBLIC_CLUSTER=devnet|testnet|mainnet-beta
 */
export type Cluster = "devnet" | "testnet" | "mainnet-beta";

export const CLUSTER = (process.env.NEXT_PUBLIC_CLUSTER || "devnet") as Cluster;

const DEFAULT_RPC: Record<Cluster, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

export function getRpcUrl(): string {
  return process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_RPC[CLUSTER];
}

export function isMainnet(): boolean {
  return CLUSTER === "mainnet-beta";
}

/** Launch fee box (same math LLMPad shows) — cluster-agnostic SOL amounts */
export const LAUNCH_FEES = {
  launchFeeSol: 0.05,
  devBuySol: 0.5,
  networkRentSol: 0.03,
} as const;

export function launchTotalSol(): number {
  return LAUNCH_FEES.launchFeeSol + LAUNCH_FEES.devBuySol + LAUNCH_FEES.networkRentSol;
}

/** Credits market: earners/builders 60% of retail */
export const CREDIT_MARKET = {
  builderPct: 0.6,
  earnerPct: 0.6,
  retailPct: 1.0,
} as const;

export const KEY_PREFIX = "sk-claw-";

export const DAY1_FAMILIES = [
  { id: "claude", name: "Claude", icon: "claude", models: 35, priceRange: "$0.25-75" },
  { id: "chatgpt", name: "ChatGPT", icon: "openai", models: 109, priceRange: "$0.09-600" },
  { id: "grok", name: "Grok", icon: "xai", models: 9, priceRange: "$2.00-6" },
  { id: "deepseek", name: "DeepSeek", icon: "deepseek", models: 18, priceRange: "$0.34-3" },
  { id: "nous", name: "Nous", icon: "nous", models: 3, priceRange: "$0.70-3" },
] as const;

/** Gateway short model → upstream OpenRouter-style id (override via env later) */
export const MODEL_MAP: Record<string, string> = {
  claude: "anthropic/claude-sonnet-4",
  "claude-haiku": "anthropic/claude-haiku-4.5",
  gpt: "openai/gpt-4o",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  gemini: "google/gemini-2.5-pro",
  "gemini-flash": "google/gemini-2.5-flash",
  deepseek: "deepseek/deepseek-chat",
  grok: "x-ai/grok-4",
};

export const RETAIL_PER_1M: Record<string, number> = {
  claude: 15,
  grok: 15,
  gpt: 10,
  gemini: 10,
  deepseek: 1,
};
