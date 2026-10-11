"use client";

import { useState } from "react";

export default function ApiPage() {
  const [wallet, setWallet] = useState("devnet-test-wallet");
  const [boot, setBoot] = useState<any>(null);
  const [chat, setChat] = useState("");
  const [reply, setReply] = useState("");

  async function bootstrap() {
    const r = await fetch("/api/dev/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet, credits: 50 }),
    });
    setBoot(await r.json());
  }

  async function tryChat() {
    if (!boot?.api_key) return;
    const r = await fetch("/api/public/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${boot.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude",
        messages: [{ role: "user", content: chat || "gm" }],
        max_tokens: 64,
      }),
    });
    setReply(JSON.stringify(await r.json(), null, 2));
  }

  return (
    <div className="space-y-4">
      <p className="kicker">api console</p>
      <h2 className="text-xl font-bold">One key, every model.</h2>
      <p className="text-sm text-claw-muted">
        Connect a Solana wallet to see LLM credit balance and generate an API key. Local bootstrap issues a test key
        (devnet).
      </p>
      <div className="panel p-4 space-y-3">
        <input
          className="w-full bg-claw-bg border border-claw-border px-2 py-2 text-sm"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="wallet"
        />
        <button type="button" className="btn-hot" onClick={bootstrap}>
          bootstrap credits + sk-claw- key
        </button>
        {boot && (
          <div className="text-xs space-y-1">
            <p>
              credits: <span className="text-claw-ok">{boot.credits}</span>
            </p>
            <p className="break-all">
              key: <span className="text-claw-cyan">{boot.api_key}</span>
            </p>
          </div>
        )}
      </div>
      <div className="panel p-4 space-y-3">
        <p className="kicker">try completion</p>
        <input
          className="w-full bg-claw-bg border border-claw-border px-2 py-2 text-sm"
          value={chat}
          onChange={(e) => setChat(e.target.value)}
          placeholder="gm"
        />
        <button type="button" className="btn" onClick={tryChat} disabled={!boot?.api_key}>
          POST /api/public/v1/chat/completions
        </button>
        {reply && <pre className="text-xs text-claw-muted whitespace-pre-wrap overflow-x-auto">{reply}</pre>}
      </div>
      <pre className="panel p-3 text-xs text-claw-muted overflow-x-auto">{`curl $ORIGIN/api/public/v1/chat/completions \\
  -H "Authorization: Bearer sk-claw-..." \\
  -H "Content-Type: application/json" \\
  -d '{"model":"claude","messages":[{"role":"user","content":"gm"}]}'`}</pre>
    </div>
  );
}
