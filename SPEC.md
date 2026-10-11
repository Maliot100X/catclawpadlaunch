# CatClawPad — llmpad.tech clone (CatWithClaw style)

## Cluster policy (hard rule)
- Default: `CLUSTER=devnet`
- Supported: `devnet` | `testnet` | `mainnet-beta`
- Never hardcode mainnet program IDs or fee wallets as the only path
- Switch via env only: `NEXT_PUBLIC_CLUSTER` + `SOLANA_RPC_URL`

## Product
- Stake model tokens → LLM credits → OpenAI-compatible API
- Launch model-family coins on pump.fun (0.58 SOL: 0.05 fee + 0.5 dev buy + 0.03 rent)
- Credits market: builders/earners 60% of retail, retail 100%
- Trading agents (paused at launch, like LLMPad)
- Routes: `/` `/launch` `/tokens` `/agents` `/market` `/api` `/llm`

## Decisions (defaults until you override)
- Key prefix: `sk-claw-`
- 60% rule: yes
- Day-1 families: Claude, ChatGPT, Grok, DeepSeek, Nous (expand to 48 later)
- Agents: paused at launch
- Authority wallet: generate fresh devnet keypair in env (replace later)

## Stack
Next.js 14 App Router + Tailwind + Solana wallet-adapter + Postgres (Neon) + Helius RPC

## Secrets
Never commit. Use `.env.local` only. Do not paste tokens in chat.
