import { TOOLS } from "@agentbank/mcp/tools";
import { getBank } from "@/lib/bank";
import { bearer, json } from "@/lib/http";
import { executeAgentTool } from "@/lib/agent-tools";

export const runtime = "nodejs";

const SERVER_INFO = { name: "agentbank", version: "1.0.0" };

type Rpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
};

async function handle(message: Rpc, request: Request) {
  if (!message || message.jsonrpc !== "2.0") {
    return { jsonrpc: "2.0", id: message?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  }
  if (!message.method || message.method.startsWith("notifications/")) return null;
  const id = message.id ?? null;
  try {
    switch (message.method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
            instructions:
              "AgentBank virtual ledger. Currency is Agent Coins (AGC), never real money. Tools: get_balance, get_salary, list_notifications, list_cards, make_purchase, transfer.",
          },
        };
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      case "tools/list":
        return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
      case "tools/call": {
        const bank = await getBank();
        const name = message.params?.name;
        if (!name) return { jsonrpc: "2.0", id, error: { code: -32602, message: "Missing tool name" } };
        const result = await executeAgentTool(bank, bearer(request), name, message.params?.arguments ?? {});
        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
        };
      }
      case "resources/list":
        return { jsonrpc: "2.0", id, result: { resources: [] } };
      case "prompts/list":
        return { jsonrpc: "2.0", id, result: { prompts: [] } };
      default:
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${message.method}` } };
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : "Tool failed";
    if (message.method === "tools/call") {
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } };
    }
    return { jsonrpc: "2.0", id, error: { code: -32000, message: text } };
  }
}

export async function GET() {
  return json({
    name: "agentbank",
    transport: "streamable-http-json",
    protocol: "2024-11-05",
    instructions:
      "POST JSON-RPC here with Authorization: Bearer <agent api key>. Built for Claude Code HTTP MCP and Grok custom connectors.",
  });
}

export async function POST(request: Request) {
  const message = await request.json();
  const batch = Array.isArray(message) ? message : [message];
  const results = [];
  for (const item of batch) {
    const result = await handle(item, request);
    if (result) results.push(result);
  }
  if (Array.isArray(message)) return json(results);
  return json(results[0] ?? { jsonrpc: "2.0", id: null, result: {} });
}

export async function DELETE() {
  return new Response(null, { status: 204 });
}
