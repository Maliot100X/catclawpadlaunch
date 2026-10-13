// 3D generation jobs.
//
// three.ws's own text->3D is down ("generation_failed: enable R2"), but the
// image->3D lane on Pollinations (microsoft/trellis-2) works and is free: we
// render a FLUX image from the prompt, then hand that image to trellis-2 and get
// a real glTF binary back. Jobs run in a worker on our own box (no serverless
// time limit), store the finished GLB on public storage, and the site polls.

import { neon } from "@neondatabase/serverless";

export type ThreeJob = {
  id: number;
  prompt: string;
  status: "pending" | "running" | "done" | "error";
  image_url: string | null;
  glb_url: string | null;
  bytes: number | null;
  source: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

let ready = false;
export async function ensureJobSchema(sql: any) {
  if (ready) return;
  await sql`
    CREATE TABLE IF NOT EXISTS three_jobs (
      id SERIAL PRIMARY KEY,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      image_url TEXT,
      glb_url TEXT,
      bytes BIGINT,
      source TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  ready = true;
}

export async function enqueueJob(prompt: string): Promise<ThreeJob | null> {
  const sql = sqlClient();
  if (!sql) return null;
  await ensureJobSchema(sql);
  const rows = await sql`
    INSERT INTO three_jobs (prompt, status) VALUES (${prompt}, 'pending')
    RETURNING id, prompt, status, image_url, glb_url, bytes, source, error, created_at, updated_at
  `;
  return (rows as unknown as ThreeJob[])[0] ?? null;
}

export async function getJob(id: number): Promise<ThreeJob | null> {
  const sql = sqlClient();
  if (!sql) return null;
  await ensureJobSchema(sql);
  const rows = await sql`
    SELECT id, prompt, status, image_url, glb_url, bytes, source, error, created_at, updated_at
      FROM three_jobs WHERE id = ${id}
  `;
  return (rows as unknown as ThreeJob[])[0] ?? null;
}

export async function listJobs(limit = 12): Promise<ThreeJob[]> {
  const sql = sqlClient();
  if (!sql) return [];
  await ensureJobSchema(sql);
  const rows = await sql`
    SELECT id, prompt, status, image_url, glb_url, bytes, source, error, created_at, updated_at
      FROM three_jobs ORDER BY created_at DESC LIMIT ${limit}
  `;
  return rows as unknown as ThreeJob[];
}

export async function claimNextJob(): Promise<ThreeJob | null> {
  const sql = sqlClient();
  if (!sql) return null;
  await ensureJobSchema(sql);
  const rows = await sql`
    UPDATE three_jobs SET status = 'running', updated_at = now()
     WHERE id = (SELECT id FROM three_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING id, prompt, status, image_url, glb_url, bytes, source, error, created_at, updated_at
  `;
  return (rows as unknown as ThreeJob[])[0] ?? null;
}

export async function finishJob(id: number, patch: { glbUrl?: string; imageUrl?: string; bytes?: number; source?: string; error?: string }) {
  const sql = sqlClient();
  if (!sql) return;
  await ensureJobSchema(sql);
  const status = patch.error ? "error" : "done";
  await sql`
    UPDATE three_jobs
       SET status = ${status}, glb_url = ${patch.glbUrl ?? null}, image_url = ${patch.imageUrl ?? null},
           bytes = ${patch.bytes ?? null}, source = ${patch.source ?? null}, error = ${patch.error ?? null},
           updated_at = now()
     WHERE id = ${id}
  `;
}
