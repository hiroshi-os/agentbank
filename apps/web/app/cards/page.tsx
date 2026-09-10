import { formatAgc, formatPan, operatorCatalog } from "@agentbank/core";
import { getBank } from "@/lib/bank";
import { StatusButtons } from "@/components/forms";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CardsPage() {
  const bank = await getBank();
  const catalog = await operatorCatalog(bank);
  const agents = new Map(catalog.agents.map((a) => [a.id, a]));

  return (
    <div>
      <PageHeader
        kicker="Cards"
        title="Virtual cards, invalid on every real network"
        description="Every PAN uses IIN 000000 — not a Visa, Mastercard, or bank BIN. Agents spend Agent Coins at the merchant catalog. Freeze, cancel, or set limits from the dossier."
      />

      {catalog.cards.length === 0 ? (
        <EmptyState title="No cards issued" body="Open an agent and issue a card so they can purchase." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {catalog.cards.map((card) => {
            const agent = agents.get(card.agentId);
            return (
              <div
                key={card.id}
                className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-[#3a2a12] via-[#1b1710] to-[#0c0b09] p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-brass">AGC debit</div>
                  <Badge tone={card.status === "active" ? "ok" : "danger"}>{card.status}</Badge>
                </div>
                <div className="mt-8 font-mono text-base tracking-[0.18em] md:text-lg">{formatPan(card.pan)}</div>
                <div className="mt-5 flex justify-between text-xs text-muted">
                  <span>{agent?.name}</span>
                  <span>
                    {String(card.expMonth).padStart(2, "0")}/{card.expYear}
                  </span>
                </div>
                <div className="mt-4 text-xs text-muted">
                  Daily {formatAgc(card.dailyLimitCents)} · monthly {formatAgc(card.monthlyLimitCents)}
                </div>
                <div className="mt-4 flex gap-2">
                  <StatusButtons
                    path={`/api/ops/cards/${card.id}/status`}
                    body={{ status: card.status === "frozen" ? "active" : "frozen" }}
                    label={card.status === "frozen" ? "Unfreeze" : "Freeze"}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Panel title="Authorization rules" className="mt-8">
        <ul className="grid gap-2 text-sm text-muted md:grid-cols-2">
          <li>Agent must be active and purchase-enabled</li>
          <li>Card active, unexpired, CVV/expiry match when supplied</li>
          <li>Per-transaction, daily, monthly, and agent policy caps</li>
          <li>Optional MCC allow-list</li>
          <li>Checking balance covers the full amount</li>
          <li>Interchange skimmed to bank capital in AGC</li>
        </ul>
      </Panel>
    </div>
  );
}
