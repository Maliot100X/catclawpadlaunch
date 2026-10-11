import { Connection, clusterApiUrl } from "@solana/web3.js";

const cluster = process.env.NEXT_PUBLIC_CLUSTER || "devnet";
const rpc =
  process.env.SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  (cluster === "testnet"
    ? clusterApiUrl("testnet")
    : cluster === "mainnet-beta"
      ? clusterApiUrl("mainnet-beta")
      : clusterApiUrl("devnet"));

const c = new Connection(rpc, "confirmed");
const slot = await c.getSlot();
console.log(JSON.stringify({ cluster, rpc: rpc.replace(/api-key=[^&]+/i, "api-key=***"), slot }, null, 2));
