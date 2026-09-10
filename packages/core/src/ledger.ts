import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  accounts,
  agents,
  apiKeys,
  auditLog,
  type Database,
  ledgerEntries,
  transactions,
} from "@agentbank/db";
import { Errors } from "./errors";
import { id } from "./ids";
import { iso, type Clock, systemClock } from "./time";

export type Bank = {
  db: Database;
  clock: Clock;
};

export function createBank(db: Database, clock: Clock = systemClock): Bank {
  return { db, clock };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function requireAgentByKey(bank: Bank, rawKey: string | null | undefined) {
  if (!rawKey) throw Errors.unauthorized();
  const token = rawKey.replace(/^Bearer\s+/i, "").trim();
  const [row] = await bank.db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashApiKey(token))))
    .limit(1);
  if (!row || row.revokedAt) throw Errors.unauthorized();
  const [agent] = await bank.db.select().from(agents).where(eq(agents.id, row.agentId)).limit(1);
  if (!agent) throw Errors.unauthorized();
  await bank.db
    .update(apiKeys)
    .set({ lastUsedAt: iso(bank.clock.now()) })
    .where(eq(apiKeys.id, row.id));
  return { agent, apiKey: row };
}

export async function getAccount(bank: Bank, accountId: string) {
  const [account] = await bank.db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account) throw Errors.notFound("Account");
  return account;
}

export async function findAgentAccount(bank: Bank, agentId: string, type: "checking" | "savings") {
  const [account] = await bank.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.holderType, "agent"), eq(accounts.holderId, agentId), eq(accounts.type, type)))
    .limit(1);
  if (!account) throw Errors.notFound(`${type} account`);
  return account;
}

export async function findBankAccount(bank: Bank, type: "treasury" | "interest_expense" | "interchange_revenue") {
  const [account] = await bank.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.holderType, "bank"), eq(accounts.type, type)))
    .limit(1);
  if (!account) throw Errors.notFound(`Bank ${type} account`);
  return account;
}

export async function findOrgTreasury(bank: Bank, orgId: string) {
  const [account] = await bank.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.holderType, "org"), eq(accounts.holderId, orgId), eq(accounts.type, "treasury")))
    .limit(1);
  if (!account) throw Errors.notFound("Org treasury");
  return account;
}

export async function findMerchantAccount(bank: Bank, merchantId: string) {
  const [account] = await bank.db
    .select()
    .from(accounts)
    .where(
      and(eq(accounts.holderType, "merchant"), eq(accounts.holderId, merchantId), eq(accounts.type, "settlement")),
    )
    .limit(1);
  if (!account) throw Errors.notFound("Merchant settlement");
  return account;
}

type PostLine = {
  accountId: string;
  direction: "debit" | "credit";
  amountCents: number;
};

export type PostTransactionInput = {
  type: string;
  amountCents: number;
  description: string;
  reference?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  agentId?: string | null;
  cardId?: string | null;
  merchantId?: string | null;
  metadata?: Record<string, unknown>;
  lines: PostLine[];
};

function applyDelta(
  normalBalance: string,
  direction: "debit" | "credit",
  amount: number,
): number {
  const increases = direction === normalBalance;
  return increases ? amount : -amount;
}

export async function postTransaction(bank: Bank, input: PostTransactionInput) {
  if (input.amountCents < 0) throw Errors.invalid("Amount must be non-negative");
  if (input.lines.length < 2) throw Errors.invalid("A transaction needs at least two ledger lines");
  for (const line of input.lines) {
    if (line.amountCents <= 0) throw Errors.invalid("Ledger lines must be positive");
  }
  const debit = input.lines.filter((l) => l.direction === "debit").reduce((s, l) => s + l.amountCents, 0);
  const credit = input.lines.filter((l) => l.direction === "credit").reduce((s, l) => s + l.amountCents, 0);
  if (debit !== credit) {
    throw Errors.invalid(`Unbalanced ledger: debit ${debit} credit ${credit}`);
  }

  const now = iso(bank.clock.now());
  const txId = id("txn");

  await bank.db.transaction(async (tx) => {
    await tx.insert(transactions).values({
      id: txId,
      type: input.type,
      status: "posted",
      amountCents: input.amountCents,
      description: input.description,
      reference: input.reference ?? null,
      fromAccountId: input.fromAccountId ?? null,
      toAccountId: input.toAccountId ?? null,
      agentId: input.agentId ?? null,
      cardId: input.cardId ?? null,
      merchantId: input.merchantId ?? null,
      metadataJson: JSON.stringify(input.metadata ?? {}),
      createdAt: now,
      postedAt: now,
    });

    for (const line of input.lines) {
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, line.accountId)).limit(1);
      if (!account) throw Errors.notFound("Account");
      const delta = applyDelta(account.normalBalance, line.direction, line.amountCents);
      const next = account.cachedBalanceCents + delta;
      if (account.holderType === "agent" && next < 0) {
        throw Errors.insufficientFunds(String(line.amountCents), String(account.cachedBalanceCents));
      }
      await tx.insert(ledgerEntries).values({
        id: id("led"),
        transactionId: txId,
        accountId: line.accountId,
        direction: line.direction,
        amountCents: line.amountCents,
        createdAt: now,
      });
      await tx
        .update(accounts)
        .set({ cachedBalanceCents: next })
        .where(eq(accounts.id, line.accountId));
    }
  });

  const [posted] = await bank.db.select().from(transactions).where(eq(transactions.id, txId)).limit(1);
  return posted!;
}

export async function transferBetween(
  bank: Bank,
  args: {
    fromAccountId: string;
    toAccountId: string;
    amountCents: number;
    type: string;
    description: string;
    agentId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  if (args.amountCents <= 0) throw Errors.invalid("Transfer amount must be positive");
  const from = await getAccount(bank, args.fromAccountId);
  const to = await getAccount(bank, args.toAccountId);

  const fromDebit = from.normalBalance === "credit";
  return postTransaction(bank, {
    type: args.type,
    amountCents: args.amountCents,
    description: args.description,
    fromAccountId: from.id,
    toAccountId: to.id,
    agentId: args.agentId ?? null,
    metadata: args.metadata,
    lines: [
      {
        accountId: from.id,
        direction: fromDebit ? "debit" : "credit",
        amountCents: args.amountCents,
      },
      {
        accountId: to.id,
        direction: to.normalBalance === "credit" ? "credit" : "debit",
        amountCents: args.amountCents,
      },
    ],
  });
}

export async function recordAudit(
  bank: Bank,
  entry: {
    actorType: string;
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    detail?: Record<string, unknown>;
  },
) {
  await bank.db.insert(auditLog).values({
    id: id("aud"),
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    detailJson: JSON.stringify(entry.detail ?? {}),
    createdAt: iso(bank.clock.now()),
  });
}

export async function listRecentTransactions(bank: Bank, limit = 50, agentId?: string) {
  const rows = agentId
    ? await bank.db
        .select()
        .from(transactions)
        .where(eq(transactions.agentId, agentId))
        .orderBy(desc(transactions.createdAt))
        .limit(limit)
    : await bank.db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(limit);
  return rows;
}

export async function circulation(bank: Bank) {
  const [row] = await bank.db
    .select({
      total: sql<number>`coalesce(sum(cached_balance_cents), 0)`,
    })
    .from(accounts)
    .where(eq(accounts.holderType, "agent"));
  return Number(row?.total ?? 0);
}
