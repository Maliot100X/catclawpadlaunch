"use client";

import { useCallback, useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";

type Gen = { status?: string; glbUrl?: string; viewerUrl?: string; job?: string; poll?: string; [k: string]: any };
type Inspect = { valid?: boolean; sizeBytes?: number; stats?: Record<string, any>; recommendations?: { severity: string; issue: string; fix: string }[] };

const EXAMPLES = [
  "a small ceramic robot figurine",
  "a chunky cat astronaut helmet, low-poly",
  "a glossy 3D coin with a claw mark",
  "a chrome rocket desk toy",
];

export default function ThreeDPage() {
  const [prompt, setPrompt] = useState("a glossy 3D coin with a claw mark");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [gen, setGen] = useState<Gen | null>(null);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [quote, setQuote] = useState<any>(null);
  const [prep, setPrep] = useState<any>(null);
  const [coins, setCoins] = useState<any[]>([]);
  const [attachMint, setAttachMint] = useState("");
  const [attachMsg, setAttachMsg] = useState("");
  const [diffB, setDiffB] = useState("");
  const [jobImage, setJobImage] = useState<string | null>(null);
  const [diff, setDiff] = useState<any>(null);

  useEffect(() => {
    fetch("/api/coins", { cache: "no-store" }).then((r) => r.json())
      .then((j) => setCoins((j.coins ?? []).filter((c: any) => c.mint))).catch(() => {});
  }, []);

  const glb = gen?.glbUrl ?? null;

  const pollLegacy = useCallback(async (job: string, tries = 12) => {
    for (let i = 0; i < tries; i++) {
      setStatus(`rendering on the GPU lane… (${i + 1}/${tries})`);
      const j = await fetch(`/api/three3d?kind=poll&job=${encodeURIComponent(job)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      const d = j?.data;
      if (d?.status === "done" && d.glbUrl) { setGen(d); setStatus("model ready — real GLB"); return d; }
      void pollLegacy;
      if (d?.status === "failed" || d?.error) { setStatus(`generation failed: ${String(d.error ?? d.status)}`); return null; }
      await new Promise((r) => setTimeout(r, 7000));
    }
    setStatus("still rendering — reopen the job link in a moment");
    return null;
  }, []);

  async function generate() {
    if (!prompt.trim()) return;
    setBusy(true); setStatus("queueing 3D build…"); setGen(null); setInspect(null); setQuote(null); setPrep(null); setJobImage(null);
    try {
      const j = await fetch("/api/three3d?kind=generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      }).then((r) => r.json());
      if (!j.ok || !j.job) { setStatus(`error: ${j.error ?? "could not queue"}`); return; }
      setStatus(`job #${j.job} queued · lane ${j.lane}`);
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 6000));
        const s = await fetch(`/api/three3d?kind=job&id=${j.job}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
        const job = s?.job;
        if (!job) continue;
        if (job.image_url) setJobImage(job.image_url);
        if (job.status === "done" && job.glb_url) {
          setGen({ glbUrl: job.glb_url, source: job.source, bytes: job.bytes });
          setStatus(`model ready · ${(Number(job.bytes) / 1024 / 1024).toFixed(1)} MB real GLB`);
          return;
        }
        if (job.status === "error") { setStatus(`build failed: ${job.error}`); return; }
        setStatus(`${job.status} · building your mesh… (${i + 1})`);
      }
      setStatus("still building — leave the page open, it shows up under recent builds");
    } finally { setBusy(false); }
  }

  async function doInspect() {
    if (!glb) return;
    setBusy(true); setStatus("inspecting model…");
    try {
      const j = await fetch(`/api/three3d?kind=inspect&url=${encodeURIComponent(glb)}`, { cache: "no-store" }).then((r) => r.json());
      setInspect(j?.data ?? null);
      setStatus(j?.ok ? "inspect done" : `inspect error: ${j?.error ?? j?.upstreamStatus}`);
    } finally { setBusy(false); }
  }

  async function doQuote() {
    if (!glb) return;
    setBusy(true); setStatus("checking printability…");
    try {
      const j = await fetch("/api/three3d?kind=quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: glb, material: "pla" }),
      }).then((r) => r.json());
      setQuote(j?.data ?? null);
      setStatus(j?.ok ? "print quote ready" : `quote error: ${j?.error ?? j?.upstreamStatus}`);
    } finally { setBusy(false); }
  }

  async function doPrepare(format: string) {
    if (!glb) return;
    setBusy(true); setStatus(`building watertight ${format.toUpperCase()}…`);
    try {
      const j = await fetch("/api/three3d?kind=prepare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: glb, format }),
      }).then((r) => r.json());
      setPrep(j?.data ?? null);
      setStatus(j?.ok ? `${format.toUpperCase()} export ready` : `prepare error: ${j?.error ?? j?.upstreamStatus}`);
    } finally { setBusy(false); }
  }

  async function doDiff() {
    if (!glb || !diffB) return;
    setBusy(true); setStatus("diffing models…");
    try {
      const j = await fetch("/api/three3d?kind=diff", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ a: glb, b: diffB }),
      }).then((r) => r.json());
      setDiff(j?.data ?? null);
      setStatus(j?.ok ? "diff done" : `diff error: ${j?.error ?? j?.upstreamStatus}`);
    } finally { setBusy(false); }
  }

  async function attach() {
    if (!glb || !attachMint) { setAttachMsg("pick a coin first"); return; }
    const j = await fetch("/api/coins", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mint: attachMint, modelUrl: glb }),
    }).then((r) => r.json());
    setAttachMsg(j.ok ? "3D asset attached — open the coin page to see it" : `failed: ${j.error}`);
  }

  return (
    <div className="space-y-8">
      <Script src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js" type="module" strategy="afterInteractive" />

      <div>
        <p className="kicker">real 3d toolchain · three.ws · free &amp; keyless</p>
        <h2 className="text-2xl font-bold tracking-tight">3D FORGE_</h2>
        <p className="mt-2 text-sm text-[var(--muted)] max-w-3xl">
          Text → a real textured GLB, then inspect its structure, price it for printing and export a watertight
          solid a 3D printer takes (STL / 3MF). Generate a 3D asset for any coin we launched and it shows up on
          that coin&apos;s page.
        </p>
      </div>

      <section className="panel p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap gap-1">
          {EXAMPLES.map((e) => (
            <button key={e} className="chip" onClick={() => setPrompt(e)}>{e}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="kicker">prompt</span>
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)}
                   className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-3 mono text-sm outline-none focus:border-[var(--lime)]" />
          </label>
          <button className="btn btn-forge self-end" disabled={busy} onClick={generate}>
            {busy ? "working…" : "GENERATE 3D"}
          </button>
        </div>
        {status && <p className="mono text-[11px] text-[var(--cyan)]">{status}</p>}
        {gen?.job && !glb && <p className="mono text-[10px] text-[var(--muted)]">job {String(gen.job).slice(0, 18)}… still rendering</p>}
      </section>

      {glb && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <section className="panel p-4">
            <p className="kicker m-0">live model · real glb</p>
            {/* @ts-expect-error custom element from the model-viewer script */}
            <model-viewer src={glb} alt="generated 3D model" camera-controls auto-rotate
                          style={{ width: "100%", height: 380, background: "#04050c", border: "1px solid var(--line)", marginTop: 12 }} />
            {jobImage && (
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={jobImage} alt="source render" className="w-20 h-20 object-cover border border-[var(--line)]" />
                <span className="mono text-[10px] text-[var(--muted)]">source render (FLUX) → mesh (trellis-2)</span>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-1">
              <a className="chip chip-on" href={glb} target="_blank" rel="noreferrer">download GLB ↗</a>
              {gen?.viewerUrl && <a className="chip" href={gen.viewerUrl} target="_blank" rel="noreferrer">three.ws viewer ↗</a>}
              <button className="chip" onClick={doInspect}>inspect</button>
              <button className="chip" onClick={doQuote}>print quote</button>
              <button className="chip" onClick={() => doPrepare("stl")}>prepare STL</button>
              <button className="chip" onClick={() => doPrepare("3mf")}>prepare 3MF</button>
            </div>
          </section>

          <section className="panel p-4 space-y-4">
            <div>
              <p className="kicker m-0">attach to a coin</p>
              <select value={attachMint} onChange={(e) => setAttachMint(e.target.value)}
                      className="mt-2 w-full bg-[#04050c] border border-[var(--line)] p-2 mono text-xs">
                <option value="">pick a coin…</option>
                {coins.map((c) => <option key={c.mint} value={c.mint}>{c.name} ({c.ticker})</option>)}
              </select>
              <button className="btn mt-2" onClick={attach}>attach 3D asset</button>
              {attachMsg && <p className="mono text-[11px] text-[var(--cyan)] mt-2">{attachMsg}</p>}
            </div>

            {inspect?.stats && (
              <div className="mono text-[11px] space-y-0.5">
                <p className="kicker m-0">structure</p>
                <div>valid: <span className="text-[var(--lime)]">{String(inspect.valid)}</span></div>
                <div>vertices: {Number(inspect.stats.vertices ?? 0).toLocaleString()}</div>
                <div>triangles: {Number(inspect.stats.triangles ?? 0).toLocaleString()}</div>
                <div>materials: {String(inspect.stats.materials)} · textures: {String(inspect.stats.textures)}</div>
                <div>animations: {String(inspect.stats.animations)} · skins: {String(inspect.stats.skins)}</div>
                <div>size: {(Number(inspect.sizeBytes ?? 0) / 1024).toFixed(0)} KB · {String(inspect.stats.container)}</div>
              </div>
            )}

            {quote && (
              <div className="mono text-[11px] space-y-0.5">
                <p className="kicker m-0">printability</p>
                <div>printable: <span className="text-[var(--lime)]">{String(quote.printable ?? quote.printability?.printable ?? "—")}</span></div>
                {quote.quote?.usdc != null && <div>quote: ${quote.quote.usdc} USDC ({String(quote.quote.material ?? "pla")})</div>}
                {quote.quote?.grams != null && <div>material: {String(quote.quote.grams)} g</div>}
                {Array.isArray(quote.issues) && quote.issues.slice(0, 3).map((i: any, n: number) => (
                  <div key={n} className="text-[var(--muted)]">• {String(i.issue ?? i)}</div>
                ))}
              </div>
            )}

            {prep && (
              <div className="mono text-[11px] space-y-0.5">
                <p className="kicker m-0">print export</p>
                {prep.watertight != null && <div>watertight: <span className="text-[var(--lime)]">{String(prep.watertight)}</span></div>}
                {Array.isArray(prep.files) && prep.files.map((f: any, n: number) => (
                  <a key={n} className="block text-[var(--cyan)] underline" href={f.url ?? f} target="_blank" rel="noreferrer">
                    download {String(f.format ?? "file")} ↗
                  </a>
                ))}
                {prep.url && <a className="block text-[var(--cyan)] underline" href={prep.url} target="_blank" rel="noreferrer">download export ↗</a>}
                {!prep.files && !prep.url && <div className="text-[var(--muted)]">{JSON.stringify(prep).slice(0, 160)}</div>}
              </div>
            )}

            <div>
              <p className="kicker m-0">diff against another model</p>
              <input value={diffB} onChange={(e) => setDiffB(e.target.value)} placeholder="https://…/other.glb"
                     className="mt-2 w-full bg-[#04050c] border border-[var(--line)] p-2 mono text-xs" />
              <button className="btn mt-2" onClick={doDiff}>compare</button>
              {diff && (
                <div className="mono text-[11px] mt-2 space-y-0.5">
                  <div>severity: <span className="text-[var(--lime)]">{String(diff.severity ?? "—")}</span></div>
                  {Array.isArray(diff.changes) && diff.changes.slice(0, 4).map((c: any, n: number) => (
                    <div key={n} className="text-[var(--muted)]">• {String(c.issue ?? c.field ?? JSON.stringify(c).slice(0, 60))}</div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <p className="mono text-[10px] text-[var(--muted)]">
        free tier only (draft geometry, no rigging). <Link className="underline" href="/coins">see the coins →</Link>
      </p>
    </div>
  );
}
