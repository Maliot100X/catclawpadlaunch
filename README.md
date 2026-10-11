# CatClawPad

llmpad.tech-style launchpad: model tokens → LLM credits → OpenAI-compatible API on Solana.

## Cluster policy
- Default **devnet**
- Also supports **testnet**
- **mainnet-beta** only via env switch — never the permanent default

```bash
NEXT_PUBLIC_CLUSTER=devnet   # or testnet | mainnet-beta
```

## Local
```bash
cp .env.example .env.local
npm i
npm test
npm run cluster:check
npm run dev   # http://localhost:3100
```

## Smoke API
```bash
# bootstrap key
curl -s localhost:3100/api/dev/bootstrap -H 'content-type: application/json' \
  -d '{"wallet":"dev1","credits":20}'

# chat
curl -s localhost:3100/api/public/v1/chat/completions \
  -H "Authorization: Bearer sk-claw-..." \
  -H 'content-type: application/json' \
  -d '{"model":"claude","messages":[{"role":"user","content":"gm"}]}'
```

## Routes
`/` `/launch` `/tokens` `/agents` `/market` `/api` `/llm`

## Do not
- Commit secrets
- Hardcode mainnet
- Paste API keys in chat
