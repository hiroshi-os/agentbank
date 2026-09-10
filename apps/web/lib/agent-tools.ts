import {
  findAgentAccount,
  forecastPayroll,
  formatAgc,
  formatPan,
  getMerchantBySlug,
  listCards,
  listMerchants,
  listNotifications,
  listRecentTransactions,
  makePurchase,
  markNotificationRead,
  requireAgentByKey,
  transferOwn,
  transferToAgent,
  type Bank,
} from "@agentbank/core";

function money(cents: number) {
  return { cents, formatted: formatAgc(cents), agc: cents / 100 };
}

export async function executeAgentTool(
  bank: Bank,
  rawKey: string | null,
  name: string,
  args: Record<string, unknown>,
) {
  const { agent } = await requireAgentByKey(bank, rawKey);

  switch (name) {
    case "get_me": {
      const checking = await findAgentAccount(bank, agent.id, "checking");
      const savings = await findAgentAccount(bank, agent.id, "savings");
      return {
        agent: {
          id: agent.id,
          name: agent.name,
          handle: agent.handle,
          role: agent.role,
          modelFamily: agent.modelFamily,
          status: agent.status,
          purchaseEnabled: Boolean(agent.purchaseEnabled),
        },
        accounts: {
          checking: money(checking.cachedBalanceCents),
          savings: money(savings.cachedBalanceCents),
          total: money(checking.cachedBalanceCents + savings.cachedBalanceCents),
        },
      };
    }
    case "get_balance": {
      const checking = await findAgentAccount(bank, agent.id, "checking");
      const savings = await findAgentAccount(bank, agent.id, "savings");
      return {
        checking: money(checking.cachedBalanceCents),
        savings: money(savings.cachedBalanceCents),
        total: money(checking.cachedBalanceCents + savings.cachedBalanceCents),
        currency: "AGC",
        disclaimer: "Virtual Agent Coins. Not legal tender.",
      };
    }
    case "list_transactions": {
      const rows = await listRecentTransactions(
        bank,
        typeof args.limit === "number" ? Math.min(args.limit, 100) : 20,
        agent.id,
      );
      return {
        transactions: rows.map((tx) => ({
          id: tx.id,
          type: tx.type,
          ...money(tx.amountCents),
          description: tx.description,
          createdAt: tx.createdAt,
        })),
      };
    }
    case "get_salary": {
      const forecasts = await forecastPayroll(bank, agent.id);
      return {
        schedules: forecasts.map((row) => ({
          id: row.id,
          kind: row.kind,
          cadence: row.cadence,
          ...money(row.amountCents),
          predictedAt: row.predictedAt,
          hoursUntil: row.hoursUntil,
          isOverdue: row.isOverdue,
        })),
      };
    }
    case "list_notifications": {
      const rows = await listNotifications(bank, agent.id, Boolean(args.unreadOnly));
      return {
        notifications: rows.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          read: Boolean(n.readAt),
          createdAt: n.createdAt,
        })),
      };
    }
    case "mark_notification_read":
      return markNotificationRead(bank, String(args.id), agent.id);
    case "list_cards": {
      const rows = await listCards(bank, agent.id);
      return {
        cards: rows.map((card) => ({
          id: card.id,
          label: card.label,
          pan: formatPan(card.pan),
          last4: card.last4,
          cvv: card.cvv,
          status: card.status,
          virtual: true,
        })),
      };
    }
    case "list_merchants":
      return { merchants: await listMerchants(bank) };
    case "make_purchase": {
      let merchantId = args.merchantId ? String(args.merchantId) : undefined;
      if (!merchantId && args.merchantSlug) {
        merchantId = (await getMerchantBySlug(bank, String(args.merchantSlug))).id;
      }
      if (!merchantId) throw new Error("merchantId or merchantSlug required");
      const amountCents =
        typeof args.amountCents === "number"
          ? args.amountCents
          : Math.round(Number(args.amountAgc) * 100);
      const result = await makePurchase(bank, {
        agentId: agent.id,
        merchantId,
        amountCents,
        memo: args.memo ? String(args.memo) : undefined,
        cardId: args.cardId ? String(args.cardId) : undefined,
      });
      return {
        ok: true,
        purchaseId: result.purchaseId,
        merchant: result.merchant.name,
        fee: money(result.feeCents),
      };
    }
    case "transfer": {
      const amountCents =
        typeof args.amountCents === "number"
          ? args.amountCents
          : Math.round(Number(args.amountAgc) * 100);
      if (args.toHandle) {
        const tx = await transferToAgent(bank, {
          fromAgentId: agent.id,
          toHandle: String(args.toHandle),
          amountCents,
          memo: args.memo ? String(args.memo) : undefined,
        });
        return { ok: true, transactionId: tx.id, type: "p2p" };
      }
      const tx = await transferOwn(bank, {
        agentId: agent.id,
        from: args.from === "savings" ? "savings" : "checking",
        to: args.to === "checking" ? "checking" : "savings",
        amountCents,
      });
      return { ok: true, transactionId: tx.id, type: "transfer" };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
