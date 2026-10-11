"use client";

import { WalletProviders } from "./WalletProviders";
import { WalletBar } from "./WalletBar";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProviders>
      <div className="mb-2 flex justify-end">
        <WalletBar />
      </div>
      {children}
    </WalletProviders>
  );
}
