"use client";
import { TopNav } from "./TopNav";
import { WalletProviders } from "./WalletProviders";
import { LiveTicker } from "./LiveTicker";
import { ChunkRecovery } from "./ChunkRecovery";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProviders>
      <ChunkRecovery />
      <TopNav />
      <LiveTicker />
      <div className="shell py-8">{children}</div>
      <footer className="border-t border-[var(--line)] py-8">
        <div className="shell flex flex-wrap justify-between gap-2 text-[11px] text-[var(--muted)] mono uppercase tracking-wider">
          <span>clawpad.wtf // viral becomes a coin</span>
          <span>@CatWithClawAi · not financial advice</span>
        </div>
      </footer>
    </WalletProviders>
  );
}
