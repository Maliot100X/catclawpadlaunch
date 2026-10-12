// Neon: unified Auth + Data API client (@neondatabase/neon-js).
// Both URLs are public endpoints; access is token-gated by Neon Auth.

import { createClient } from "@neondatabase/neon-js";

const dataApiUrl = process.env.NEXT_PUBLIC_NEON_DATA_API_URL ?? "";
const authUrl = process.env.NEXT_PUBLIC_NEON_AUTH_URL ?? process.env.NEON_AUTH_BASE_URL ?? "";

export const neonConfigured = Boolean(dataApiUrl && authUrl);

let client: any = null;
export function getNeon() {
  if (!neonConfigured) return null;
  if (client) return client;
  try {
    client = createClient({
      auth: { url: authUrl },
      dataApi: { url: dataApiUrl },
    });
  } catch {
    client = null;
  }
  return client;
}

/** Signed-in user, or null. Never throws. */
export async function currentUser(): Promise<{ id: string; email?: string } | null> {
  const c = getNeon();
  if (!c) return null;
  try {
    const s = c.auth?.getSession ? await c.auth.getSession() : null;
    const u = s?.data?.session?.user ?? s?.data?.user ?? s?.session?.user ?? s?.user ?? null;
    if (!u) return null;
    return { id: String(u.id ?? u.sub ?? ""), email: u.email };
  } catch {
    return null;
  }
}

export async function signIn(email: string, password: string) {
  const c = getNeon();
  if (!c) throw new Error("Neon auth not configured");
  return c.auth.signIn.email({ email, password });
}

export async function signUp(email: string, password: string) {
  const c = getNeon();
  if (!c) throw new Error("Neon auth not configured");
  return c.auth.signUp.email({ email, password });
}

export async function signOut() {
  const c = getNeon();
  if (!c) return;
  try { await c.auth.signOut(); } catch { /* ignore */ }
}

/** Authenticated Data API query against `coins` (RLS applies with the user's token). */
export async function queryCoinsAuthed(): Promise<any[] | null> {
  const c = getNeon();
  if (!c) return null;
  try {
    const res = await c.from("coins").select("*").limit(100);
    return res?.data ?? null;
  } catch {
    return null;
  }
}
