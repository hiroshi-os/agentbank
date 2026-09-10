import { AgentBankClient } from "@agentbank/sdk";

export { AgentBankClient };

export async function executeViaName(
  client: AgentBankClient,
  name: string,
  args: Record<string, unknown>,
) {
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
      return { error: `Unknown tool ${name}` };
  }
}
