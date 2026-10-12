# Tooling audit — honest

## What YOU asked for vs what is actually on this box (2026-10-11)

| Tool / skill | Status | Notes |
|--------------|--------|-------|
| Firecrawl CLI | **INSTALLED NOW** v1.26.3 + 28 skills | scrape/map of llmpad → `refs/` |
| Solana dev skill | **YES** `~/.agents/skills/solana-dev` | |
| frontend-design skill | **YES** Hermes skills | |
| design-taste / web-guidelines | **Partial** | global install fails PromptScript; skill may still symlink under agents |
| three.js + R3F + drei | **YES** in package.json | HeroScene 3D |
| framer-motion + lucide | **YES** | |
| Solana web3 + wallet adapters | **YES** | Phantom/Solflare |
| Solana MCP config | **ADDED** `.cursor/mcp.json` + project note | runtime MCP needs client support |
| Vercel / gh CLI | **YES** on box (auth) | deploy not run until you say |
| SEO skill suite | **NOT installed** as separate packs | can add on request |
| X/sparX skills | **NOT installed** | |
| Railway | **NOT used** | |
| Neon / Pinata / Jupiter / Helius | keys only in env when set | Helius RPC wired for devnet |
| Full 48-family launch UI | **5 day-1 families** | expand next |
| Real pump.fun create | **MOCK** after real 0.58 fund tx | |
| Neon Postgres ledger | **in-memory** | |

## Previously skipped (true)
- Firecrawl was missing until this session
- Skills.sh global install often fails PromptScript — skills still land under `~/.agents/skills`
- Did not install every named SEO/X pack
- UI started as thin Tailwind; now Inter + R3F hero + llmpad layout clone

## In project now
- `three` `@react-three/fiber` `@react-three/drei` `framer-motion` `lucide-react`
- `firecrawl` CLI available; refs scraped
- Port **3100** public only
