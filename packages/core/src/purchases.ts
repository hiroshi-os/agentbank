import { eq } from "drizzle-orm";
import { bankSettings, merchants, purchaseIntents, purchases } from "@agentbank/db";
import { getAgent } from "./agents";
import { findCardByPan, getCard, listCards, spentInWindow } from "./cards";
import { Errors } from "./errors";
import { id } from "./ids";
import {
  findAgentAccount,
  findBankAccount,
  findMerchantAccount,
  postTransaction,
  recordAudit,
  type Bank,
} from "./ledger";
import { bps, formatAgc } from "./money";
import { notify } from "./notifications";
import { advanceCadence, iso, type Cadence } from "./time";

export async function listMerchants(bank: Bank) {
  return bank.db.select().from(merchants);
}

export async function getMerchant(bank: Bank, merchantId: string) {
  const [row] = await bank.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!row) throw Errors.notFound("Merchant");
  return row;
}

export async function getMerchantBySlug(bank: Bank, slug: string) {
  const [row] = await bank.db.select().from(merchants).where(eq(merchants.slug, slug)).limit(1);
  if (!row) throw Errors.notFound("Merchant");
  return row;
}

export async function makePurchase(
  bank: Bank,
  input: {
    agentId: string;
    cardId?: string;
    pan?: string;
    cvv?: string;
    expMonth?: number;
    expYear?: number;
    merchantId: string;
    amountCents: number;
    memo?: string;
  },
) {
  const agent = await getAgent(bank, input.agentId);
  const merchant = await getMerchant(bank, input.merchantId);
  const now = bank.clock.now();
  const purchaseId = id("pur");
  let card;
  if (input.cardId) card = await getCard(bank, input.cardId);
  else if (input.pan) card = await findCardByPan(bank, input.pan);
  else {
    card = (await listCards(bank, agent.id)).find((c) => c.status === "active");
    if (!card) throw Errors.notFound("Card");
  }

  const decline = async (reason: string) => {
    await bank.db.insert(purchases).values({
      id: purchaseId,
      agentId: agent.id,
      cardId: card.id,
      merchantId: merchant.id,
      transactionId: null,
      amountCents: input.amountCents,
      status: "declined",
      memo: input.memo ?? merchant.name,
      declineReason: reason,
      createdAt: iso(now),
    });
    await notify(bank, {
      agentId: agent.id,
      type: "purchase.declined",
      title: "Card declined",
      body: `${formatAgc(input.amountCents)} at ${merchant.name} was declined: ${reason}`,
      dedupeKey: `purchase.declined:${purchaseId}`,
      data: { purchaseId, reason },
    });
    throw Errors.cardDeclined(reason);
  };

  if (input.amountCents <= 0) throw Errors.invalid("Purchase amount must be positive");
  if (agent.status !== "active") await decline("Agent account is not active");
  if (!agent.purchaseEnabled) await decline("Purchases are disabled for this agent");
  if (card.agentId !== agent.id) await decline("Card does not belong to this agent");
  if (card.status !== "active") await decline(`Card is ${card.status}`);
  if (card.expYear < now.getUTCFullYear() || (card.expYear === now.getUTCFullYear() && card.expMonth < now.getUTCMonth() + 1)) {
    await decline("Card expired");
  }
  if (input.cvv && input.cvv !== card.cvv) await decline("CVV mismatch");
  if (input.expMonth && input.expMonth !== card.expMonth) await decline("Expiry mismatch");
  if (input.expYear && input.expYear !== card.expYear) await decline("Expiry mismatch");
  if (input.amountCents > card.perTxnLimitCents) await decline("Exceeds per-transaction limit");

  const allowed = card.allowedMccsJson ? (JSON.parse(card.allowedMccsJson) as string[]) : null;
  if (allowed && allowed.length > 0 && !allowed.includes(merchant.mcc)) {
    await decline(`Merchant category ${merchant.mcc} is blocked on this card`);
  }

  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const daySpend = await spentInWindow(bank, card.id, dayStart);
  const monthSpend = await spentInWindow(bank, card.id, monthStart);
  if (daySpend + input.amountCents > card.dailyLimitCents) await decline("Exceeds daily limit");
  if (monthSpend + input.amountCents > card.monthlyLimitCents) await decline("Exceeds monthly limit");
  if (daySpend + input.amountCents > agent.dailySpendLimitCents) await decline("Exceeds agent daily spend policy");

  const checking = await findAgentAccount(bank, agent.id, "checking");
  if (checking.cachedBalanceCents < input.amountCents) {
    await decline(`Insufficient funds (${formatAgc(checking.cachedBalanceCents)} available)`);
  }

  const [settings] = await bank.db.select().from(bankSettings).limit(1);
  const fee = settings ? bps(input.amountCents, settings.interchangeBps) : 0;
  const merchantNet = input.amountCents - fee;
  const merchantAccount = await findMerchantAccount(bank, merchant.id);
  const bankTreasury = await findBankAccount(bank, "treasury");

  const lines = [
    { accountId: checking.id, direction: "debit" as const, amountCents: input.amountCents },
    { accountId: merchantAccount.id, direction: "credit" as const, amountCents: merchantNet > 0 ? merchantNet : input.amountCents },
  ];
  if (fee > 0 && merchantNet > 0) {
    lines.push({ accountId: bankTreasury.id, direction: "credit", amountCents: fee });
  }

  const tx = await postTransaction(bank, {
    type: "purchase",
    amountCents: input.amountCents,
    description: `${merchant.emoji} ${merchant.name}${input.memo ? ` — ${input.memo}` : ""}`,
    fromAccountId: checking.id,
    toAccountId: merchantAccount.id,
    agentId: agent.id,
    cardId: card.id,
    merchantId: merchant.id,
    metadata: { feeCents: fee, mcc: merchant.mcc, last4: card.last4 },
    lines,
  });

  await bank.db.insert(purchases).values({
    id: purchaseId,
    agentId: agent.id,
    cardId: card.id,
    merchantId: merchant.id,
    transactionId: tx.id,
    amountCents: input.amountCents,
    status: "posted",
    memo: input.memo ?? merchant.name,
    declineReason: null,
    createdAt: iso(now),
  });

  await notify(bank, {
    agentId: agent.id,
    type: "purchase.completed",
    title: `Purchased at ${merchant.name}`,
    body: `${formatAgc(input.amountCents)} charged to card •••• ${card.last4}.`,
    dedupeKey: `purchase.completed:${purchaseId}`,
    data: { purchaseId, transactionId: tx.id, amountCents: input.amountCents },
  });

  await recordAudit(bank, {
    actorType: "agent",
    actorId: agent.id,
    action: "purchase.complete",
    entityType: "purchase",
    entityId: purchaseId,
    detail: { merchantId: merchant.id, amountCents: input.amountCents },
  });

  return { purchaseId, transaction: tx, feeCents: fee, cardLast4: card.last4, merchant };
}

export async function createPurchaseIntent(
  bank: Bank,
  input: {
    agentId: string;
    merchantId?: string | null;
    label: string;
    amountCents: number;
    cadence: Cadence | "once";
    enabled?: boolean;
  },
) {
  await getAgent(bank, input.agentId);
  if (input.merchantId) await getMerchant(bank, input.merchantId);
  const intentId = id("int");
  const now = bank.clock.now();
  await bank.db.insert(purchaseIntents).values({
    id: intentId,
    agentId: input.agentId,
    merchantId: input.merchantId ?? null,
    label: input.label,
    amountCents: input.amountCents,
    cadence: input.cadence,
    enabled: input.enabled === false ? 0 : 1,
    lastRunAt: null,
    nextRunAt: input.cadence === "once" ? null : iso(advanceCadence(now, input.cadence)),
    createdAt: iso(now),
  });
  return (await bank.db.select().from(purchaseIntents).where(eq(purchaseIntents.id, intentId)))[0]!;
}

export async function setPurchaseEnabled(bank: Bank, agentId: string, enabled: boolean, dailySpendLimitCents?: number) {
  const { agents } = await import("@agentbank/db");
  await getAgent(bank, agentId);
  await bank.db
    .update(agents)
    .set({
      purchaseEnabled: enabled ? 1 : 0,
      ...(dailySpendLimitCents != null ? { dailySpendLimitCents } : {}),
    })
    .where(eq(agents.id, agentId));
}

export async function runDuePurchaseIntents(bank: Bank) {
  const now = iso(bank.clock.now());
  const intents = await bank.db.select().from(purchaseIntents);
  const due = intents.filter((i) => i.enabled && i.nextRunAt && i.nextRunAt <= now && i.cadence !== "once");
  const results = [];
  for (const intent of due) {
    if (!intent.merchantId) continue;
    const { listCards } = await import("./cards");
    const agentCards = (await listCards(bank, intent.agentId)).filter((c) => c.status === "active");
    if (!agentCards[0]) continue;
    try {
      const purchase = await makePurchase(bank, {
        agentId: intent.agentId,
        cardId: agentCards[0].id,
        merchantId: intent.merchantId,
        amountCents: intent.amountCents,
        memo: intent.label,
      });
      await bank.db
        .update(purchaseIntents)
        .set({
          lastRunAt: now,
          nextRunAt: iso(advanceCadence(bank.clock.now(), intent.cadence as Cadence)),
        })
        .where(eq(purchaseIntents.id, intent.id));
      results.push({ intentId: intent.id, ok: true, purchaseId: purchase.purchaseId });
    } catch (error) {
      results.push({
        intentId: intent.id,
        ok: false,
        error: error instanceof Error ? error.message : "failed",
      });
    }
  }
  return results;
}
