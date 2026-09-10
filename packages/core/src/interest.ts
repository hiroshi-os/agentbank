import { eq } from "drizzle-orm";
import { accounts, bankSettings } from "@agentbank/db";
import { findBankAccount, postTransaction, recordAudit, type Bank } from "./ledger";
import { dailyInterestMicros, formatAgc } from "./money";
import { notify } from "./notifications";
import { daysBetween, iso, startOfUtcDay, ymd } from "./time";

function apyFor(type: string, checkingApyBps: number, savingsApyBps: number): number {
  if (type === "savings") return savingsApyBps;
  if (type === "checking") return checkingApyBps;
  return 0;
}

export async function accrueInterest(bank: Bank) {
  const [settings] = await bank.db.select().from(bankSettings).limit(1);
  if (!settings) return { days: 0, posted: 0, totalCents: 0 };

  const today = startOfUtcDay(bank.clock.now());
  const last = settings.lastInterestDate ? startOfUtcDay(new Date(settings.lastInterestDate + "T00:00:00Z")) : null;
  const from = last ? new Date(last.getTime() + 86_400_000) : today;
  const days = last ? daysBetween(from, new Date(today.getTime() + 86_400_000)) : 0;
  if (days <= 0) return { days: 0, posted: 0, totalCents: 0 };

  const interestBearing = await bank.db
    .select()
    .from(accounts)
    .where(eq(accounts.holderType, "agent"));

  const treasury = await findBankAccount(bank, "treasury");
  let posted = 0;
  let totalCents = 0;

  for (let d = 0; d < days; d++) {
    for (const account of interestBearing) {
      const [fresh] = await bank.db.select().from(accounts).where(eq(accounts.id, account.id)).limit(1);
      if (!fresh) continue;
      const apy = apyFor(fresh.type, settings.checkingApyBps, settings.savingsApyBps);
      const micros = dailyInterestMicros(fresh.cachedBalanceCents, apy);
      const accrued = fresh.accruedMicros + micros;
      const cents = Math.floor(accrued / 1_000_000);
      const remainder = accrued % 1_000_000;
      if (cents > 0) {
        await postTransaction(bank, {
          type: "interest",
          amountCents: cents,
          description: `Daily ${fresh.type} interest`,
          fromAccountId: treasury.id,
          toAccountId: fresh.id,
          agentId: fresh.holderId,
          metadata: { apyBps: apy, accountType: fresh.type },
          lines: [
            { accountId: treasury.id, direction: "debit", amountCents: cents },
            { accountId: fresh.id, direction: "credit", amountCents: cents },
          ],
        });
        await bank.db.update(accounts).set({ accruedMicros: remainder }).where(eq(accounts.id, fresh.id));
        posted += 1;
        totalCents += cents;
        await notify(bank, {
          agentId: fresh.holderId,
          type: "interest.paid",
          title: "Interest posted",
          body: `${formatAgc(cents)} interest credited to ${fresh.type}.`,
          dedupeKey: `interest.paid:${fresh.id}:${ymd(new Date(from.getTime() + d * 86_400_000))}`,
          data: { amountCents: cents, accountType: fresh.type },
        });
      } else {
        await bank.db.update(accounts).set({ accruedMicros: accrued }).where(eq(accounts.id, fresh.id));
      }
    }
  }

  await bank.db
    .update(bankSettings)
    .set({ lastInterestDate: ymd(today), updatedAt: iso(bank.clock.now()) })
    .where(eq(bankSettings.id, settings.id));

  await recordAudit(bank, {
    actorType: "system",
    action: "interest.accrue",
    entityType: "bank",
    detail: { days, posted, totalCents },
  });

  return { days, posted, totalCents };
}

export async function updateRates(
  bank: Bank,
  input: { checkingApyBps?: number; savingsApyBps?: number; interchangeBps?: number; salaryPredictDays?: number },
) {
  const [settings] = await bank.db.select().from(bankSettings).limit(1);
  if (!settings) throw new Error("Bank is not initialized");
  await bank.db
    .update(bankSettings)
    .set({
      checkingApyBps: input.checkingApyBps ?? settings.checkingApyBps,
      savingsApyBps: input.savingsApyBps ?? settings.savingsApyBps,
      interchangeBps: input.interchangeBps ?? settings.interchangeBps,
      salaryPredictDays: input.salaryPredictDays ?? settings.salaryPredictDays,
      updatedAt: iso(bank.clock.now()),
    })
    .where(eq(bankSettings.id, 1));
  return (await bank.db.select().from(bankSettings).where(eq(bankSettings.id, 1)))[0]!;
}

export async function getSettings(bank: Bank) {
  const [settings] = await bank.db.select().from(bankSettings).limit(1);
  return settings ?? null;
}

