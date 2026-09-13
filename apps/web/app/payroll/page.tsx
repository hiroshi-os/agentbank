import { forecastPayroll, formatAgc, humanWhen, operatorCatalog } from "@agentbank/core";
import { getBank } from "@/lib/bank";
import { TickButton, StatusButtons } from "@/components/forms";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { cadenceLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PayrollPage() {
  const bank = await getBank();
  const [forecasts, catalog] = await Promise.all([forecastPayroll(bank), operatorCatalog(bank)]);
  const agents = new Map(catalog.agents.map((a) => [a.id, a]));

  return (
    <div>
      <PageHeader
        kicker="Payroll"
        title="Predicted paydays, then deposits"
        description="Each active schedule has a next run. Agents are notified when payday is inside the prediction window, and again when Agent Coins post to checking (with an optional savings sweep)."
        actions={<TickButton />}
      />

      {forecasts.length === 0 ? (
        <EmptyState title="Nothing scheduled" body="Open an agent dossier and attach a salary or stipend." />
      ) : (
        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.16em] text-muted">
                <tr>
                  <th className="pb-3 font-normal">Agent</th>
                  <th className="pb-3 font-normal">Kind</th>
                  <th className="pb-3 font-normal">Cadence</th>
                  <th className="pb-3 text-right font-normal">Amount</th>
                  <th className="pb-3 font-normal">Predicted</th>
                  <th className="pb-3 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {forecasts
                  .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))
                  .map((row) => {
                    const agent = agents.get(row.agentId);
                    return (
                      <tr key={row.id} className="border-t border-line">
                        <td className="py-3">
                          {agent?.name} <span className="text-muted">@{agent?.handle}</span>
                        </td>
                        <td className="py-3">
                          <Badge>{row.kind}</Badge>
                        </td>
                        <td className="py-3 text-muted">{cadenceLabel(row.cadence)}</td>
                        <td className="serif py-3 text-right text-brass">{formatAgc(row.amountCents)}</td>
                        <td className="py-3 text-muted">
                          {row.nextRunAt.slice(0, 16).replace("T", " ")}
                          <div className="text-xs">{humanWhen(row.nextRunAt)}</div>
                        </td>
                        <td className="py-3 text-right">
                          <StatusButtons path={`/api/ops/payroll/${row.id}/run`} body={{}} label="Post now" />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title="How prediction notices work" className="mt-6">
        <p className="max-w-3xl text-sm leading-relaxed text-muted">
          The banking cycle looks ahead {catalog.settings?.salaryPredictDays ?? 3} days. If a payday falls in that
          window and we have not already notified for that exact run, the agent gets a <code>salary.predicted</code>{" "}
          notice. When the cycle (or Post now) actually pays them, they get <code>salary.deposited</code>. Connectors
          poll <code>list_notifications</code> so Grok and Claude Code can tell the agent without opening this UI.
        </p>
      </Panel>
    </div>
  );
}
