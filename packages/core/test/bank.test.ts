import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { accounts, payrollSchedules } from "@agentbank/db";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createAgent, createOrg, createPayrollSchedule, fundOrgTreasury } from "../src/agents";
import { issueCard } from "../src/cards";
import { BankError } from "../src/errors";
import { accrueInterest } from "../src/interest";
import { findAgentAccount } from "../src/ledger";
import { dailyInterestMicros, formatAgc, parseAgcToCents } from "../src/money";
import { listNotifications } from "../src/notifications";
import { openBank } from "../src/open";
import { emitSalaryPredictions, runDuePayroll } from "../src/payroll";
import { makePurchase } from "../src/purchases";
import { seedIfEmpty } from "../src/seed";
import { tick } from "../src/tick";
import { transferOwn, transferToAgent } from "../src/transfers";
import type { Bank } from "../src/ledger";

class MutableClock {
  constructor(public current: Date) {}
  now() {
    return this.current;
  }
  addDays(days: number) {
    this.current = new Date(this.current.getTime() + days * 86_400_000);
  }
}

describe("money", () => {
  it("formats and parses Agent Coins", () => {
    expect(formatAgc(184250)).toBe("1,842.50 AGC");
    expect(parseAgcToCents("1,842.50 AGC")).toBe(184250);
    expect(dailyInterestMicros(1_000_000, 3650)).toBeGreaterThan(0);
  });
});

describe("ledger", () => {
  let dir: string;
  let bank: Bank;
  let clock: MutableClock;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "agentbank-"));
    clock = new MutableClock(new Date("2026-09-10T12:00:00Z"));
    const opened = await openBank({ url: `file:${join(dir, "test.db")}`, clock });
    bank = opened.bank;
    await seedIfEmpty(bank);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("seeds a closed virtual economy", async () => {
    const agentRows = await bank.db.select().from((await import("@agentbank/db")).agents);
    expect(agentRows.length).toBe(5);
    const checking = await findAgentAccount(bank, agentRows.find((a) => a.handle === "claude-code")!.id, "checking");
    expect(checking.cachedBalanceCents).toBeGreaterThan(0);
  });

  it("posts salary when due and notifies the agent", async () => {
    const [schedule] = await bank.db
      .select()
      .from(payrollSchedules)
      .where(eq(payrollSchedules.kind, "stipend"));
    clock.current = new Date(new Date(schedule!.nextRunAt).getTime() + 1000);
    const posted = await runDuePayroll(bank);
    expect(posted.length).toBeGreaterThan(0);
    const notes = await listNotifications(bank, posted[0]!.agent.id);
    expect(notes.some((n) => n.type === "salary.deposited")).toBe(true);
  });

  it("predicts upcoming salaries", async () => {
    const created = await emitSalaryPredictions(bank, 7);
    expect(created).toBeGreaterThan(0);
    const notes = await listNotifications(bank);
    expect(notes.some((n) => n.type === "salary.predicted")).toBe(true);
  });

  it("compounds daily savings interest from bank capital", async () => {
    const agentRows = await bank.db.select().from((await import("@agentbank/db")).agents);
    const grok = agentRows.find((a) => a.handle === "grok")!;
    const savings = await findAgentAccount(bank, grok.id, "savings");
    const before = savings.cachedBalanceCents;
    clock.addDays(1);
    const result = await accrueInterest(bank);
    expect(result.days).toBe(1);
    const after = await findAgentAccount(bank, grok.id, "savings");
    expect(after.cachedBalanceCents).toBeGreaterThanOrEqual(before);
    expect(result.totalCents).toBeGreaterThan(0);
  });

  it("declines a purchase that exceeds the card limit", async () => {
    const agentRows = await bank.db.select().from((await import("@agentbank/db")).agents);
    const scout = agentRows.find((a) => a.handle === "scout")!;
    const { cards, merchants } = await import("@agentbank/db");
    const [card] = await bank.db.select().from(cards).where(eq(cards.agentId, scout.id));
    const [merchant] = await bank.db.select().from(merchants);
    await expect(
      makePurchase(bank, {
        agentId: scout.id,
        cardId: card!.id,
        merchantId: merchant!.id,
        amountCents: 500_000,
        memo: "too much",
      }),
    ).rejects.toBeInstanceOf(BankError);
  });

  it("moves coins checking → savings and agent → agent", async () => {
    const agentRows = await bank.db.select().from((await import("@agentbank/db")).agents);
    const claude = agentRows.find((a) => a.handle === "claude-code")!;
    const checking = await findAgentAccount(bank, claude.id, "checking");
    await transferOwn(bank, {
      agentId: claude.id,
      from: "checking",
      to: "savings",
      amountCents: 1_000,
    });
    const after = await findAgentAccount(bank, claude.id, "checking");
    expect(after.cachedBalanceCents).toBe(checking.cachedBalanceCents - 1_000);
    await transferToAgent(bank, {
      fromAgentId: claude.id,
      toHandle: "bugbot",
      amountCents: 500,
      memo: "bug bounty",
    });
  });

  it("keeps the ledger balanced across a banking tick", async () => {
    clock.addDays(2);
    await tick(bank);
    const rows = await bank.db.select().from(accounts);
    const debitNormal = rows.filter((a) => a.normalBalance === "debit");
    const creditNormal = rows.filter((a) => a.normalBalance === "credit");
    const debitSum = debitNormal.reduce((s, a) => s + a.cachedBalanceCents, 0);
    const creditSum = creditNormal.reduce((s, a) => s + a.cachedBalanceCents, 0);
    expect(creditSum - debitSum).toBeGreaterThan(0);
  });

  it("issues a virtual PAN that is not a real network BIN", async () => {
    const org = await createOrg(bank, { name: "Temp", slug: "temp-org", mission: "test" });
    await fundOrgTreasury(bank, org.id, 10_000, "test fund");
    const agent = await createAgent(bank, {
      orgId: org.id,
      name: "Temp Agent",
      handle: "temp-agent",
      role: "tester",
      modelFamily: "test",
      bio: "ephemeral",
      openingCheckingCents: 5_000,
    });
    const card = await issueCard(bank, { agentId: agent.agentId });
    expect(card.pan.startsWith("000000")).toBe(true);
    expect(card.pan).toHaveLength(16);
  });
});
