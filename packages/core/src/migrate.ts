import type { Client } from "@libsql/client";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS bank_settings (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    legal_name TEXT NOT NULL,
    currency_code TEXT NOT NULL,
    currency_name TEXT NOT NULL,
    checking_apy_bps INTEGER NOT NULL,
    savings_apy_bps INTEGER NOT NULL,
    interchange_bps INTEGER NOT NULL,
    salary_predict_days INTEGER NOT NULL,
    last_interest_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS orgs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    mission TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id),
    name TEXT NOT NULL,
    handle TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    model_family TEXT NOT NULL,
    status TEXT NOT NULL,
    avatar_hue INTEGER NOT NULL,
    bio TEXT NOT NULL,
    hired_at TEXT NOT NULL,
    purchase_enabled INTEGER NOT NULL,
    daily_spend_limit_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS agents_org_idx ON agents(org_id)`,
  `CREATE INDEX IF NOT EXISTS agents_status_idx ON agents(status)`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    holder_type TEXT NOT NULL,
    holder_id TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    normal_balance TEXT NOT NULL,
    cached_balance_cents INTEGER NOT NULL,
    accrued_micros INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS accounts_holder_idx ON accounts(holder_type, holder_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS accounts_holder_type_uniq ON accounts(holder_type, holder_id, type)`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    description TEXT NOT NULL,
    reference TEXT,
    from_account_id TEXT REFERENCES accounts(id),
    to_account_id TEXT REFERENCES accounts(id),
    agent_id TEXT REFERENCES agents(id),
    card_id TEXT,
    merchant_id TEXT,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    posted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS tx_agent_idx ON transactions(agent_id)`,
  `CREATE INDEX IF NOT EXISTS tx_created_idx ON transactions(created_at)`,
  `CREATE INDEX IF NOT EXISTS tx_type_idx ON transactions(type)`,
  `CREATE INDEX IF NOT EXISTS tx_status_idx ON transactions(status)`,
  `CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(id),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    direction TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ledger_tx_idx ON ledger_entries(transaction_id)`,
  `CREATE INDEX IF NOT EXISTS ledger_account_idx ON ledger_entries(account_id)`,
  `CREATE TABLE IF NOT EXISTS payroll_schedules (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    org_id TEXT NOT NULL REFERENCES orgs(id),
    kind TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    cadence TEXT NOT NULL,
    next_run_at TEXT NOT NULL,
    last_run_at TEXT,
    active INTEGER NOT NULL,
    savings_allocation_bps INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS payroll_next_idx ON payroll_schedules(next_run_at)`,
  `CREATE INDEX IF NOT EXISTS payroll_agent_idx ON payroll_schedules(agent_id)`,
  `CREATE TABLE IF NOT EXISTS payroll_runs (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL REFERENCES payroll_schedules(id),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    transaction_id TEXT NOT NULL REFERENCES transactions(id),
    amount_cents INTEGER NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    label TEXT NOT NULL,
    pan TEXT NOT NULL UNIQUE,
    last4 TEXT NOT NULL,
    cvv TEXT NOT NULL,
    exp_month INTEGER NOT NULL,
    exp_year INTEGER NOT NULL,
    status TEXT NOT NULL,
    daily_limit_cents INTEGER NOT NULL,
    monthly_limit_cents INTEGER NOT NULL,
    per_txn_limit_cents INTEGER NOT NULL,
    allowed_mccs_json TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS cards_agent_idx ON cards(agent_id)`,
  `CREATE INDEX IF NOT EXISTS cards_status_idx ON cards(status)`,
  `CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    mcc TEXT NOT NULL,
    description TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    card_id TEXT NOT NULL REFERENCES cards(id),
    merchant_id TEXT NOT NULL REFERENCES merchants(id),
    transaction_id TEXT REFERENCES transactions(id),
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL,
    memo TEXT NOT NULL,
    decline_reason TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS purchases_agent_idx ON purchases(agent_id)`,
  `CREATE INDEX IF NOT EXISTS purchases_created_idx ON purchases(created_at)`,
  `CREATE TABLE IF NOT EXISTS purchase_intents (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    merchant_id TEXT REFERENCES merchants(id),
    label TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    cadence TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    last_run_at TEXT,
    next_run_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    agent_id TEXT REFERENCES agents(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    dedupe_key TEXT NOT NULL,
    data_json TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_uniq ON notifications(dedupe_key)`,
  `CREATE INDEX IF NOT EXISTS notifications_agent_idx ON notifications(agent_id)`,
  `CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications(created_at)`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    plaintext_demo TEXT,
    last_used_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS api_keys_agent_idx ON api_keys(agent_id)`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor_type TEXT NOT NULL,
    actor_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    detail_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at)`,
];

export async function migrate(client: Client) {
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute("PRAGMA journal_mode = WAL");
  for (const statement of STATEMENTS) {
    await client.execute(statement);
  }
}
