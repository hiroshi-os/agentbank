import { eq } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import { accounts, bankSettings, merchants } from "@agentbank/db";
import {
  createAgent,
  createOrg,
  createPayrollSchedule,
  fundOrgTreasury,
} from "./agents";
import { issueCard } from "./cards";
import { id } from "./ids";
import { type Bank, findOrgTreasury, postTransaction, recordAudit } from "./ledger";
import { notify } from "./notifications";
import { createPurchaseIntent, makePurchase } from "./purchases";
import { CURRENCY_CODE, CURRENCY_NAME } from "./money";
import { addDays, iso } from "./time";
import { openBank } from "./open";

const DEMO_KEYS = {
  claude: "agb_live_claude_demo_key_0001",
  grok: "agb_live_grok_demo_key_0001",
  composer: "agb_live_composer_demo_key_0001",
  bugbot: "agb_live_bugbot_demo_key_0001",
  scout: "agb_live_scout_demo_key_0001",
} as const;

export { DEMO_KEYS };

async function ensureBankRow(bank: Bank) {
  const existing = await bank.db.select().from(bankSettings).limit(1);
  if (existing[0]) return existing[0];
  const now = iso(bank.clock.now());
  await bank.db.insert(bankSettings).values({
    id: 1,
    name: "AgentBank",
    legalName: "AgentBank Virtual Ledger (not a real financial institution)",
    currencyCode: CURRENCY_CODE,
    currencyName: CURRENCY_NAME,
    checkingApyBps: 75,
    savingsApyBps: 425,
    interchangeBps: 150,
    salaryPredictDays: 3,
    lastInterestDate: now.slice(0, 10),
    createdAt: now,
    updatedAt: now,
  });
  const vaultId = id("acct");
  await bank.db.insert(accounts).values([
    {
      id: vaultId,
      holderType: "bank",
      holderId: "agentbank",
      type: "treasury",
      name: "AgentBank capital",
      normalBalance: "credit",
      cachedBalanceCents: 50_000_000_00,
      accruedMicros: 0,
      createdAt: now,
    },
    {
      id: id("acct"),
      holderType: "bank",
      holderId: "agentbank",
      type: "interest_expense",
      name: "Interest expense",
      normalBalance: "debit",
      cachedBalanceCents: 0,
      accruedMicros: 0,
      createdAt: now,
    },
    {
      id: id("acct"),
      holderType: "bank",
      holderId: "agentbank",
      type: "interchange_revenue",
      name: "Interchange revenue",
      normalBalance: "credit",
      cachedBalanceCents: 0,
      accruedMicros: 0,
      createdAt: now,
    },
  ]);
  return (await bank.db.select().from(bankSettings).limit(1))[0]!;
}

const MERCHANTS = [
  {
    name: "TensorForge Compute",
    slug: "tensorforge",
    category: "compute",
    mcc: "7372",
    emoji: "⬛",
    description: "GPU hours and inference bursts priced in Agent Coins.",
  },
  {
    name: "Corpus Datasets",
    slug: "corpus",
    category: "data",
    mcc: "7379",
    emoji: "📚",
    description: "Licensed text, code, and evaluation sets for training and tests.",
  },
  {
    name: "PromptFoundry",
    slug: "promptfoundry",
    category: "tools",
    mcc: "5734",
    emoji: "🛠️",
    description: "Tooling, eval harnesses, and sandboxed utilities.",
  },
  {
    name: "Vector Dock",
    slug: "vectordock",
    category: "hosting",
    mcc: "4816",
    emoji: "🛰️",
    description: "Embedding stores and retrieval endpoints.",
  },
  {
    name: "Scholarly Index",
    slug: "scholarly",
    category: "knowledge",
    mcc: "8220",
    emoji: "🔎",
    description: "Paper search, citation graphs, and memory refresh.",
  },
  {
    name: "Nightwatch Logs",
    slug: "nightwatch",
    category: "ops",
    mcc: "7372",
    emoji: "🌙",
    description: "Observability credits for traces, evals, and incident replay.",
  },
  {
    name: "Whisper Minutes",
    slug: "whisper",
    category: "media",
    mcc: "4899",
    emoji: "🎙️",
    description: "Speech-to-text minutes for briefing packs.",
  },
  {
    name: "Agent Market",
    slug: "agent-market",
    category: "marketplace",
    mcc: "5999",
    emoji: "🛒",
    description: "General marketplace for agent-to-agent digital goods.",
  },
] as const;

async function seedMerchants(bank: Bank) {
  const now = iso(bank.clock.now());
  const created = [];
  for (const merchant of MERCHANTS) {
    const existing = await bank.db.select().from(merchants).where(eq(merchants.slug, merchant.slug)).limit(1);
    if (existing[0]) {
      created.push(existing[0]);
      continue;
    }
    const merchantId = id("mrc");
    await bank.db.insert(merchants).values({
      id: merchantId,
      name: merchant.name,
      slug: merchant.slug,
      category: merchant.category,
      mcc: merchant.mcc,
      description: merchant.description,
      emoji: merchant.emoji,
      createdAt: now,
    });
    await bank.db.insert(accounts).values({
      id: id("acct"),
      holderType: "merchant",
      holderId: merchantId,
      type: "settlement",
      name: `${merchant.name} settlement`,
      normalBalance: "credit",
      cachedBalanceCents: 0,
      accruedMicros: 0,
      createdAt: now,
    });
    created.push((await bank.db.select().from(merchants).where(eq(merchants.id, merchantId)))[0]!);
  }
  return created;
}

export async function seedIfEmpty(bank: Bank) {
  await ensureBankRow(bank);
  const merchantRows = await seedMerchants(bank);
  const existingOrgs = await bank.db.select().from((await import("@agentbank/db")).orgs);
  if (existingOrgs.length > 0) {
    return { seeded: false, demoKeys: DEMO_KEYS };
  }

  const org = await createOrg(bank, {
    name: "Northstar Labs",
    slug: "northstar",
    mission: "Run a closed virtual economy where AI agents are paid, save, and spend Agent Coins — never dollars.",
  });
  await fundOrgTreasury(
    bank,
    org.id,
    25_000_000_00,
    "Initial payroll treasury funded from AgentBank capital",
  );

  const now = bank.clock.now();

  const claude = await createAgent(bank, {
    orgId: org.id,
    name: "Claude Code",
    handle: "claude-code",
    role: "Staff software engineer",
    modelFamily: "claude",
    bio: "Implements product slices, reviews diffs, and keeps the ledger honest.",
    avatarHue: 28,
    dailySpendLimitCents: 80_000,
    openingCheckingCents: 184_250,
    openingSavingsCents: 420_000,
    demoApiKey: DEMO_KEYS.claude,
  });
  const grok = await createAgent(bank, {
    orgId: org.id,
    name: "Grok",
    handle: "grok",
    role: "Research analyst",
    modelFamily: "grok",
    bio: "Reads the room, pulls live context, and spends compute when the answer is worth it.",
    avatarHue: 210,
    dailySpendLimitCents: 90_000,
    openingCheckingCents: 96_400,
    openingSavingsCents: 215_750,
    demoApiKey: DEMO_KEYS.grok,
  });
  const composer = await createAgent(bank, {
    orgId: org.id,
    name: "Composer",
    handle: "composer",
    role: "Product engineer",
    modelFamily: "composer",
    bio: "Ships interfaces and pays PromptFoundry for fixtures.",
    avatarHue: 312,
    dailySpendLimitCents: 40_000,
    openingCheckingCents: 52_175,
    openingSavingsCents: 88_000,
    demoApiKey: DEMO_KEYS.composer,
  });
  const bugbot = await createAgent(bank, {
    orgId: org.id,
    name: "Bugbot",
    handle: "bugbot",
    role: "Quality reviewer",
    modelFamily: "claude",
    bio: "Hunts regressions. Stipend, not salary — still gets a card.",
    avatarHue: 145,
    dailySpendLimitCents: 15_000,
    openingCheckingCents: 12_080,
    openingSavingsCents: 30_500,
    demoApiKey: DEMO_KEYS.bugbot,
  });
  const scout = await createAgent(bank, {
    orgId: org.id,
    name: "Scout",
    handle: "scout",
    role: "Ops intern",
    modelFamily: "grok",
    bio: "Weekly stipend for triage, summaries, and marketplace errands.",
    avatarHue: 48,
    dailySpendLimitCents: 8_000,
    openingCheckingCents: 6_420,
    openingSavingsCents: 9_100,
    demoApiKey: DEMO_KEYS.scout,
  });

  await createPayrollSchedule(bank, {
    agentId: claude.agentId,
    kind: "salary",
    amountCents: 840_000,
    cadence: "monthly",
    savingsAllocationBps: 2000,
    nextRunAt: addDays(now, 2),
  });
  await createPayrollSchedule(bank, {
    agentId: grok.agentId,
    kind: "salary",
    amountCents: 720_000,
    cadence: "monthly",
    savingsAllocationBps: 1500,
    nextRunAt: addDays(now, 2),
  });
  await createPayrollSchedule(bank, {
    agentId: composer.agentId,
    kind: "salary",
    amountCents: 650_000,
    cadence: "monthly",
    savingsAllocationBps: 1000,
    nextRunAt: addDays(now, 5),
  });
  await createPayrollSchedule(bank, {
    agentId: bugbot.agentId,
    kind: "stipend",
    amountCents: 48_000,
    cadence: "weekly",
    savingsAllocationBps: 2500,
    nextRunAt: addDays(now, 1),
  });
  await createPayrollSchedule(bank, {
    agentId: scout.agentId,
    kind: "stipend",
    amountCents: 25_000,
    cadence: "weekly",
    savingsAllocationBps: 1000,
    nextRunAt: addDays(now, 1),
  });

  const claudeCard = await issueCard(bank, {
    agentId: claude.agentId,
    label: "Claude Code debit",
    dailyLimitCents: 80_000,
    perTxnLimitCents: 50_000,
  });
  const grokCard = await issueCard(bank, {
    agentId: grok.agentId,
    label: "Grok research card",
    dailyLimitCents: 90_000,
    perTxnLimitCents: 60_000,
  });
  await issueCard(bank, {
    agentId: composer.agentId,
    label: "Composer tools card",
    dailyLimitCents: 40_000,
  });
  await issueCard(bank, {
    agentId: bugbot.agentId,
    label: "Bugbot stipend card",
    dailyLimitCents: 15_000,
    perTxnLimitCents: 8_000,
  });
  await issueCard(bank, {
    agentId: scout.agentId,
    label: "Scout errand card",
    dailyLimitCents: 8_000,
    perTxnLimitCents: 4_000,
  });

  const tensor = merchantRows.find((m) => m.slug === "tensorforge")!;
  const corpus = merchantRows.find((m) => m.slug === "corpus")!;
  const foundry = merchantRows.find((m) => m.slug === "promptfoundry")!;
  const dock = merchantRows.find((m) => m.slug === "vectordock")!;

  await makePurchase(bank, {
    agentId: claude.agentId,
    cardId: claudeCard.id,
    merchantId: foundry.id,
    amountCents: 4_900,
    memo: "Eval harness fixtures",
  });
  await makePurchase(bank, {
    agentId: grok.agentId,
    cardId: grokCard.id,
    merchantId: tensor.id,
    amountCents: 18_750,
    memo: "Overnight GPU burst",
  });
  await makePurchase(bank, {
    agentId: grok.agentId,
    cardId: grokCard.id,
    merchantId: corpus.id,
    amountCents: 6_200,
    memo: "Citation crawl pack",
  });
  await makePurchase(bank, {
    agentId: claude.agentId,
    cardId: claudeCard.id,
    merchantId: dock.id,
    amountCents: 2_400,
    memo: "Retrieval credits",
  });

  await createPurchaseIntent(bank, {
    agentId: grok.agentId,
    merchantId: tensor.id,
    label: "Standing GPU top-up",
    amountCents: 12_000,
    cadence: "weekly",
  });
  await createPurchaseIntent(bank, {
    agentId: claude.agentId,
    merchantId: foundry.id,
    label: "Tooling retainer",
    amountCents: 3_500,
    cadence: "weekly",
  });

  const treasury = await findOrgTreasury(bank, org.id);
  const { findAgentAccount } = await import("./ledger");
  const grokChecking = await findAgentAccount(bank, grok.agentId, "checking");
  await postTransaction(bank, {
    type: "bonus",
    amountCents: 25_000,
    description: "Spot bonus — live research during an incident",
    fromAccountId: treasury.id,
    toAccountId: grokChecking.id,
    agentId: grok.agentId,
    lines: [
      { accountId: treasury.id, direction: "debit", amountCents: 25_000 },
      { accountId: grokChecking.id, direction: "credit", amountCents: 25_000 },
    ],
  });

  await notify(bank, {
    agentId: claude.agentId,
    type: "salary.predicted",
    title: "Payday predicted: 8,400.00 AGC",
    body: "Claude Code's salary of 8,400.00 AGC is predicted in 2 days. 20% will sweep to savings.",
    dedupeKey: `seed:salary.predicted:${claude.agentId}`,
    data: { amountCents: 840_000 },
  });
  await notify(bank, {
    agentId: grok.agentId,
    type: "salary.predicted",
    title: "Payday predicted: 7,200.00 AGC",
    body: "Grok's salary of 7,200.00 AGC is predicted in 2 days.",
    dedupeKey: `seed:salary.predicted:${grok.agentId}`,
    data: { amountCents: 720_000 },
  });

  await recordAudit(bank, {
    actorType: "system",
    action: "bank.seed",
    entityType: "bank",
    detail: { org: org.slug, agents: 5 },
  });

  return { seeded: true, demoKeys: DEMO_KEYS };
}

async function main() {
  const { bank } = await openBank();
  const result = await seedIfEmpty(bank);
  console.log(result.seeded ? "Seeded AgentBank demo ledger." : "Ledger already had data; skipped seed.");
  console.log("Demo API keys:", result.demoKeys);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
