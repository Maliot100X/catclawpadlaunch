# Decisions locked for scaffold

| Q | Answer |
|---|--------|
| Authority wallet | Fresh per-launch dev wallets (Keypair.generate). Main pool authority TBD when you fund devnet. |
| Key prefix | `sk-claw-` |
| 60% market rule | Yes |
| Day-1 families | Claude, ChatGPT, Grok, DeepSeek, Nous |
| Agents | Paused at launch |

## Cluster
- Default `NEXT_PUBLIC_CLUSTER=devnet`
- `testnet` supported via same env
- `mainnet-beta` only by flipping env — not hardcoded

## Secrets policy
- Do not commit `.env.local`
- Do not use tokens pasted in Telegram chat (rotate those)
- Use existing `gh` / `vercel` CLI auth on this box when deploying
- Helius / Pinata / Jupiter / Neon: put in `.env.local` yourself on the box

## Verified locally 2026-10-11
- `npm test` 3/3 pass (0.58 SOL math, 60%, ledger 402)
- `npm run build` OK
- `npm run cluster:check` → devnet slot live
- smoke: bootstrap key, chat completions, invalid key 401, launch create fund_address, pages 200
