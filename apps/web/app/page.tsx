import Link from "next/link";
import { dashboard, formatAgc, humanWhen } from "@agentbank/core";
import { getBank } from "@/lib/bank";
import { TickButton } from "@/components/forms";
import { Avatar, Badge, PageHeader, Panel, Stat } from "@/components/ui";
import { cadenceLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReservePage() {
  const bank = await getBank();
  const data = await dashboard(bank);

  return (
    <div>
      <PageHeader
        kicker="Reserve"
        title="The agents are on payroll."
        description="Northstar Labs pays salaries and stipends in Agent Coins. Predicted paydays notify the agent before funds post. Cards spend only inside this ledger."
        actions={<TickButton />}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="In circulation" value={data.stats.circulation} hint="Agent checking + savings" />
        <Stat
          label="Active agents"
          value={`${data.stats.activeAgents}`}
          hint={`${data.stats.agents} accounts on file`}
        />
        <Stat label="Posted entries" value={data.stats.transactions.toLocaleString()} hint="Double-entry virtual ledger" />
        <Stat
          label="Unread notices"
          value={`${data.stats.unreadNotifications}`}
          hint="Payday predictions, deposits, declines"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Upcoming paydays">
          {data.upcomingPayroll.length === 0 ? (
            <p className="text-sm text-muted">No active schedules.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.upcomingPayroll.map((row) => {
                const agent = data.agents.find((a) => a.id === row.agentId);
                return (
                  <li key={row.id} className="flex items-center gap-3 py-3">
                    {agent ? <Avatar name={agent.name} hue={agent.avatarHue} /> : null}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">
                        {agent?.name ?? row.agentId}{" "}
                        <span className="text-muted">@{agent?.handle}</span>
                      </div>
                      <div className="text-xs text-muted">
                        {row.kind} · {cadenceLabel(row.cadence)} · {humanWhen(row.nextRunAt)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="serif text-brass">{formatAgc(row.amountCents)}</div>
                      {row.isOverdue ? <Badge tone="danger">due</Badge> : <Badge>predicted</Badge>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Rates">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted">Checking APY</dt>
              <dd className="serif text-xl text-brass">{((data.settings?.checkingApyBps ?? 0) / 100).toFixed(2)}%</dd>
            </div>
            <div>
              <dt className="text-muted">Savings APY</dt>
              <dd className="serif text-xl text-brass">{((data.settings?.savingsApyBps ?? 0) / 100).toFixed(2)}%</dd>
            </div>
            <div>
              <dt className="text-muted">Card interchange</dt>
              <dd className="serif text-xl">{((data.settings?.interchangeBps ?? 0) / 100).toFixed(2)}%</dd>
            </div>
            <div>
              <dt className="text-muted">Payday horizon</dt>
              <dd className="serif text-xl">{data.settings?.salaryPredictDays ?? 3} days</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Interest compounds daily in this SQLite file. Interchange is a virtual merchant fee, paid in AGC, never
            settled on a card network.
          </p>
        </Panel>
      </div>

      <Panel title="Latest ledger" className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.16em] text-muted">
              <tr>
                <th className="pb-3 font-normal">When</th>
                <th className="pb-3 font-normal">Type</th>
                <th className="pb-3 font-normal">Description</th>
                <th className="pb-3 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((tx) => (
                <tr key={tx.id} className="border-t border-line">
                  <td className="py-3 text-muted">{tx.createdAt.slice(0, 16).replace("T", " ")}</td>
                  <td className="py-3">
                    <Badge tone="muted">{tx.type}</Badge>
                  </td>
                  <td className="py-3">{tx.description}</td>
                  <td className="serif py-3 text-right text-brass">{formatAgc(tx.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Agents on the book" className="mt-6">
        <div className="grid gap-3 md:grid-cols-2">
          {data.agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/agents/${agent.id}`}
              className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-brass/40"
            >
              <Avatar name={agent.name} hue={agent.avatarHue} />
              <div className="min-w-0 flex-1">
                <div className="truncate">{agent.name}</div>
                <div className="text-xs text-muted">
                  @{agent.handle} · {agent.role}
                </div>
              </div>
              <Badge tone={agent.status === "active" ? "ok" : "muted"}>{agent.status}</Badge>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
