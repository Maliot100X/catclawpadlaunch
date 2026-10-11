"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useEffect, useState } from "react";

export function WalletBar() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [sol, setSol] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setSol(null);
      return;
    }
    let alive = true;
    connection.getBalance(publicKey).then((b) => {
      if (alive) setSol(b / LAMPORTS_PER_SOL);
    });
    return () => {
      alive = false;
    };
  }, [publicKey, connection]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <WalletMultiButton
        style={{
          background: "#0d1117",
          border: "1px solid #1e2a38",
          borderRadius: 2,
          fontSize: 12,
          height: 36,
          fontFamily: "ui-monospace, monospace",
        }}
      />
      {publicKey && (
        <span className="text-xs text-claw-muted">
          {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
          {sol != null && <span className="text-claw-ok ml-2">{sol.toFixed(4)} SOL</span>}
        </span>
      )}
    </div>
  );
}
