/** Jupiter lite quote API — works without key for public quotes */
export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // mainnet USDC

const JUP_QUOTE = process.env.JUPITER_QUOTE_URL || "https://lite-api.jup.ag/swap/v1/quote";
const JUP_SWAP = process.env.JUPITER_SWAP_URL || "https://lite-api.jup.ag/swap/v1/swap";

export type QuoteResult = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct?: string;
  routePlan?: unknown;
  raw: unknown;
};

export async function getQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: number | string;
  slippageBps?: number;
}): Promise<QuoteResult> {
  const q = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: String(params.amount),
    slippageBps: String(params.slippageBps ?? 50),
  });
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.JUPITER_API_KEY) headers["x-api-key"] = process.env.JUPITER_API_KEY;

  const r = await fetch(`${JUP_QUOTE}?${q}`, { headers, next: { revalidate: 0 } });
  const raw = await r.json();
  if (!r.ok) throw new Error(raw?.error || raw?.message || `quote ${r.status}`);
  return {
    inputMint: raw.inputMint,
    outputMint: raw.outputMint,
    inAmount: raw.inAmount,
    outAmount: raw.outAmount,
    priceImpactPct: raw.priceImpactPct,
    routePlan: raw.routePlan,
    raw,
  };
}

/** Build swap transaction (user signs). Mainnet mints. */
export async function buildSwapTransaction(params: {
  quoteResponse: unknown;
  userPublicKey: string;
}): Promise<{ swapTransaction: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (process.env.JUPITER_API_KEY) headers["x-api-key"] = process.env.JUPITER_API_KEY;
  const r = await fetch(JUP_SWAP, {
    method: "POST",
    headers,
    body: JSON.stringify({
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    }),
  });
  const data = await r.json();
  if (!r.ok || !data.swapTransaction) throw new Error(data?.error || data?.message || `swap ${r.status}`);
  return { swapTransaction: data.swapTransaction };
}

export function formatOut(amount: string, decimals = 6): string {
  const n = Number(amount) / 10 ** decimals;
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
