import { and, eq, gte } from "drizzle-orm";
import { cards, purchases } from "@agentbank/db";
import { Errors } from "./errors";
import { id, randomDigits } from "./ids";
import { findAgentAccount, recordAudit, type Bank } from "./ledger";
import { iso } from "./time";
import { getAgent } from "./agents";

const VIRTUAL_IIN = "000000";

export function formatPan(pan: string): string {
  return pan.replace(/(.{4})/g, "$1 ").trim();
}

export function issueCardNumber(): { pan: string; last4: string; cvv: string } {
  const pan = `${VIRTUAL_IIN}${randomDigits(10)}`;
  return { pan, last4: pan.slice(-4), cvv: randomDigits(3) };
}

export async function issueCard(
  bank: Bank,
  input: {
    agentId: string;
    label?: string;
    dailyLimitCents?: number;
    monthlyLimitCents?: number;
    perTxnLimitCents?: number;
    allowedMccs?: string[] | null;
  },
) {
  const agent = await getAgent(bank, input.agentId);
  const checking = await findAgentAccount(bank, agent.id, "checking");
  const { pan, last4, cvv } = issueCardNumber();
  const now = bank.clock.now();
  const cardId = id("crd");
  await bank.db.insert(cards).values({
    id: cardId,
    agentId: agent.id,
    accountId: checking.id,
    label: input.label ?? `${agent.name} Agent Card`,
    pan,
    last4,
    cvv,
    expMonth: now.getUTCMonth() + 1,
    expYear: now.getUTCFullYear() + 3,
    status: "active",
    dailyLimitCents: input.dailyLimitCents ?? agent.dailySpendLimitCents,
    monthlyLimitCents: input.monthlyLimitCents ?? agent.dailySpendLimitCents * 20,
    perTxnLimitCents: input.perTxnLimitCents ?? agent.dailySpendLimitCents,
    allowedMccsJson: input.allowedMccs ? JSON.stringify(input.allowedMccs) : null,
    createdAt: iso(now),
  });
  await recordAudit(bank, {
    actorType: "operator",
    action: "card.issue",
    entityType: "card",
    entityId: cardId,
    detail: { agentId: agent.id, last4 },
  });
  const { notify } = await import("./notifications");
  await notify(bank, {
    agentId: agent.id,
    type: "card.issued",
    title: "Virtual card issued",
    body: `A new Agent Coin card ending ${last4} is ready. It cannot be used in the real world.`,
    dedupeKey: `card.issued:${cardId}`,
    data: { cardId, last4 },
  });
  return (await bank.db.select().from(cards).where(eq(cards.id, cardId)))[0]!;
}

export async function setCardStatus(bank: Bank, cardId: string, status: "active" | "frozen" | "cancelled") {
  const [card] = await bank.db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!card) throw Errors.notFound("Card");
  await bank.db.update(cards).set({ status }).where(eq(cards.id, cardId));
  return { ...card, status };
}

export async function listCards(bank: Bank, agentId?: string) {
  if (agentId) {
    return bank.db.select().from(cards).where(eq(cards.agentId, agentId));
  }
  return bank.db.select().from(cards);
}

export async function getCard(bank: Bank, cardId: string) {
  const [card] = await bank.db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!card) throw Errors.notFound("Card");
  return card;
}

export async function findCardByPan(bank: Bank, pan: string) {
  const normalized = pan.replace(/\s+/g, "");
  const [card] = await bank.db.select().from(cards).where(eq(cards.pan, normalized)).limit(1);
  if (!card) throw Errors.notFound("Card");
  return card;
}

export async function spentInWindow(bank: Bank, cardId: string, sinceIso: string) {
  const rows = await bank.db
    .select()
    .from(purchases)
    .where(and(eq(purchases.cardId, cardId), eq(purchases.status, "posted"), gte(purchases.createdAt, sinceIso)));
  return rows.reduce((sum, row) => sum + row.amountCents, 0);
}

export function maskPan(pan: string): string {
  return `${pan.slice(0, 6)}******${pan.slice(-4)}`;
}
