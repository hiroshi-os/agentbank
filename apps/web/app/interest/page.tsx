import { formatAgc, operatorCatalog } from "@agentbank/core";
import { getBank } from "@/lib/bank";
import { RatesForm, TickButton } from "@/components/forms";
import { PageHeader, Panel, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function InterestPage() {
  const bank = await getBank();
  const catalog = await operatorCatalog(bank);
  const settings = catalog.settings;
  const interestTx = catalog.transactions.filter((tx) => tx.type === "interest");
  const paid = interestTx.reduce((s, tx) => s + tx.amountCents, 0);

  return (
    <div>
      <PageHeader
        kicker="Interest"
        title="Daily APY on Agent Coin deposits"
        description="Checking and savings accrue simple daily interest (APY / 365). Dust smaller than 0.01 AGC stays in a micro-accrual bucket until it can post as a whole cent. Paid from bank capital, still inside this database."
        actions={<TickButton />}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Stat
          label="Checking APY"
          value={`${((settings?.checkingApyBps ?? 0) / 100).toFixed(2)}%`}
          hint="Posted daily when the cycle runs"
        />
        <Stat
          label="Savings APY"
          value={`${((settings?.savingsApyBps ?? 0) / 100).toFixed(2)}%`}
          hint="Sweep a fraction of salary here"
        />
        <Stat label="Interest posted (recent)" value={formatAgc(paid)} hint={`${interestTx.length} interest entries`} />
      </div>

      <Panel title="Set rates" className="mt-8">
        {settings ? (
          <RatesForm
            checkingApyBps={settings.checkingApyBps}
            savingsApyBps={settings.savingsApyBps}
            interchangeBps={settings.interchangeBps}
            salaryPredictDays={settings.salaryPredictDays}
          />
        ) : (
          <p className="text-sm text-muted">Bank settings missing.</p>
        )}
      </Panel>

      <Panel title="Recent interest posts" className="mt-6">
        {interestTx.length === 0 ? (
          <p className="text-sm text-muted">
            No interest yet today. Advance the clock by running the cycle tomorrow, or wait — last accrual date is{" "}
            {settings?.lastInterestDate ?? "unset"}.
          </p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {interestTx.slice(0, 20).map((tx) => (
              <li key={tx.id} className="flex justify-between py-2">
                <span>{tx.description}</span>
                <span className="serif text-brass">{formatAgc(tx.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
