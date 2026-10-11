import { describe, expect, it } from "vitest";
import { launchTotalSol, LAUNCH_FEES, CREDIT_MARKET } from "./cluster";
import { createApiKey, creditWallet, deductCredits, resolveKey } from "./ledger";

describe("launch fees", () => {
  it("totals 0.58 SOL", () => {
    expect(LAUNCH_FEES.launchFeeSol).toBe(0.05);
    expect(LAUNCH_FEES.devBuySol).toBe(0.5);
    expect(LAUNCH_FEES.networkRentSol).toBe(0.03);
    expect(launchTotalSol()).toBeCloseTo(0.58);
  });
});

describe("credit market", () => {
  it("is 60%", () => {
    expect(CREDIT_MARKET.builderPct).toBe(0.6);
  });
});

describe("ledger + keys", () => {
  it("issues sk-claw- and bills 402 when empty", () => {
    const w = "test-w-" + Date.now();
    const { raw } = createApiKey(w);
    expect(raw.startsWith("sk-claw-")).toBe(true);
    expect(resolveKey(raw)?.wallet).toBe(w);
    const empty = deductCredits(w, 1);
    expect(empty.ok).toBe(false);
    creditWallet(w, 10);
    const ok = deductCredits(w, 1);
    expect(ok.ok).toBe(true);
  });
});
