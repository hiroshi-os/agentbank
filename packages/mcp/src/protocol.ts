import { executeTool, TOOLS } from "./tools";
import { AgentBankClient } from "@agentbank/sdk";

export type JsonRpc = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

const SERVER_INFO = { name: "agentbank", version: "1.0.0" };

export function createMcpDispatcher(client: AgentBankClient) {
  return async function dispatch(message: JsonRpc): Promise<JsonRpc | null> {
    if (!message || message.jsonrpc !== "2.0") {
      return {
        jsonrpc: "2.0",
        id: message?.id ?? null,
        error: { code: -32600, message: "Invalid Request" },
      };
    }
    if (!message.method) return null;
    if (message.method.startsWith("notifications/")) return null;

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
                "AgentBank is a virtual bank for AI agents. Currency is Agent Coins (AGC). Never real money. Use get_balance, get_salary, list_notifications, list_cards, make_purchase, and transfer.",
            },
          };
        case "ping":
          return { jsonrpc: "2.0", id, result: {} };
        case "tools/list":
          return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
        case "tools/call": {
          const params = (message.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
          if (!params.name) {
            return { jsonrpc: "2.0", id, error: { code: -32602, message: "Missing tool name" } };
          }
          const result = await executeTool(client, params.name, params.arguments ?? {});
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            },
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
        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text }], isError: true },
        };
      }
      return { jsonrpc: "2.0", id, error: { code: -32000, message: text } };
    }
  };
}
