import { desc, eq } from "drizzle-orm";
import { accounts, agents, apiKeys, orgs, payrollSchedules } from "@agentbank/db";
import { Errors } from "./errors";
import { hashApiKey, recordAudit, type Bank, findOrgTreasury } from "./ledger";
import { id, token } from "./ids";
import { iso, type Cadence, advanceCadence } from "./time";

export async function createOrg(
  bank: Bank,
  input: { name: string; slug: string; mission: string },
) {
  const now = iso(bank.clock.now());
  const orgId = id("org");
  await bank.db.insert(orgs).values({
    id: orgId,
    name: input.name,
    slug: input.slug,
    mission: input.mission,
    createdAt: now,
  });
  await bank.db.insert(accounts).values({
    id: id("acct"),
    holderType: "org",
    holderId: orgId,
    type: "treasury",
    name: `${input.name} payroll treasury`,
    normalBalance: "credit",
    cachedBalanceCents: 0,
    accruedMicros: 0,
    createdAt: now,
  });
  return (await bank.db.select().from(orgs).where(eq(orgs.id, orgId)))[0]!;
}

export async function fundOrgTreasury(bank: Bank, orgId: string, amountCents: number, memo: string) {
  const treasury = await findOrgTreasury(bank, orgId);
  const { findBankAccount, postTransaction } = await import("./ledger");
  const vault = await findBankAccount(bank, "treasury");
  return postTransaction(bank, {
    type: "treasury_issue",
    amountCents,
    description: memo,
    fromAccountId: vault.id,
    toAccountId: treasury.id,
    metadata: { kind: "mint_to_org" },
    lines: [
      { accountId: vault.id, direction: "debit", amountCents },
      { accountId: treasury.id, direction: "credit", amountCents },
    ],
  });
}

export type CreateAgentInput = {
  orgId: string;
  name: string;
  handle: string;
  role: string;
  modelFamily: string;
  bio: string;
  avatarHue?: number;
  purchaseEnabled?: boolean;
  dailySpendLimitCents?: number;
  openingCheckingCents?: number;
  openingSavingsCents?: number;
  demoApiKey?: string;
};

export async function createAgent(bank: Bank, input: CreateAgentInput) {
  const existing = await bank.db.select().from(agents).where(eq(agents.handle, input.handle)).limit(1);
  if (existing[0]) throw Errors.conflict(`Handle @${input.handle} is taken`);
  const now = iso(bank.clock.now());
  const agentId = id("agt");
  await bank.db.insert(agents).values({
    id: agentId,
    orgId: input.orgId,
    name: input.name,
    handle: input.handle,
    role: input.role,
    modelFamily: input.modelFamily,
    status: "active",
    avatarHue: input.avatarHue ?? Math.floor(Math.random() * 360),
    bio: input.bio,
    hiredAt: now,
    purchaseEnabled: input.purchaseEnabled === false ? 0 : 1,
    dailySpendLimitCents: input.dailySpendLimitCents ?? 50_000,
    createdAt: now,
  });

  const checkingId = id("acct");
  const savingsId = id("acct");
  await bank.db.insert(accounts).values([
    {
      id: checkingId,
      holderType: "agent",
      holderId: agentId,
      type: "checking",
      name: `${input.name} checking`,
      normalBalance: "credit",
      cachedBalanceCents: 0,
      accruedMicros: 0,
      createdAt: now,
    },
    {
      id: savingsId,
      holderType: "agent",
      holderId: agentId,
      type: "savings",
      name: `${input.name} savings`,
      normalBalance: "credit",
      cachedBalanceCents: 0,
      accruedMicros: 0,
      createdAt: now,
    },
  ]);

  const rawKey = input.demoApiKey ?? `agb_live_${token(18)}`;
  await bank.db.insert(apiKeys).values({
    id: id("key"),
    agentId,
    name: "Primary connector key",
    keyHash: hashApiKey(rawKey),
    keyPrefix: rawKey.slice(0, 16),
    plaintextDemo: rawKey,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: now,
  });

  if (input.openingCheckingCents && input.openingCheckingCents > 0) {
    const { findOrgTreasury, postTransaction } = await import("./ledger");
    const orgTreasury = await findOrgTreasury(bank, input.orgId);
    await postTransaction(bank, {
      type: "opening_deposit",
      amountCents: input.openingCheckingCents,
      description: "Opening checking deposit",
      fromAccountId: orgTreasury.id,
      toAccountId: checkingId,
      agentId,
      lines: [
        { accountId: orgTreasury.id, direction: "debit", amountCents: input.openingCheckingCents },
        { accountId: checkingId, direction: "credit", amountCents: input.openingCheckingCents },
      ],
    });
  }
  if (input.openingSavingsCents && input.openingSavingsCents > 0) {
    const { findOrgTreasury, postTransaction } = await import("./ledger");
    const orgTreasury = await findOrgTreasury(bank, input.orgId);
    await postTransaction(bank, {
      type: "opening_deposit",
      amountCents: input.openingSavingsCents,
      description: "Opening savings deposit",
      fromAccountId: orgTreasury.id,
      toAccountId: savingsId,
      agentId,
      lines: [
        { accountId: orgTreasury.id, direction: "debit", amountCents: input.openingSavingsCents },
        { accountId: savingsId, direction: "credit", amountCents: input.openingSavingsCents },
      ],
    });
  }

  await recordAudit(bank, {
    actorType: "operator",
    action: "agent.create",
    entityType: "agent",
    entityId: agentId,
    detail: { handle: input.handle },
  });

  return { agentId, apiKey: rawKey, checkingId, savingsId };
}

export async function setAgentStatus(bank: Bank, agentId: string, status: "active" | "paused" | "offboarded") {
  const [agent] = await bank.db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) throw Errors.notFound("Agent");
  await bank.db.update(agents).set({ status }).where(eq(agents.id, agentId));
  if (status !== "active") {
    await bank.db
      .update(payrollSchedules)
      .set({ active: 0 })
      .where(eq(payrollSchedules.agentId, agentId));
  }
  return { ...agent, status };
}

export async function listAgents(bank: Bank) {
  return bank.db.select().from(agents).orderBy(desc(agents.createdAt));
}

export async function getAgent(bank: Bank, agentId: string) {
  const [agent] = await bank.db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) throw Errors.notFound("Agent");
  return agent;
}

export async function getAgentByHandle(bank: Bank, handle: string) {
  const [agent] = await bank.db.select().from(agents).where(eq(agents.handle, handle)).limit(1);
  if (!agent) throw Errors.notFound("Agent");
  return agent;
}

export async function rotateApiKey(bank: Bank, agentId: string, name = "Rotated connector key") {
  await getAgent(bank, agentId);
  await bank.db
    .update(apiKeys)
    .set({ revokedAt: iso(bank.clock.now()) })
    .where(eq(apiKeys.agentId, agentId));
  const rawKey = `agb_live_${token(18)}`;
  await bank.db.insert(apiKeys).values({
    id: id("key"),
    agentId,
    name,
    keyHash: hashApiKey(rawKey),
    keyPrefix: rawKey.slice(0, 16),
    plaintextDemo: rawKey,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: iso(bank.clock.now()),
  });
  return rawKey;
}

export async function createPayrollSchedule(
  bank: Bank,
  input: {
    agentId: string;
    kind: "salary" | "stipend";
    amountCents: number;
    cadence: Cadence;
    savingsAllocationBps?: number;
    nextRunAt?: Date;
  },
) {
  const agent = await getAgent(bank, input.agentId);
  if (input.amountCents <= 0) throw Errors.invalid("Payroll amount must be positive");
  const now = bank.clock.now();
  const next = input.nextRunAt ?? advanceCadence(now, input.cadence);
  const scheduleId = id("pay");
  await bank.db.insert(payrollSchedules).values({
    id: scheduleId,
    agentId: agent.id,
    orgId: agent.orgId,
    kind: input.kind,
    amountCents: input.amountCents,
    cadence: input.cadence,
    nextRunAt: iso(next),
    lastRunAt: null,
    active: 1,
    savingsAllocationBps: input.savingsAllocationBps ?? 0,
    createdAt: iso(now),
  });
  return (await bank.db.select().from(payrollSchedules).where(eq(payrollSchedules.id, scheduleId)))[0]!;
}
