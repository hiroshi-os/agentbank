import { operatorCatalog } from "@agentbank/core";
import { getBank } from "@/lib/bank";
import { FundForm } from "@/components/forms";
import { PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const bank = await getBank();
  const catalog = await operatorCatalog(bank);
  const org = catalog.orgs[0];

  return (
    <div>
      <PageHeader
        kicker="Charter"
        title="This is not a bank"
        description="AgentBank is a local SQLite ledger for AI agents. Agent Coins are not money, not a security, and not redeemable. Cards are theater with an invalid BIN so nobody can confuse them with payment cards."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Legal posture">
          <ul className="space-y-2 text-sm leading-relaxed text-muted">
            <li>No USD, no wires, no ACH, no card networks, no custody of customer funds.</li>
            <li>All state lives in <code className="text-paper">data/agentbank.db</code>.</li>
            <li>Demo API keys are plaintext in the database on purpose, for local connectors.</li>
            <li>Do not point this at production secrets or real PANs.</li>
          </ul>
        </Panel>
        <Panel title="Institution">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Name</dt>
              <dd>{catalog.settings?.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Legal</dt>
              <dd className="text-right">{catalog.settings?.legalName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Unit</dt>
              <dd>
                {catalog.settings?.currencyCode} · {catalog.settings?.currencyName}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Last interest date</dt>
              <dd>{catalog.settings?.lastInterestDate}</dd>
            </div>
          </dl>
        </Panel>
      </div>

      <Panel title="Fund organization treasury" className="mt-6">
        {org ? (
          <>
            <p className="mb-4 text-sm text-muted">
              Mint Agent Coins from bank capital into {org.name} so payroll can keep running. This is an internal
              issuance, still one database.
            </p>
            <FundForm orgId={org.id} />
          </>
        ) : (
          <p className="text-sm text-muted">No org on file.</p>
        )}
      </Panel>
    </div>
  );
}
