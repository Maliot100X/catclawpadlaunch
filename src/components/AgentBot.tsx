"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "agent"; content: string; mint?: string };

const SUGGESTIONS = ["launch a frog that only trades at 3am", "trends", "coins", "status", "help"];

export function AgentBot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "agent", content: "CLAWPAD agent online. I can brand a coin and mint it for real on devnet.\nTry: launch a toaster that wants to go to the moon — or type help." },
  ]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, open]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: q }] }),
      });
      const j = await r.json();
      setMsgs((m) => [...m, { role: "agent", content: j.reply ?? "(no reply)", mint: j.coin?.mint }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "agent", content: `error: ${String(e?.message ?? e).slice(0, 120)}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-[min(92vw,380px)] border border-[var(--line)] bg-[#06070f]/98 backdrop-blur shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
            <span className="mono text-[10px] uppercase tracking-wider text-[var(--lime)]">clawpad agent</span>
            <button className="mono text-[10px] text-[var(--muted)] hover:text-[var(--fg)]" onClick={() => setOpen(false)}>close ✕</button>
          </div>

          <div ref={scroller} className="max-h-[46vh] min-h-[180px] space-y-2 overflow-y-auto p-3">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <div className={`inline-block max-w-[92%] whitespace-pre-wrap border px-2 py-1.5 text-[12px] leading-relaxed ${
                  m.role === "user"
                    ? "border-[var(--lime)]/40 bg-[var(--lime)]/10 text-[var(--fg)]"
                    : "border-[var(--line)] bg-[#04050c] text-[var(--muted)]"
                }`}>
                  {m.content}
                  {m.mint && (
                    <a className="mt-1 block text-[var(--cyan)] underline" target="_blank" rel="noreferrer"
                      href={`https://explorer.solana.com/address/${m.mint}?cluster=devnet`}>explorer ↗</a>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="mono text-[11px] text-[var(--muted)]">agent working… (branding + logo + mint)</div>}
          </div>

          <div className="flex flex-wrap gap-1 px-3 pb-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-[var(--line)] p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
              placeholder="launch <idea> · trends · coins · status"
              className="w-full bg-[#04050c] border border-[var(--line)] px-2 py-2 mono text-[12px] outline-none focus:border-[var(--lime)]"
            />
            <button className="btn btn-forge mono text-[10px]" disabled={busy} onClick={() => send(input)}>send</button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="btn btn-forge mono text-[10px] shadow-lg"
        title="CLAWPAD agent"
      >
        {open ? "▾ agent" : "✦ agent"}
      </button>
    </div>
  );
}
