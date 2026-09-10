import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const bankSettings = sqliteTable("bank_settings", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  legalName: text("legal_name").notNull(),
  currencyCode: text("currency_code").notNull(),
  currencyName: text("currency_name").notNull(),
  checkingApyBps: integer("checking_apy_bps").notNull(),
  savingsApyBps: integer("savings_apy_bps").notNull(),
  interchangeBps: integer("interchange_bps").notNull(),
  salaryPredictDays: integer("salary_predict_days").notNull(),
  lastInterestDate: text("last_interest_date"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const orgs = sqliteTable("orgs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  mission: text("mission").notNull(),
  createdAt: text("created_at").notNull(),
});

export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    name: text("name").notNull(),
    handle: text("handle").notNull().unique(),
    role: text("role").notNull(),
    modelFamily: text("model_family").notNull(),
    status: text("status").notNull(),
    avatarHue: integer("avatar_hue").notNull(),
    bio: text("bio").notNull(),
    hiredAt: text("hired_at").notNull(),
    purchaseEnabled: integer("purchase_enabled").notNull(),
    dailySpendLimitCents: integer("daily_spend_limit_cents").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("agents_org_idx").on(t.orgId), index("agents_status_idx").on(t.status)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    holderType: text("holder_type").notNull(),
    holderId: text("holder_id").notNull(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    normalBalance: text("normal_balance").notNull(),
    cachedBalanceCents: integer("cached_balance_cents").notNull(),
    accruedMicros: integer("accrued_micros").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("accounts_holder_idx").on(t.holderType, t.holderId),
    uniqueIndex("accounts_holder_type_uniq").on(t.holderType, t.holderId, t.type),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull(),
    reference: text("reference"),
    fromAccountId: text("from_account_id").references(() => accounts.id),
    toAccountId: text("to_account_id").references(() => accounts.id),
    agentId: text("agent_id").references(() => agents.id),
    cardId: text("card_id"),
    merchantId: text("merchant_id"),
    metadataJson: text("metadata_json").notNull(),
    createdAt: text("created_at").notNull(),
    postedAt: text("posted_at"),
  },
  (t) => [
    index("tx_agent_idx").on(t.agentId),
    index("tx_created_idx").on(t.createdAt),
    index("tx_type_idx").on(t.type),
    index("tx_status_idx").on(t.status),
  ],
);

export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    direction: text("direction").notNull(),
    amountCents: integer("amount_cents").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("ledger_tx_idx").on(t.transactionId),
    index("ledger_account_idx").on(t.accountId),
  ],
);

export const payrollSchedules = sqliteTable(
  "payroll_schedules",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    kind: text("kind").notNull(),
    amountCents: integer("amount_cents").notNull(),
    cadence: text("cadence").notNull(),
    nextRunAt: text("next_run_at").notNull(),
    lastRunAt: text("last_run_at"),
    active: integer("active").notNull(),
    savingsAllocationBps: integer("savings_allocation_bps").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("payroll_next_idx").on(t.nextRunAt), index("payroll_agent_idx").on(t.agentId)],
);

export const payrollRuns = sqliteTable("payroll_runs", {
  id: text("id").primaryKey(),
  scheduleId: text("schedule_id")
    .notNull()
    .references(() => payrollSchedules.id),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id),
  transactionId: text("transaction_id")
    .notNull()
    .references(() => transactions.id),
  amountCents: integer("amount_cents").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  createdAt: text("created_at").notNull(),
});

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    label: text("label").notNull(),
    pan: text("pan").notNull().unique(),
    last4: text("last4").notNull(),
    cvv: text("cvv").notNull(),
    expMonth: integer("exp_month").notNull(),
    expYear: integer("exp_year").notNull(),
    status: text("status").notNull(),
    dailyLimitCents: integer("daily_limit_cents").notNull(),
    monthlyLimitCents: integer("monthly_limit_cents").notNull(),
    perTxnLimitCents: integer("per_txn_limit_cents").notNull(),
    allowedMccsJson: text("allowed_mccs_json"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("cards_agent_idx").on(t.agentId), index("cards_status_idx").on(t.status)],
);

export const merchants = sqliteTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull(),
  mcc: text("mcc").notNull(),
  description: text("description").notNull(),
  emoji: text("emoji").notNull(),
  createdAt: text("created_at").notNull(),
});

export const purchases = sqliteTable(
  "purchases",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    transactionId: text("transaction_id").references(() => transactions.id),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull(),
    memo: text("memo").notNull(),
    declineReason: text("decline_reason"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("purchases_agent_idx").on(t.agentId), index("purchases_created_idx").on(t.createdAt)],
);

export const purchaseIntents = sqliteTable("purchase_intents", {
  id: text("id").primaryKey(),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id),
  merchantId: text("merchant_id").references(() => merchants.id),
  label: text("label").notNull(),
  amountCents: integer("amount_cents").notNull(),
  cadence: text("cadence").notNull(),
  enabled: integer("enabled").notNull(),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
  createdAt: text("created_at").notNull(),
});

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").references(() => agents.id),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    dataJson: text("data_json").notNull(),
    readAt: text("read_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_uniq").on(t.dedupeKey),
    index("notifications_agent_idx").on(t.agentId),
    index("notifications_created_idx").on(t.createdAt),
  ],
);

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(),
    plaintextDemo: text("plaintext_demo"),
    lastUsedAt: text("last_used_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("api_keys_agent_idx").on(t.agentId)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    detailJson: text("detail_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

export const schema = {
  bankSettings,
  orgs,
  agents,
  accounts,
  transactions,
  ledgerEntries,
  payrollSchedules,
  payrollRuns,
  cards,
  merchants,
  purchases,
  purchaseIntents,
  notifications,
  apiKeys,
  auditLog,
};
