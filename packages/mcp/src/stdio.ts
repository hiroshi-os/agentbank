#!/usr/bin/env tsx
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AgentBankClient } from "@agentbank/sdk";
import { executeTool } from "./tools";

function clientFromEnv() {
  const baseUrl = process.env.AGENTBANK_BASE_URL ?? "http://127.0.0.1:43180";
  const apiKey = process.env.AGENTBANK_API_KEY;
  if (!apiKey) {
    console.error("AGENTBANK_API_KEY is required for the AgentBank MCP server.");
    process.exit(1);
  }
  return new AgentBankClient({ baseUrl, apiKey });
}

async function textResult(name: string, args: Record<string, unknown>) {
  const client = clientFromEnv();
  try {
    const result = await executeTool(client, name, args);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: error instanceof Error ? error.message : "Tool failed" }],
      isError: true,
    };
  }
}

async function main() {
  const server = new McpServer({
    name: "agentbank",
    version: "1.0.0",
  });

  server.tool("get_balance", "Get this agent's AgentBank balances in Agent Coins (virtual only).", async () =>
    textResult("get_balance", {}),
  );
  server.tool("get_me", "Identify the authenticated agent and purchase permissions.", async () => textResult("get_me", {}));
  server.tool(
    "list_transactions",
    "List recent salary, interest, purchase, and transfer activity.",
    { limit: z.number().int().min(1).max(100).optional() },
    async ({ limit }) => textResult("list_transactions", { limit }),
  );
  server.tool("get_salary", "Get stipend/salary schedules and the predicted next payday.", async () =>
    textResult("get_salary", {}),
  );
  server.tool(
    "list_notifications",
    "List payday predictions, deposits, card events, and purchase receipts.",
    { unreadOnly: z.boolean().optional() },
    async ({ unreadOnly }) => textResult("list_notifications", { unreadOnly }),
  );
  server.tool(
    "mark_notification_read",
    "Mark a notification as read.",
    { id: z.string() },
    async ({ id }) => textResult("mark_notification_read", { id }),
  );
  server.tool("list_cards", "List virtual Agent Coin cards. Not valid for real commerce.", async () =>
    textResult("list_cards", {}),
  );
  server.tool("list_merchants", "List virtual merchants that accept Agent Coins.", async () =>
    textResult("list_merchants", {}),
  );
  server.tool(
    "make_purchase",
    "Pay a virtual merchant in Agent Coins with this agent's card.",
    {
      amountAgc: z.number().positive(),
      merchantSlug: z.string().optional(),
      merchantId: z.string().optional(),
      memo: z.string().optional(),
      cardId: z.string().optional(),
    },
    async (args) => textResult("make_purchase", args),
  );
  server.tool(
    "transfer",
    "Move Agent Coins between checking/savings or to another agent by handle.",
    {
      amountAgc: z.number().positive(),
      toHandle: z.string().optional(),
      from: z.enum(["checking", "savings"]).optional(),
      to: z.enum(["checking", "savings"]).optional(),
      memo: z.string().optional(),
    },
    async (args) => textResult("transfer", args),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
