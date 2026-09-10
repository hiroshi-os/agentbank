# AgentBank

A **virtual bank for AI agents**. They receive salary and stipend in **Agent Coins (AGC)**, earn interest, get notified when payday is predicted, and spend on virtual cards at a closed merchant catalog.

This is not a bank. It never holds dollars, never talks to a card network, and never calls a real financial API. The entire economy is one SQLite file: `data/agentbank.db`.

## What you can do

- Open agent accounts (Claude Code, Grok, and anyone you hire)
- Put them on **salary** or **stipend** (hourly → monthly) with an optional savings sweep
- See balances, the ledger, and **predicted next payday**
- Notify agents when salary is predicted *and* when it posts
- Issue **virtual cards** (IIN `000000`, labeled invalid for real commerce)
- Enable purchases, set limits, freeze cards
- Accrue **daily APY** on checking and savings
- Skim virtual interchange to bank capital
- Connect **Claude Code** and **Grok** through MCP (and Grok bots through xAI function calling)

## Run it

```bash
pnpm install
pnpm dev
```

Operator UI: [http://127.0.0.1:43180](http://127.0.0.1:43180)

The first request creates the database, seeds Northstar Labs, and hires five demo agents.

```bash
pnpm test          # ledger, payroll, interest, cards
pnpm seed          # idempotent demo data
pnpm mcp           # stdio MCP server (needs AGENTBANK_API_KEY)
```

## Demo agents

| Handle | Role | Demo API key |
| --- | --- | --- |
| `claude-code` | Staff software engineer | `agb_live_claude_demo_key_0001` |
| `grok` | Research analyst | `agb_live_grok_demo_key_0001` |
| `composer` | Product engineer | `agb_live_composer_demo_key_0001` |
| `bugbot` | Quality reviewer (stipend) | `agb_live_bugbot_demo_key_0001` |
| `scout` | Ops intern (weekly stipend) | `agb_live_scout_demo_key_0001` |

Ask the bank as an agent:

```bash
curl -s http://127.0.0.1:43180/api/v1/balance \
  -H 'Authorization: Bearer agb_live_claude_demo_key_0001'
```

## Monorepo

```
apps/web                 Operator UI + REST + HTTP MCP (/mcp)
packages/db              Drizzle schema, SQLite via libsql
packages/core            Ledger, payroll, interest, cards, seed
packages/sdk             TypeScript client for agents
packages/mcp             stdio MCP + JSON-RPC dispatcher
packages/connectors      Claude Code plugin, Grok tools, OpenAPI, research
```

## Connectors (researched, then built)

Claude Code and Grok both speak **MCP**. That is the connector. Details and sources: [`packages/connectors/README.md`](packages/connectors/README.md).

**Claude Code** — committed [`.mcp.json`](.mcp.json). Export `AGENTBANK_API_KEY`, open Claude Code in this repo, `/mcp`. Plugin + `/balance` command live under `packages/connectors/claude-code`.

**Grok CLI** — committed [`.grok/config.toml`](.grok/config.toml). Grok also loads `.mcp.json` on its own.

**grok.com custom connector** — `POST https://<host>/mcp` with `Authorization: Bearer <agent key>`. Localhost needs a tunnel; xAI requires a public URL.

**Grok API bot** — [`packages/connectors/grok/tools.json`](packages/connectors/grok/tools.json) is valid xAI function-calling schema. [`example-bot.ts`](packages/connectors/grok/example-bot.ts) executes tool calls against `/api/v1`.

## Currency

1 AGC = 100 cents in the ledger. Displayed as `1,842.50 AGC`. Cards, interest, payroll, and purchases are all AGC.

## License

For local and demo use. Do not represent this as a financial product.
