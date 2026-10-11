"use client";

import { useEffect, useState } from "react";

export default function AgentsPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);
  return (
    <div className="space-y-4">
      <p className="kicker">engine 02</p>
      <h2 className="text-xl font-bold">Trading agents</h2>
      <p className="text-sm text-claw-muted max-w-xl">
        Deploy an AI agent, fund it with SOL, let it trade memecoins. Profits pay out as LLM credits — use them or sell
        to the main pool.
      </p>
      <div className="panel p-6">
        <p className="text-claw-gold">no agents yet — be the first_</p>
        <div className="mt-4 border border-claw-border p-4">
          <p className="font-bold text-claw-accent">new agents paused_</p>
          <p className="mt-2 text-sm text-claw-muted">
            {data?.message || "deploying new trading agents is closed for now. existing owners can withdraw anytime."}
          </p>
        </div>
      </div>
    </div>
  );
}
