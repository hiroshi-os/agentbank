import { and, eq, lte } from "drizzle-orm";
import { payrollRuns, payrollSchedules } from "@agentbank/db";
import { Errors } from "./errors";
import { id } from "./ids";
import {
  findAgentAccount,
  findOrgTreasury,
  postTransaction,
  recordAudit,
  type Bank,
} from "./ledger";
import { formatAgc } from "./money";
import { notify } from "./notifications";
import { advanceCadence, iso, periodStart, type Cadence } from "./time";
import { getAgent } from "./agents";

export async function runPayrollSchedule(bank: Bank, scheduleId: string) {
  const [schedule] = await bank.db
    .select()
    .from(payrollSchedules)
    .where(eq(payrollSchedules.id, scheduleId))
    .limit(1);
  if (!schedule) throw Errors.notFound("Payroll schedule");
  if (!schedule.active) throw Errors.frozen("Payroll schedule is paused");

  const agent = await getAgent(bank, schedule.agentId);
  const orgTreasury = await findOrgTreasury(bank, schedule.orgId);
  const checking = await findAgentAccount(bank, agent.id, "checking");
  const savings = await findAgentAccount(bank, agent.id, "savings");

  const savingsCut = Math.round((schedule.amountCents * schedule.savingsAllocationBps) / 10_000);
  const checkingCut = schedule.amountCents - savingsCut;
  const runAt = new Date(Math.max(bank.clock.now().getTime(), new Date(schedule.nextRunAt).getTime()));
  const periodFrom = periodStart(new Date(schedule.nextRunAt), schedule.cadence as Cadence);

  const lines: { accountId: string; direction: "debit" | "credit"; amountCents: number }[] = [
    { accountId: orgTreasury.id, direction: "debit", amountCents: schedule.amountCents },
  ];
  if (checkingCut > 0) {
    lines.push({ accountId: checking.id, direction: "credit", amountCents: checkingCut });
  }
  if (savingsCut > 0) {
    lines.push({ accountId: savings.id, direction: "credit", amountCents: savingsCut });
  }

  const tx = await postTransaction(bank, {
    type: schedule.kind,
    amountCents: schedule.amountCents,
    description: `${schedule.kind === "salary" ? "Salary" : "Stipend"} for ${agent.name}`,
    fromAccountId: orgTreasury.id,
    toAccountId: checking.id,
    agentId: agent.id,
    metadata: {
      scheduleId: schedule.id,
      cadence: schedule.cadence,
      savingsAllocationBps: schedule.savingsAllocationBps,
    },
    lines,
  });

  const nextRun = advanceCadence(new Date(schedule.nextRunAt), schedule.cadence as Cadence);
  const now = iso(bank.clock.now());
  await bank.db.insert(payrollRuns).values({
    id: id("prun"),
    scheduleId: schedule.id,
    agentId: agent.id,
    transactionId: tx.id,
    amountCents: schedule.amountCents,
    periodStart: iso(periodFrom),
    periodEnd: iso(runAt),
    createdAt: now,
  });
  await bank.db
    .update(payrollSchedules)
    .set({ lastRunAt: now, nextRunAt: iso(nextRun) })
    .where(eq(payrollSchedules.id, schedule.id));

  await notify(bank, {
    agentId: agent.id,
    type: "salary.deposited",
    title: `${schedule.kind === "salary" ? "Salary" : "Stipend"} posted`,
    body: `${formatAgc(schedule.amountCents)} landed in your accounts. Next payday ${iso(nextRun).slice(0, 10)}.`,
    dedupeKey: `salary.deposited:${schedule.id}:${schedule.nextRunAt}`,
    data: { amountCents: schedule.amountCents, transactionId: tx.id, nextRunAt: iso(nextRun) },
  });

  await recordAudit(bank, {
    actorType: "system",
    action: "payroll.run",
    entityType: "payroll_schedule",
    entityId: schedule.id,
    detail: { amountCents: schedule.amountCents, agentId: agent.id },
  });

  return { transaction: tx, nextRunAt: iso(nextRun), amountCents: schedule.amountCents, agent };
}

export async function runDuePayroll(bank: Bank) {
  const now = iso(bank.clock.now());
  const due = await bank.db
    .select()
    .from(payrollSchedules)
    .where(and(eq(payrollSchedules.active, 1), lte(payrollSchedules.nextRunAt, now)));
  const results = [];
  for (const schedule of due) {
    results.push(await runPayrollSchedule(bank, schedule.id));
  }
  return results;
}

export async function forecastPayroll(bank: Bank, agentId?: string) {
  const rows = agentId
    ? await bank.db
        .select()
        .from(payrollSchedules)
        .where(and(eq(payrollSchedules.agentId, agentId), eq(payrollSchedules.active, 1)))
    : await bank.db.select().from(payrollSchedules).where(eq(payrollSchedules.active, 1));

  const now = bank.clock.now();
  return rows.map((schedule) => {
    const next = new Date(schedule.nextRunAt);
    const ms = next.getTime() - now.getTime();
    return {
      ...schedule,
      predictedAmountCents: schedule.amountCents,
      predictedAt: schedule.nextRunAt,
      hoursUntil: Math.round(ms / 3_600_000),
      isOverdue: ms <= 0,
    };
  });
}

export async function emitSalaryPredictions(bank: Bank, horizonDays: number) {
  const forecasts = await forecastPayroll(bank);
  const now = bank.clock.now();
  let created = 0;
  for (const item of forecasts) {
    const next = new Date(item.nextRunAt);
    const days = (next.getTime() - now.getTime()) / 86_400_000;
    if (days < 0 || days > horizonDays) continue;
    const agent = await getAgent(bank, item.agentId);
    const result = await notify(bank, {
      agentId: item.agentId,
      type: "salary.predicted",
      title: `Payday predicted: ${formatAgc(item.amountCents)}`,
      body: `${agent.name}'s ${item.kind} of ${formatAgc(item.amountCents)} is predicted on ${item.nextRunAt.slice(0, 16).replace("T", " ")} UTC.`,
      dedupeKey: `salary.predicted:${item.id}:${item.nextRunAt}`,
      data: {
        scheduleId: item.id,
        amountCents: item.amountCents,
        predictedAt: item.nextRunAt,
        kind: item.kind,
      },
    });
    if (result.created) created += 1;
  }
  return created;
}
