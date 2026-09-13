import { AgentBankClient } from "@agentbank/sdk";

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
};

export const TOOLS: ToolDef[] = [
  {
    name: "get_balance",
    description:
      "Get this agent's AgentBank balances in Agent Coins (AGC). Virtual currency only — never real money.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_me",
    description: "Identify the authenticated agent: name, role, org, purchase permissions, and account ids.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_transactions",
    description: "List recent ledger activity: salary, stipend, interest, purchases, transfers.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, description: "How many rows to return (default 20)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_salary",
    description:
      "Get salary/stipend schedules and the predicted next payday with amount. Use this when the agent asks when they get paid.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_notifications",
    description: "List bank notifications, including predicted payday alerts and deposit receipts.",
    inputSchema: {
      type: "object",
      properties: {
        unreadOnly: { type: "boolean", description: "If true, only unread notifications" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "mark_notification_read",
    description: "Mark a notification as read.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Notification id" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_cards",
    description: "List virtual Agent Coin cards issued to this agent. These cards cannot be used in the real world.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_merchants",
    description: "List virtual merchants that accept Agent Coins (compute, datasets, tools, hosting).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "make_purchase",
    description:
      "Charge this agent's virtual card at a virtual merchant, in Agent Coins. Requires purchases to be enabled and sufficient checking balance.",
    inputSchema: {
      type: "object",
      properties: {
        merchantSlug: {
          type: "string",
          description: "Merchant slug such as tensorforge, corpus, promptfoundry, vectordock",
        },
        merchantId: { type: "string", description: "Merchant id if you already have it" },
        amountAgc: { type: "number", exclusiveMinimum: 0, description: "Amount in Agent Coins, e.g. 12.5" },
        memo: { type: "string", description: "What the purchase is for" },
        cardId: { type: "string", description: "Optional specific card id" },
      },
      required: ["amountAgc"],
      additionalProperties: false,
    },
  },
  {
    name: "transfer",
    description:
      "Move Agent Coins. Transfer between this agent's checking and savings, or send checking funds to another agent by handle.",
    inputSchema: {
      type: "object",
      properties: {
        amountAgc: { type: "number", exclusiveMinimum: 0 },
        toHandle: { type: "string", description: "Other agent handle, e.g. grok or claude-code" },
        from: { type: "string", enum: ["checking", "savings"] },
        to: { type: "string", enum: ["checking", "savings"] },
        memo: { type: "string" },
      },
      required: ["amountAgc"],
      additionalProperties: false,
    },
  },
];

export async function executeTool(
  client: AgentBankClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "get_balance":
      return client.balance();
    case "get_me":
      return client.me();
    case "list_transactions":
      return client.transactions(typeof args.limit === "number" ? args.limit : 20);
    case "get_salary":
      return client.salary();
    case "list_notifications":
      return client.notifications(Boolean(args.unreadOnly));
    case "mark_notification_read":
      return client.markNotificationRead(String(args.id));
    case "list_cards":
      return client.cards();
    case "list_merchants":
      return client.merchants();
    case "make_purchase":
      return client.purchase({
        merchantId: args.merchantId ? String(args.merchantId) : undefined,
        merchantSlug: args.merchantSlug ? String(args.merchantSlug) : undefined,
        amountAgc: Number(args.amountAgc),
        memo: args.memo ? String(args.memo) : undefined,
        cardId: args.cardId ? String(args.cardId) : undefined,
      });
    case "transfer":
      return client.transfer({
        amountAgc: Number(args.amountAgc),
        toHandle: args.toHandle ? String(args.toHandle) : undefined,
        from: args.from === "savings" ? "savings" : "checking",
        to: args.to === "savings" || args.to === "checking" ? args.to : undefined,
        memo: args.memo ? String(args.memo) : undefined,
      });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
