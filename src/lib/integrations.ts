// Upstash Redis + Groq + Pinata — each activates only when its env var is present.
// Nothing here throws when keys are missing; callers fall back.

import { Redis } from "@upstash/redis";

/* ---------------- Redis (trend cache) ---------------- */

let redis: Redis | null = null;
export function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!redis) redis = new Redis({ url, token });
  return redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const v = await r.get<T>(key);
    return (v as T) ?? null;
  } catch { return null; }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 120): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    await r.set(key, value, { ex: ttlSeconds });
    return true;
  } catch { return false; }
}

/* ---------------- Groq (fast text tier) ---------------- */

export async function groqText(system: string, user: string, maxTokens = 220): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        max_tokens: maxTokens,
        temperature: 0.9,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.choices?.[0]?.message?.content ?? null;
  } catch { return null; }
}

/* ---------------- Pinata (IPFS pinning) ---------------- */

export function pinataConfigured(): boolean {
  return Boolean(process.env.PINATA_JWT);
}

/** Pin a JSON object to IPFS. Returns the ipfs:// URI, or null when unavailable. */
export async function pinJsonToIpfs(obj: unknown, name: string): Promise<{ uri: string; gateway: string } | null> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return null;
  try {
    const r = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        pinataContent: obj,
        pinataMetadata: { name },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const cid = j?.IpfsHash;
    if (!cid) return null;
    return { uri: `ipfs://${cid}`, gateway: `https://gateway.pinata.cloud/ipfs/${cid}` };
  } catch { return null; }
}
