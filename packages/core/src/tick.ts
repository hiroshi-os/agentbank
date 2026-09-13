import { accrueInterest, getSettings } from "./interest";
import type { Bank } from "./ledger";
import { emitSalaryPredictions, runDuePayroll } from "./payroll";
import { runDuePurchaseIntents } from "./purchases";

export async function tick(bank: Bank) {
  const settings = await getSettings(bank);
  const interest = await accrueInterest(bank);
  const payroll = await runDuePayroll(bank);
  const predicted = await emitSalaryPredictions(bank, settings?.salaryPredictDays ?? 3);
  const intents = await runDuePurchaseIntents(bank);
  return {
    interest,
    payrollPosted: payroll.length,
    salaryPredictions: predicted,
    purchaseIntents: intents.length,
    at: bank.clock.now().toISOString(),
  };
}
