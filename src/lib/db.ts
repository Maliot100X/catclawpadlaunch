// Neon Postgres (serverless driver over HTTP) — real persistence for coins + launches.
// Falls back to the local JSON file when DATABASE_URL is absent (e.g. plain local dev).

import { neon } from "@neondatabase/serverless";
import { promises as fs } from "fs";
import path from "path";

const DB_FILE = path.join(process.cwd(), ".data", "coins.json");

export type CoinRow = {
  id: number;
  mint: string | null;
  name: string;
  ticker: string;
  description: string | null;
  tags: string[] | null;
  logo_style: string | null;
  source: string | null;
  status: string;
  create_sig: string | null;
  mint_sig: string | null;
  explorer: string | null;
  when: string;
};

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

let schemaReady = false;
export async function ensureSchema(): Promise<boolean> {
  const sql = client();
  if (!sql) return false;
  if (schemaReady) return true;
  await sql`
    CREATE TABLE IF NOT EXISTS coins (
      id SERIAL PRIMARY KEY,
      mint TEXT UNIQUE,
      name TEXT NOT NULL,
      ticker TEXT NOT NULL,
      description TEXT,
      tags TEXT[],
      logo_style TEXT,
      source TEXT,
      status TEXT NOT NULL DEFAULT 'SIM',
      create_sig TEXT,
      mint_sig TEXT,
      explorer TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS coins_created_idx ON coins (created_at DESC)`;
  schemaReady = true;
  return true;
}

export async function listCoins(limit = 100): Promise<CoinRow[]> {
  const sql = client();
  if (!sql) return [];
  try {
    await ensureSchema();
    const rows = await sql`
      SELECT id, mint, name, ticker, description, tags, logo_style, source, status,
             create_sig, mint_sig, explorer, created_at AS when
      FROM coins ORDER BY created_at DESC LIMIT ${limit}
    `;
    return rows as unknown as CoinRow[];
  } catch {
    return [];
  }
}

export async function insertCoin(c: {
  name: string; ticker: string; description?: string; tags?: string[];
  logoStyle?: string; source?: string; mint?: string | null; status?: string;
}): Promise<CoinRow | null> {
  const sql = client();
  if (!sql) return null;
  try {
    await ensureSchema();
    const rows = await sql`
      INSERT INTO coins (mint, name, ticker, description, tags, logo_style, source, status)
      VALUES (${c.mint ?? null}, ${c.name}, ${c.ticker}, ${c.description ?? ""},
              ${c.tags ?? []}, ${c.logoStyle ?? "auto"}, ${c.source ?? "forge"}, ${c.status ?? "SIM"})
      RETURNING id, mint, name, ticker, description, tags, logo_style, source, status,
                create_sig, mint_sig, explorer, created_at AS when
    `;
    return (rows as unknown as CoinRow[])[0] ?? null;
  } catch {
    return null;
  }
}

export async function markLaunched(name: string, mint: string, createSig?: string, mintSig?: string, explorer?: string): Promise<boolean> {
  const sql = client();
  if (!sql) return false;
  try {
    await ensureSchema();
    await sql`
      UPDATE coins SET mint = ${mint}, status = 'LIVE', create_sig = ${createSig ?? null},
             mint_sig = ${mintSig ?? null}, explorer = ${explorer ?? null}
      WHERE id = (SELECT id FROM coins WHERE name = ${name} ORDER BY created_at DESC LIMIT 1)
    `;
    return true;
  } catch {
    return false;
  }
}

/* ---- JSON fallback (used when no DATABASE_URL) ---- */

export async function listCoinsFile(): Promise<any[]> {
  try {
    return JSON.parse(await fs.readFile(DB_FILE, "utf8"));
  } catch { return []; }
}

export async function insertCoinFile(rec: any): Promise<any> {
  const coins = await listCoinsFile();
  const row = { id: coins.length + 1, ...rec, when: new Date().toISOString() };
  coins.unshift(row);
  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(coins, null, 2));
  return row;
}
