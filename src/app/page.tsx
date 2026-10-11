import Link from "next/link";
import { CREDIT_MARKET, RETAIL_PER_1M } from "@/lib/cluster";

export default function HomePage() {
  const rows = [
    { name: "Claude Sonnet 4", retail: 15 },
    { name: "Grok 4", retail: 15 },
    { name: "GPT-4o", retail: 10 },
    { name: "Gemini 2.5 Pro", retail: 10 },
    { name: "DeepSeek V3.1", retail: 1 },
  ];
  return (
    <div className="space-y-10">
      <section className="panel p-6">
        <p className="kicker">flow</p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
          {[
            ["01", "model tokens", "Stake model tokens from launchpad projects"],
            ["02", "trading agents", "Agents generate protocol fees"],
            ["03", "LLM credits", "From stake + fees → redeem"],
            ["04", "API key", "Credits unlock sk-claw- access"],
            ["05", "main pool → SOL", "Fees flow to stakers"],
          ].map(([n, t, d]) => (
            <li key={n} className="border border-claw-border p-3">
              <span className="text-claw-accent">{n}</span>
              <div className="font-bold text-claw-cyan">{t}</div>
              <p className="mt-1 text-claw-muted text-xs">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel p-6">
        <p className="kicker">cost / 1M output</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-claw-muted">
              <tr>
                <th className="py-2">model</th>
                <th>direct</th>
                <th>market 60%</th>
                <th>staker</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-t border-claw-border">
                  <td className="py-2">{r.name}</td>
                  <td>${r.retail.toFixed(2)}</td>
                  <td className="text-claw-gold">${(r.retail * CREDIT_MARKET.builderPct).toFixed(2)}</td>
                  <td className="text-claw-ok">$0.00</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-claw-muted">
          save ~40% at market · earners sell {CREDIT_MARKET.earnerPct * 100}% · builders buy {CREDIT_MARKET.builderPct * 100}% · retail {CREDIT_MARKET.retailPct * 100}%
        </p>
      </section>

      <section className="panel p-6">
        <p className="kicker">api in 4 steps</p>
        <ol className="mt-3 space-y-2 text-sm list-decimal list-inside">
          <li>connect wallet (Solana, no email)</li>
          <li>get LLM credits (stake, agent, buy)</li>
          <li>create key (sk-claw-)</li>
          <li>
            call any model —{" "}
            <code className="text-claw-cyan">POST /api/public/v1/chat/completions</code>
          </li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="btn-hot" href="/launch">
            launch token
          </Link>
          <Link className="btn" href="/api">
            api console
          </Link>
          <Link className="btn" href="/market">
            credits market
          </Link>
        </div>
      </section>
    </div>
  );
}
