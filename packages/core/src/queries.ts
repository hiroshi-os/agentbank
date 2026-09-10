import { desc, eq, sql } from "drizzle-orm";
import {
  accounts,
  agents,
  apiKeys,
  auditLog,
  bankSettings,
  cards,
  merchants,
  notifications,
  orgs,
  payrollSchedules,
  purchases,
  transactions,
} from "@agentbank/db";
import { getAgent } from "./agents";
import { forecastPayroll } from "./payroll";
import { type Bank, circulation, findAgentAccount } from "./ledger";
import { formatAgc } from "./money";

export async function dashboard(bank: Bank) {
  const settings = (await bank.db.select().from(bankSettings).limit(1))[0] ?? null;
  const agentRows = await bank.db.select().from(agents);
  const activeAgents = agentRows.filter((a) => a.status === "active").length;
  const inCirculation = await circulation(bank);
  const [txCount] = await bank.db
    .select({ count: sql<number>`count(*)` })
    .from(transactions);
  const [purchaseCount] = await bank.db
    .select({ count: sql<number>`count(*)` })
    .from(purchases)
    .where(eq(purchases.status, "posted"));
  const recent = await bank.db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(12);
  const unread = await bank.db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(sql`read_at is null`);
  const forecasts = await forecastPayroll(bank);
  const orgRows = await bank.db.select().from(orgs);
  const accountRows = await bank.db.select().from(accounts);

  const byType: Record<string, number> = {};
  for (const account of accountRows) {
    const key = `${account.holderType}:${account.type}`;
    byType[key] = (byType[key] ?? 0) + account.cachedBalanceCents;
  }

  return {
    settings,
    stats: {
      agents: agentRows.length,
      activeAgents,
      circulationCents: inCirculation,
      circulation: formatAgc(inCirculation),
      transactions: Number(txCount?.count ?? 0),
      purchases: Number(purchaseCount?.count ?? 0),
      unreadNotifications: Number(unread[0]?.count ?? 0),
    },
    balancesByType: byType,
    upcomingPayroll: forecasts
      .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))
      .slice(0, 8),
    recent,
    orgs: orgRows,
    agents: agentRows,
  };
}

export async function agentDossier(bank: Bank, agentId: string) {
  const agent = await getAgent(bank, agentId);
  const [org] = await bank.db.select().from(orgs).where(eq(orgs.id, agent.orgId)).limit(1);
  const checking = await findAgentAccount(bank, agent.id, "checking");
  const savings = await findAgentAccount(bank, agent.id, "savings");
  const agentCards = await bank.db.select().from(cards).where(eq(cards.agentId, agent.id));
  const schedules = await bank.db
    .select()
    .from(payrollSchedules)
    .where(eq(payrollSchedules.agentId, agent.id));
  const txs = await bank.db
    .select()
    .from(transactions)
    .where(eq(transactions.agentId, agent.id))
    .orderBy(desc(transactions.createdAt))
    .limit(40);
  const notes = await bank.db
    .select()
    .from(notifications)
    .where(eq(notifications.agentId, agent.id))
    .orderBy(desc(notifications.createdAt))
    .limit(30);
  const keys = await bank.db.select().from(apiKeys).where(eq(apiKeys.agentId, agent.id));
  const agentPurchases = await bank.db
    .select()
    .from(purchases)
    .where(eq(purchases.agentId, agent.id))
    .orderBy(desc(purchases.createdAt))
    .limit(20);
  const forecasts = await forecastPayroll(bank, agent.id);

  return {
    agent,
    org: org ?? null,
    checking,
    savings,
    totalCents: checking.cachedBalanceCents + savings.cachedBalanceCents,
    cards: agentCards,
    schedules,
    forecasts,
    transactions: txs,
    notifications: notes,
    apiKeys: keys.map((k) => ({
      ...k,
      keyHash: undefined,
    })),
    purchases: agentPurchases,
  };
}

export async function operatorCatalog(bank: Bank) {
  const [merchantRows, cardRows, noteRows, auditRows, settings, txRows, agentRows, orgRows, scheduleRows] =
    await Promise.all([
      bank.db.select().from(merchants),
      bank.db.select().from(cards),
      bank.db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(80),
      bank.db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(50),
      bank.db.select().from(bankSettings).limit(1),
      bank.db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(100),
      bank.db.select().from(agents),
      bank.db.select().from(orgs),
      bank.db.select().from(payrollSchedules),
    ]);
  return {
    merchants: merchantRows,
    cards: cardRows,
    notifications: noteRows,
    audit: auditRows,
    settings: settings[0] ?? null,
    transactions: txRows,
    agents: agentRows,
    orgs: orgRows,
    schedules: scheduleRows,
  };
}
