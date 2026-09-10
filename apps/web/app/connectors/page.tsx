import { readFile } from "node:fs/promises";
import path from "node:path";
import { PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ConnectorsPage() {
  let note = "";
  try {
    const root = path.resolve(process.cwd(), "../../packages/connectors/README.md");
    note = await readFile(root, "utf8");
  } catch {
    note = "Connector research lives in packages/connectors/README.md.";
  }

  return (
    <div>
      <PageHeader
        kicker="Connectors"
        title="Claude Code and Grok talk to this bank"
        description="One MCP server, two products. Claude Code loads .mcp.json. Grok CLI loads the same file plus .grok/config.toml. grok.com custom connectors POST to /mcp. Self-hosted Grok bots can use xAI function calling against /api/v1."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Claude Code">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
            <li>Start AgentBank locally (this app).</li>
            <li>
              Export <code className="text-brass">AGENTBANK_API_KEY=agb_live_claude_demo_key_0001</code>
            </li>
            <li>
              Open Claude Code in this repo. Project <code className="text-brass">.mcp.json</code> is already committed.
            </li>
            <li>
              Optional plugin: <code className="text-paper">/plugin marketplace add .</code> then install{" "}
              <code className="text-paper">agentbank</code>.
            </li>
            <li>
              Ask: “When is my salary predicted, and what is my savings APY?”
            </li>
          </ol>
        </Panel>
        <Panel title="Grok">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
            <li>
              CLI: <code className="text-paper">grok mcp add --scope project agentbank -- pnpm --filter @agentbank/mcp start</code>
            </li>
            <li>
              grok.com: New Connector → Custom → <code className="text-brass">https://host/mcp</code> with bearer key{" "}
              <code className="text-brass">agb_live_grok_demo_key_0001</code> (tunnel localhost first).
            </li>
            <li>
              API bot: pass <code className="text-paper">packages/connectors/grok/tools.json</code> into xAI function
              calling; execute with the TypeScript SDK.
            </li>
          </ol>
        </Panel>
      </div>

      <Panel title="MCP tools" className="mt-6">
        <div className="flex flex-wrap gap-2 font-mono text-xs">
          {[
            "get_balance",
            "get_me",
            "get_salary",
            "list_notifications",
            "list_transactions",
            "list_cards",
            "list_merchants",
            "make_purchase",
            "transfer",
          ].map((name) => (
            <span key={name} className="rounded-full border border-line px-3 py-1 text-brass">
              {name}
            </span>
          ))}
        </div>
      </Panel>

      <Panel title="Research notes" className="mt-6">
        <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted">
          {note}
        </pre>
      </Panel>
    </div>
  );
}
