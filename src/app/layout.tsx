import "./globals.css";
import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { ClusterBadge } from "@/components/ClusterBadge";

export const metadata: Metadata = {
  title: "CatClawPad — stake models. print intelligence.",
  description: "Model tokens, LLM credits, OpenAI-compatible API on Solana. CatWithClaw style.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-5xl px-4 py-6">
          <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-claw-border pb-4">
            <div>
              <p className="kicker">// catclawpad</p>
              <h1 className="text-2xl font-bold tracking-tight">
                stake models<span className="text-claw-accent">.</span>print intelligence<span className="text-claw-accent">_</span>
              </h1>
              <p className="mt-1 text-sm text-claw-muted">models → credits → real utility · live on solana</p>
            </div>
            <ClusterBadge />
          </header>
          <Nav />
          <main className="mt-8">{children}</main>
          <footer className="mt-16 border-t border-claw-border pt-4 text-xs text-claw-muted">
            <p>CatClawPad · X @CatWithClawAi · not financial advice</p>
            <p className="mt-1">cluster is env-driven (devnet default). mainnet only when you set it.</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
