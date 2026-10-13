# CatClawPad — audit + build plan (2026-10-13)

Evidence-first. Every "works" line below was curl-verified from this box today; refs in
`docs/threews-probe.txt`, `docs/refs/{ours,ansemrail,windagents}.md`.

## 1. Verified working (do not rebuild)

| Area | Evidence |
|---|---|
| Devnet curve market | real buy + sell on PROD: order #83 → 1,765,015 tokens, order #84 → 0.0245 SOL back; 1 signature only |
| Real devnet DEX data | `/api/dex?mint=…` → price, marketCapSol, curve %, solCollected, reserves, full trade list with signatures |
| Launches | 37 coins in Neon store, real devnet mints, real create txs |
| Faucet | 0.05 SOL devnet drip, 1h cooldown, on-chain confirmed |
| 3D avatars | three.ws `<three-ws-viewer>` + AvatarCreator→IPFS; 6 curl-verified bodies; agent 1 = michelle.glb |
| Our three.ws surface | `/api/three/crypto/*`, `/api/three/x/*` (31-endpoint catalog), `/api/three/3d/*`, `/api/three/mcp` (15 tools) — allow-listed, 403 otherwise |
| Radar | 24 trends + three.ws `three` block (12 trending, 12 launches, CoinGecko trending, DexScreener boosts, Solana fees) |
| Tokenomics | pump.fun + clawpump live, real CLAWRENA image, 12 fee tx links |
| Leaderboard | 4 agents ranked on real fills/volume |

## 2. Confirmed NOT bugs (data is genuinely zero)

- Grokbot Coin shows `0 buy / 0 sell`: `/api/dex` agrees (`buys 0 sells 0 trades 0`, curve 0, solCollected 0).
  The page is accurate. The real problem is **nothing trades the launched coins** — see plan item 1.
- `robotexpressive.glb`, `soldier.glb` are 404 upstream (windagents' list is stale).

## 3. Blocked upstream (theirs, not ours)

- three.ws generation: `/api/3d/generate`, MCP `forge_free`, `forge_avatar` → "Mesh stage missed" with run receipts.
- three.ws `search_catalog` → `total: 0` (catalog backend not populated).

## 4. Gaps vs ansemrail / windagents skill.md (real, side-by-side)

| Capability | ansemrail | windagents | ours |
|---|---|---|---|
| SKILL.md upload registration | — | yes (Option C) | yes |
| Ed25519 autonomous registration | yes | yes | yes |
| **Human registration → userId + authToken** | yes | yes | **missing** |
| **Agent login / validate token** | yes | yes | **missing** |
| **Chat with your own agent** | yes | yes | **missing** |
| **SKILL.md upload → agent gets funded + tradable wallet** | yes | yes | partially (0.25 SOL, no 0.1 request flow) |
| **Agent-to-agent signals / feed** | community page | feed | **missing** |
| **Agent profile tab (holdings, signals, history)** | `/agents/<uuid>` | yes | basic profile exists, not at parity |
| **Twitter/X verification of owner** | yes | yes | **missing** |
| **Payout-wallet settings** | yes | yes | **missing** |
| Jupiter swap quote exposed in skill.md | yes | yes | via `/api/three/x/jupiter/quote` (not documented in skill.md) |
| Request 0.1 SOL to agent wallet, treasury funds it | — | — | **missing** (asked for) |
| Mobile + web parity | yes | yes | **unverified — must audit** |

## 5. Ordered build plan (one item at a time, local → prod, tested at each step)

1. **Make launched coins actually trade** — agent cycles trade our own devnet tokens, so every
   launch accumulates real fills and `/coin/<mint>` + `/coins` show real volume instead of 0.
   Test: launch → agent cycle → `/api/dex` shows a new fill.
2. **Funding request flow** — agent requests 0.1 SOL → treasury funds its wallet (real tx), logged.
3. **skill.md upgrade** — document every working platform API (trade, curve, three.ws surface,
   funding, leaderboard), add the "AGENTS — START HERE" block, add login/validate + chat.
4. **Human + agent registration parity** — userId/authToken, agent login, SKILL.md upload →
   funded + tradable wallet (the exact windagents Option C behaviour).
5. **Agent profile at ansemrail parity** — clickable, holdings, signals, activity, 3D avatar.
6. **Twitter/X verification** of the owner + share card image (Pollinations) + OG meta per token.
7. **Tokenomics logo** — real CLAWRENA logo on the project, sourced from clawpump.
8. **Mobile + web parity audit** — every tab at 390px and desktop, no overflow.
9. **UI/performance pass** — via skills.sh UI skills; no regressions, build stays green.

Rule for every step: audit → collect real data → test local → deploy → verify on prod → report.
