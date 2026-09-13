import {
  findAgentAccount,
  forecastPayroll,
  listCards,
  listMerchants,
  listNotifications,
  listRecentTransactions,
  makePurchase,
  markNotificationRead,
  requireAgentByKey,
  transferOwn,
  transferToAgent,
  formatAgc,
  formatPan,
  getMerchantBySlug,
} from "@agentbank/core";
import { getBank } from "@/lib/bank";
import { bearer, fail, json, readJson } from "@/lib/http";

export const runtime = "nodejs";

async function auth(request: Request) {
  const bank = await getBank();
  const { agent } = await requireAgentByKey(bank, bearer(request));
  return { bank, agent };
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  try {
    const { path = [] } = await context.params;
    const key = path.join("/");
    const { bank, agent } = await auth(request);
    const url = new URL(request.url);

    if (key === "me" || key === "") {
      const checking = await findAgentAccount(bank, agent.id, "checking");
      const savings = await findAgentAccount(bank, agent.id, "savings");
      return json({
        agent: {
          id: agent.id,
          name: agent.name,
          handle: agent.handle,
          role: agent.role,
          modelFamily: agent.modelFamily,
          status: agent.status,
          purchaseEnabled: Boolean(agent.purchaseEnabled),
          dailySpendLimit: formatAgc(agent.dailySpendLimitCents),
        },
        accounts: {
          checking: { id: checking.id, ...money(checking.cachedBalanceCents) },
          savings: { id: savings.id, ...money(savings.cachedBalanceCents) },
          total: money(checking.cachedBalanceCents + savings.cachedBalanceCents),
        },
        currency: { code: "AGC", name: "Agent Coins", realMoney: false },
      });
    }

    if (key === "balance") {
      const checking = await findAgentAccount(bank, agent.id, "checking");
      const savings = await findAgentAccount(bank, agent.id, "savings");
      return json({
        checking: money(checking.cachedBalanceCents),
        savings: money(savings.cachedBalanceCents),
        total: money(checking.cachedBalanceCents + savings.cachedBalanceCents),
        currency: "AGC",
        disclaimer: "Virtual Agent Coins. Not legal tender. Not a real bank.",
      });
    }

    if (key === "transactions") {
      const limit = Number(url.searchParams.get("limit") ?? 25);
      const rows = await listRecentTransactions(bank, Math.min(limit, 100), agent.id);
      return json({
        transactions: rows.map((tx) => ({
          id: tx.id,
          type: tx.type,
          status: tx.status,
          ...money(tx.amountCents),
          description: tx.description,
          createdAt: tx.createdAt,
        })),
      });
    }

    if (key === "salary") {
      const forecasts = await forecastPayroll(bank, agent.id);
      return json({
        schedules: forecasts.map((row) => ({
          id: row.id,
          kind: row.kind,
          cadence: row.cadence,
          ...money(row.amountCents),
          predictedAt: row.predictedAt,
          hoursUntil: row.hoursUntil,
          isOverdue: row.isOverdue,
          savingsAllocationBps: row.savingsAllocationBps,
        })),
      });
    }

    if (key === "notifications") {
      const unread = url.searchParams.get("unread") === "1";
      const rows = await listNotifications(bank, agent.id, unread);
      return json({
        notifications: rows.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          read: Boolean(n.readAt),
          createdAt: n.createdAt,
          data: JSON.parse(n.dataJson),
        })),
      });
    }

    if (key === "cards") {
      const rows = await listCards(bank, agent.id);
      return json({
        cards: rows.map((card) => ({
          id: card.id,
          label: card.label,
          pan: formatPan(card.pan),
          last4: card.last4,
          cvv: card.cvv,
          expMonth: card.expMonth,
          expYear: card.expYear,
          status: card.status,
          dailyLimit: money(card.dailyLimitCents),
          monthlyLimit: money(card.monthlyLimitCents),
          perTxnLimit: money(card.perTxnLimitCents),
          virtual: true,
          realWorld: false,
        })),
      });
    }

    if (key === "merchants") {
      const rows = await listMerchants(bank);
      return json({
        merchants: rows.map((m) => ({
          id: m.id,
          name: m.name,
          slug: m.slug,
          category: m.category,
          mcc: m.mcc,
          description: m.description,
          emoji: m.emoji,
        })),
      });
    }

    return json({ error: "Not found", code: "not_found" }, 404);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  try {
    const { path = [] } = await context.params;
    const key = path.join("/");
    const { bank, agent } = await auth(request);

    if (key.endsWith("/read") && path[0] === "notifications") {
      const id = path[1];
      const row = await markNotificationRead(bank, id, agent.id);
      return json({ ok: true, notification: row });
    }

    if (key === "purchases") {
      const body = await readJson<{
        merchantId?: string;
        merchantSlug?: string;
        amountAgc?: number;
        amountCents?: number;
        memo?: string;
        cardId?: string;
        pan?: string;
        cvv?: string;
      }>(request);
      let merchantId = body.merchantId;
      if (!merchantId && body.merchantSlug) {
        merchantId = (await getMerchantBySlug(bank, body.merchantSlug)).id;
      }
      if (!merchantId) return json({ error: "merchantId or merchantSlug required", code: "invalid_request" }, 400);
      const amountCents = body.amountCents ?? Math.round(Number(body.amountAgc) * 100);
      const result = await makePurchase(bank, {
        agentId: agent.id,
        merchantId,
        amountCents,
        memo: body.memo,
        cardId: body.cardId,
        pan: body.pan,
        cvv: body.cvv,
      });
      return json({
        ok: true,
        purchaseId: result.purchaseId,
        fee: money(result.feeCents),
        cardLast4: result.cardLast4,
        merchant: result.merchant.name,
        transaction: result.transaction.id,
        disclaimer: "Virtual purchase in Agent Coins. No real funds moved.",
      });
    }

    if (key === "transfers") {
      const body = await readJson<{
        amountAgc?: number;
        amountCents?: number;
        toHandle?: string;
        from?: "checking" | "savings";
        to?: "checking" | "savings";
        memo?: string;
      }>(request);
      const amountCents = body.amountCents ?? Math.round(Number(body.amountAgc) * 100);
      if (body.toHandle) {
        const tx = await transferToAgent(bank, {
          fromAgentId: agent.id,
          toHandle: body.toHandle,
          amountCents,
          memo: body.memo,
        });
        return json({ ok: true, transactionId: tx.id, type: "p2p" });
      }
      const tx = await transferOwn(bank, {
        agentId: agent.id,
        from: body.from ?? "checking",
        to: body.to ?? "savings",
        amountCents,
      });
      return json({ ok: true, transactionId: tx.id, type: "transfer" });
    }

    return json({ error: "Not found", code: "not_found" }, 404);
  } catch (error) {
    return fail(error);
  }
}

function money(cents: number) {
  return { cents, formatted: formatAgc(cents), agc: cents / 100 };
}
