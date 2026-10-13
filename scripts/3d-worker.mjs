// Real 3D generation worker.
//
// Pulls pending jobs from Postgres and runs the working free lane:
//   prompt -> FLUX image (Pollinations) -> microsoft/trellis-2 (image->3D) -> GLB
// then uploads the GLB to public storage and writes the URL back.
//
// Run: node scripts/3d-worker.mjs        (loops forever, one job at a time)
//      node scripts/3d-worker.mjs --once (drain the queue and exit)

import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const envFile = [".env.local", ".env.production.local", ".env"].find((f) => fs.existsSync(path.join(ROOT, f)));
const env = {};
for (const f of [envFile, ".env.local"]) {
  try {
    const raw = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* ignore */ }
}
const KEY = process.env.POLLINATIONS_API_KEY || env.POLLINATIONS_API_KEY;
const DB = process.env.DATABASE_URL || env.DATABASE_URL;
const ONCE = process.argv.includes("--once");

if (!KEY) { console.error("no POLLINATIONS_API_KEY"); process.exit(1); }
if (!DB) { console.error("no DATABASE_URL"); process.exit(1); }

const { neon } = await import("@neondatabase/serverless");
const sql = neon(DB);

let schemaReady = false;
async function ensure() {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS three_jobs (
      id SERIAL PRIMARY KEY, prompt TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      image_url TEXT, glb_url TEXT, bytes BIGINT, source TEXT, error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  schemaReady = true;
}

async function claim() {
  await ensure();
  const rows = await sql`
    UPDATE three_jobs SET status = 'running', updated_at = now()
     WHERE id = (SELECT id FROM three_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1)
    RETURNING id, prompt`;
  return rows[0] ?? null;
}

async function finish(id, patch) {
  const status = patch.error ? "error" : "done";
  await sql`
    UPDATE three_jobs SET status = ${status}, glb_url = ${patch.glbUrl ?? null}, image_url = ${patch.imageUrl ?? null},
      bytes = ${patch.bytes ?? null}, source = ${patch.source ?? null}, error = ${patch.error ?? null}, updated_at = now()
     WHERE id = ${id}`;
}

const log = (...a) => console.log(new Date().toISOString(), ...a);

/** Sweep interrupted market settlements too, so a paid order is never left unfilled. */
const SWEEP_URL = process.env.SWEEP_URL || "https://catclawpad.vercel.app/api/dex/sweep";
async function sweep() {
  try {
    const r = await fetch(SWEEP_URL, { signal: AbortSignal.timeout(55_000) });
    const j = await r.json();
    if (j?.attempting) log(`settlement sweep: ${j.attempting} order(s) →`, JSON.stringify(j.results).slice(0, 200));
  } catch { /* ignore */ }
}

/** Step 1 — a real FLUX image URL from the prompt (no download needed). */
function fluxUrl(prompt, size = 768) {
  const p = encodeURIComponent(`${prompt}, single centered subject, clean solid dark background, no text, product shot`);
  return `https://image.pollinations.ai/prompt/${p}?width=${size}&height=${size}&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1e9)}`;
}

/** Step 2 — image -> real GLB via trellis-2 (the free lane that works). */
async function imageToGlb(prompt, imageUrl) {
  const q = encodeURIComponent(prompt.slice(0, 180) || "chunky collectible figurine");
  const url = `https://gen.pollinations.ai/3d/${q}?model=trellis-2-medium&image=${encodeURIComponent(imageUrl)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(600_000) });
  const type = r.headers.get("content-type") || "";
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`trellis ${r.status}: ${body.slice(0, 200)}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.subarray(0, 4).toString() !== "glTF") {
    throw new Error(`not a GLB (content-type ${type}, ${buf.length}b)`);
  }
  return buf;
}

/** Step 3 — publish the GLB so the site (and the world) can load it. */
async function publish(glb, prompt) {
  // primary: Pollinations media upload
  try {
    const form = new FormData();
    form.append("file", new Blob([glb], { type: "model/gltf-binary" }), "model.glb");
    const r = await fetch("https://media.pollinations.ai/upload", {
      method: "POST", headers: { Authorization: `Bearer ${KEY}` }, body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (r.ok) {
      const j = await r.json().catch(() => null);
      const u = j?.url || j?.data?.url || j?.file?.url;
      if (u) return { url: String(u), source: "media.pollinations.ai" };
    }
  } catch { /* fall through */ }

  // fallback: Pinata IPFS (permanent, gateway-readable)
  const jwt = process.env.PINATA_JWT || env.PINATA_JWT;
  if (jwt) {
    try {
      const form = new FormData();
      form.append("file", new Blob([glb], { type: "model/gltf-binary" }), `${prompt.slice(0, 24).replace(/[^a-z0-9]+/gi, "-")}.glb`);
      form.append("pinataMetadata", JSON.stringify({ name: `clawpad-3d-${Date.now()}` }));
      const r = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: form,
        signal: AbortSignal.timeout(180_000),
      });
      if (r.ok) {
        const j = await r.json();
        return { url: `https://gateway.pinata.cloud/ipfs/${j.IpfsHash}`, source: "pinata-ipfs" };
      }
    } catch { /* fall through */ }
  }

  // last resort: keep it locally on the box and serve it from our origin
  const dir = path.join(ROOT, "public", "models");
  fs.mkdirSync(dir, { recursive: true });
  const name = `m${Date.now()}.glb`;
  fs.writeFileSync(path.join(dir, name), glb);
  return { url: `/models/${name}`, source: "local-public" };
}

async function runOne() {
  const job = await claim();
  if (!job) return false;
  log(`job ${job.id}: ${job.prompt}`);
  try {
    const image = fluxUrl(job.prompt);
    log(`  flux image: ${image.slice(0, 90)}…`);
    const glb = await imageToGlb(job.prompt, image);
    log(`  glb: ${(glb.length / 1024 / 1024).toFixed(1)} MB`);
    const pub = await publish(glb, job.prompt);
    log(`  published: ${pub.url} (${pub.source})`);
    await finish(job.id, { glbUrl: pub.url, imageUrl: image, bytes: glb.length, source: `trellis-2-medium · ${pub.source}` });
  } catch (e) {
    log(`  FAILED: ${e.message}`);
    await finish(job.id, { error: String(e.message).slice(0, 400) });
  }
  return true;
}

log("3d worker up · lane: flux → trellis-2-medium → upload");
let stop = false;
process.on("SIGTERM", () => { stop = true; });
process.on("SIGINT", () => { stop = true; });

if (ONCE) {
  while (await runOne()) { /* drain */ }
  log("queue drained");
} else {
  let lastSweep = 0;
  while (!stop) {
    const did = await runOne().catch(() => false);
    if (Date.now() - lastSweep > 30_000) { lastSweep = Date.now(); await sweep(); }
    if (!did) await new Promise((r) => setTimeout(r, 7000));
  }
  log("worker stopped");
}
