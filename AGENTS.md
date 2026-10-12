# CatClawPad agent rules

## Cluster order
devnet → testnet → mainnet-beta. Never hardcode mainnet as default.

## Solana work
Use Solana MCP / docs tools when available:
- list_sections
- get_documentation
- Solana_Documentation_Search
- Solana_Expert__Ask_For_Help
- program_autofixer (after Rust program edits)

Prefer https://mcp.solana.com/mcp and https://solana.com/docs over memory.

## UI
Match llmpad.tech hybrid: Inter body, mono labels (`//`), green accent, sticky header, 3D hero (R3F).
Public URL: http://13.62.48.15:3100 (do not steal ports 80/443/8081/20128).

## Secrets
Never commit .env.local, keypairs, or chat-pasted tokens. Authority keypair: dev-wallets/ (gitignored).

## Tooling expected in this repo
See TOOLING.md
