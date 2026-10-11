"use client";

import React, { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import "@solana/wallet-adapter-react-ui/styles.css";

export function WalletProviders({ children }: { children: React.ReactNode }) {
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    (process.env.NEXT_PUBLIC_CLUSTER === "testnet"
      ? "https://api.testnet.solana.com"
      : process.env.NEXT_PUBLIC_CLUSTER === "mainnet-beta"
        ? "https://api.mainnet-beta.solana.com"
        : "https://api.devnet.solana.com");

  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  const Conn = ConnectionProvider as React.FC<any>;
  const Wal = WalletProvider as React.FC<any>;
  const Modal = WalletModalProvider as React.FC<any>;

  return (
    <Conn endpoint={endpoint}>
      <Wal wallets={wallets} autoConnect>
        <Modal>{children}</Modal>
      </Wal>
    </Conn>
  );
}
