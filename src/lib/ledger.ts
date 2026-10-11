/**
 * In-memory ledger for local/devnet testing.
 * Swap to Neon Postgres via DATABASE_URL without changing route shapes.
 */
import { createHash, randomBytes } from "crypto";
import { KEY_PREFIX } from "./cluster";

export type WalletRow = {
  wallet: string;
  credits: number;
  locked: number;
  updated: number;
};

export type ApiKeyRow = {
  id: string;
  wallet: string;
  hash: string;
  prefix: string;
  created: number;
};

export type PoolRow = {
  mint: string;
  family: string;
  staked: number;
  apy: number;
  cluster: string;
};

type Store = {
  wallets: Map<string, WalletRow>;
  keys: Map<string, ApiKeyRow>; // hash -> row
  keysById: Map<string, ApiKeyRow>;
  pools: Map<string, PoolRow>;
  /** raw key plaintext only for local mock — never log */
  rawToHash: Map<string, string>;
};

const g = globalThis as unknown as { __ccpStore?: Store };

function store(): Store {
  if (!g.__ccpStore) {
    g.__ccpStore = {
      wallets: new Map(),
      keys: new Map(),
      keysById: new Map(),
      pools: new Map(),
      rawToHash: new Map(),
    };
  }
  return g.__ccpStore;
}

export function getWallet(wallet: string): WalletRow {
  const s = store();
  let w = s.wallets.get(wallet);
  if (!w) {
    w = { wallet, credits: 0, locked: 0, updated: Date.now() };
    s.wallets.set(wallet, w);
  }
  return w;
}

export function creditWallet(wallet: string, amount: number): WalletRow {
  const w = getWallet(wallet);
  w.credits += amount;
  w.updated = Date.now();
  return w;
}

export function deductCredits(wallet: string, amount: number): { ok: true; left: number } | { ok: false; code: 402 } {
  const w = getWallet(wallet);
  if (w.credits < amount) return { ok: false, code: 402 };
  w.credits -= amount;
  w.updated = Date.now();
  return { ok: true, left: w.credits };
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function createApiKey(wallet: string): { raw: string; row: ApiKeyRow } {
  const raw = KEY_PREFIX + randomBytes(24).toString("hex");
  const hash = hashKey(raw);
  const row: ApiKeyRow = {
    id: randomBytes(8).toString("hex"),
    wallet,
    hash,
    prefix: raw.slice(0, 12) + "…",
    created: Date.now(),
  };
  const s = store();
  s.keys.set(hash, row);
  s.keysById.set(row.id, row);
  s.rawToHash.set(raw, hash);
  return { raw, row };
}

export function resolveKey(raw: string): ApiKeyRow | null {
  const hash = hashKey(raw);
  return store().keys.get(hash) || null;
}

export function listPools(): PoolRow[] {
  return [...store().pools.values()];
}

export function upsertPool(p: PoolRow): void {
  store().pools.set(p.mint, p);
}

/** Rough token billing: $ per 1M output → credits units (1 credit = $0.001 retail) */
export function estimateCostCredits(model: string, promptTokens: number, completionTokens: number, retailPer1M: number): number {
  const total = promptTokens * 0.25 + completionTokens; // input cheaper stub
  const usd = (total / 1_000_000) * retailPer1M;
  return Math.max(0.001, Math.round(usd * 1000 * 1000) / 1000); // millicredits-ish
}
