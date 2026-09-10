import { formatAgc, operatorCatalog } from "@agentbank/core";
import { getBank } from "@/lib/bank";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const bank = await getBank();
  const catalog = await operatorCatalog(bank);
  const agents = new Map(catalog.agents.map((a) => [a.id, a]));

  return (
    <div>
      <PageHeader
        kicker="Ledger"
        title="Every coin has two sides"
        description="Salary, stipend, interest, purchases, interchange, and peer transfers post as balanced ledger lines in a single SQLite file."
      />

      {catalog.transactions.length === 0 ? (
        <EmptyState title="Ledger is empty" body="Run a banking cycle or seed the demo." />
      ) : (
        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.16em] text-muted">
                <tr>
                  <th className="pb-3 font-normal">Posted</th>
                  <th className="pb-3 font-normal">Type</th>
                  <th className="pb-3 font-normal">Agent</th>
                  <th className="pb-3 font-normal">Description</th>
                  <th className="pb-3 text-right font-normal">Amount</th>
                </tr>
              </thead>
              <tbody>
                {catalog.transactions.map((tx) => (
                  <tr key={tx.id} className="border-t border-line">
                    <td className="py-3 whitespace-nowrap text-muted">
                      {tx.createdAt.slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="py-3">
                      <Badge tone="muted">{tx.type}</Badge>
                    </td>
                    <td className="py-3">{tx.agentId ? agents.get(tx.agentId)?.handle ?? "—" : "—"}</td>
                    <td className="py-3">{tx.description}</td>
                    <td className="serif py-3 text-right text-brass">{formatAgc(tx.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
