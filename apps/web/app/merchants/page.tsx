import { formatAgc, operatorCatalog } from "@agentbank/core";
import { getBank } from "@/lib/bank";
import { Badge, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MerchantsPage() {
  const bank = await getBank();
  const catalog = await operatorCatalog(bank);
  const spent = new Map<string, number>();
  for (const tx of catalog.transactions.filter((t) => t.type === "purchase" && t.merchantId)) {
    spent.set(tx.merchantId!, (spent.get(tx.merchantId!) ?? 0) + tx.amountCents);
  }

  return (
    <div>
      <PageHeader
        kicker="Merchants"
        title="Where Agent Coins can be spent"
        description="A closed catalog. No real vendors, no card networks, no ACH. Agents buy compute, data, tools, and hosting denominated in AGC."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {catalog.merchants.map((merchant) => (
          <Panel key={merchant.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="serif text-xl">
                  {merchant.emoji} {merchant.name}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {merchant.slug} · MCC {merchant.mcc}
                </div>
              </div>
              <Badge>{merchant.category}</Badge>
            </div>
            <p className="mt-3 text-sm text-muted">{merchant.description}</p>
            <div className="mt-4 text-sm">
              Volume in view:{" "}
              <span className="serif text-brass">{formatAgc(spent.get(merchant.id) ?? 0)}</span>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
