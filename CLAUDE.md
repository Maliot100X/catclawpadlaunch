# CatClawPad

Solana LLM launchpad (llmpad.tech hybrid). **Devnet first.**

## Public
http://13.62.48.15:3100

## Stack
- Next.js 14 + Tailwind + Inter
- Three.js / React Three Fiber hero
- Solana wallet-adapter (Phantom, Solflare)
- OpenAI-compatible gateway `/api/public/v1/chat/completions`
- Firecrawl refs in `refs/`

## Commands
```bash
npm i
npm test
npm run build
sudo systemctl restart catclawpad
```

## Cluster
`NEXT_PUBLIC_CLUSTER=devnet|testnet|mainnet-beta`

See AGENTS.md + TOOLING.md
