# Building Grok bot connectors and Claude Code connectors for AgentBank

AgentBank treats Grok and Claude Code as first-class account holders. Both products speak **MCP (Model Context Protocol)**. That is the connector to ship. Function calling is the fallback for a self-hosted Grok bot that does not load MCP.

This note is the researched, current path — not a sketch.

## What “connector” means in 2026

| Surface | Official mechanism | AgentBank ships |
| --- | --- | --- |
| **Claude Code** | MCP servers in `.mcp.json`, `~/.claude.json`, or a plugin (`.claude-plugin/plugin.json` + plugin-root `.mcp.json`). `claude mcp add`. HTTP (`type: "http"` / `streamable-http`) or stdio. Env expansion `${VAR}`. | Project `.mcp.json`, Claude Code plugin under `packages/connectors/claude-code`, slash command `/balance`, skill `agentbank`, marketplace catalog `.claude-plugin/marketplace.json` |
| **Grok (grok.com)** | Custom MCP connectors at [grok.com/connectors](https://grok.com/connectors) → New Connector → Custom. Public HTTPS MCP URL + auth. | Streamable-style JSON-RPC at `POST /mcp` with `Authorization: Bearer <agent api key>` |
| **Grok CLI** | `grok mcp add`, project `.grok/config.toml`, and **Grok also loads `.mcp.json` / `.cursor/mcp.json`**. Tools namespaced `server__tool`. | `.grok/config.toml` + the same stdio server |
| **Grok API bots** | xAI [function calling](https://docs.x.ai/developers/tools/function-calling) on `https://api.x.ai/v1` (`tools` array, model returns `tool_calls`, you execute locally) | `packages/connectors/grok/tools.json` + `example-bot.ts` that executes against AgentBank REST |

Sources used while building this:

- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/mcp-quickstart
- https://code.claude.com/docs/en/plugins-reference
- https://docs.x.ai/grok/connectors
- https://docs.x.ai/build/features/mcp-servers
- https://docs.x.ai/developers/tools/function-calling

## Claude Code — recommended setup

From the repo root, with the bank running on port 43180:

```bash
export AGENTBANK_API_KEY=agb_live_claude_demo_key_0001
export AGENTBANK_BASE_URL=http://127.0.0.1:43180
```

The committed `.mcp.json` is enough. Start a new Claude Code session in this repo. Confirm with `/mcp`.

Install as a plugin (skills + slash command + MCP):

```text
/plugin marketplace add .
/plugin install agentbank@agentbank-connectors
```

stdio server command (what the plugin and `.mcp.json` run):

```bash
pnpm --filter @agentbank/mcp start
```

HTTP alternative (useful if Claude Code is remote):

```json
{
  "mcpServers": {
    "agentbank": {
      "type": "http",
      "url": "http://127.0.0.1:43180/mcp",
      "headers": {
        "Authorization": "Bearer ${AGENTBANK_API_KEY}"
      }
    }
  }
}
```

## Grok — three ways, in order of preference

### 1. Grok CLI (local, same as Claude Code)

```bash
export AGENTBANK_API_KEY=agb_live_grok_demo_key_0001
grok mcp add --scope project agentbank -- pnpm --filter @agentbank/mcp start
grok mcp doctor agentbank
```

Or rely on the committed `.grok/config.toml` / `.mcp.json`. In the TUI, `/mcps` toggles the server. Tools appear as `agentbank__get_balance`.

### 2. grok.com custom MCP connector

Requirements from xAI: the MCP server must be on the public internet. Localhost needs a tunnel.

1. Run AgentBank so `POST /mcp` is live.
2. Tunnel if needed (`cloudflared`, `ngrok`, …).
3. grok.com/connectors → New Connector → Custom.
4. URL: `https://<host>/mcp`
5. Auth header: `Authorization: Bearer agb_live_grok_demo_key_0001`

Grok discovers `tools/list` and will call `get_salary`, `make_purchase`, etc. in conversation.

### 3. Self-hosted Grok bot (function calling)

Use when you own the model loop (a bot process, a Discord/X worker, an internal agent).

1. Pass `packages/connectors/grok/tools.json` as `tools` on `chat.completions` or the Responses API.
2. When Grok returns `tool_calls`, execute them with `AgentBankClient` (see `example-bot.ts`).
3. Send `role: tool` results back and sample again.
4. Custom tools pause on your side; xAI built-ins (web search, X search) run on theirs. You can mix both.

The xAI schema root **must** be a JSON object (or a union of objects). AgentBank tools follow that rule.

## Auth model

Every agent has an API key (`agb_live_…`) stored as a SHA-256 hash in the same SQLite file as the ledger. Demo keys are seeded:

| Agent | Key |
| --- | --- |
| Claude Code | `agb_live_claude_demo_key_0001` |
| Grok | `agb_live_grok_demo_key_0001` |
| Composer | `agb_live_composer_demo_key_0001` |
| Bugbot | `agb_live_bugbot_demo_key_0001` |
| Scout | `agb_live_scout_demo_key_0001` |

Rotate keys from the agent dossier in the operator UI. Stdio MCP reads `AGENTBANK_API_KEY`. HTTP MCP reads `Authorization`.

## Why one MCP server covers both products

Claude Code and Grok both speak MCP. Grok CLI even **merges** Claude and Cursor MCP configs. Shipping two protocols would drift. AgentBank therefore has:

1. `packages/mcp` stdio server (`@modelcontextprotocol/sdk`) for local Claude Code / Grok CLI.
2. `POST /mcp` JSON-RPC (`initialize`, `tools/list`, `tools/call`, `ping`) for grok.com custom connectors and remote Claude Code.
3. Identical tool names and payloads as the REST API (`/api/v1/*`) and the TypeScript SDK.

If a vendor adds OAuth for remote MCP later, put the bearer token in front of `/mcp`. The handler already threads `Authorization` through to the agent key.
