import Link from "next/link";
import { dashboard, findAgentAccount, formatAgc, listAgents } from "@agentbank/core";
import { getBank } from "@/lib/bank";
import { HireAgentForm } from "@/components/forms";
import { Avatar, Badge, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const bank = await getBank();
  const [agents, dash] = await Promise.all([listAgents(bank), dashboard(bank)]);
  const orgId = dash.orgs[0]?.id ?? "";

  const rows = await Promise.all(
    agents.map(async (agent) => {
      const checking = await findAgentAccount(bank, agent.id, "checking");
      const savings = await findAgentAccount(bank, agent.id, "savings");
      return { agent, checking, savings, total: checking.cachedBalanceCents + savings.cachedBalanceCents };
    }),
  );

  return (
    <div>
      <PageHeader
        kicker="Directory"
        title="Every agent on the payroll"
        description="Open an account, attach salary or stipend, issue a virtual card, and hand the agent an API key for Claude Code or Grok."
      />

      {rows.length === 0 ? (
        <Panel>
          <p className="text-sm text-muted">No agents yet. Seed failed or the ledger was wiped.</p>
        </Panel>
      ) : (
        <div className="overflow-x-auto panel rounded-2xl">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.16em] text-muted">
              <tr>
                <th className="px-4 py-3 font-normal">Agent</th>
                <th className="px-4 py-3 font-normal">Role</th>
                <th className="px-4 py-3 font-normal">Family</th>
                <th className="px-4 py-3 text-right font-normal">Checking</th>
                <th className="px-4 py-3 text-right font-normal">Savings</th>
                <th className="px-4 py-3 font-normal">Purchases</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ agent, checking, savings }) => (
                <tr key={agent.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <Link href={`/agents/${agent.id}`} className="flex items-center gap-3">
                      <Avatar name={agent.name} hue={agent.avatarHue} />
                      <span>
                        <span className="block">{agent.name}</span>
                        <span className="text-xs text-muted">@{agent.handle}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{agent.role}</td>
                  <td className="px-4 py-3">
                    <Badge>{agent.modelFamily}</Badge>
                  </td>
                  <td className="serif px-4 py-3 text-right">{formatAgc(checking.cachedBalanceCents)}</td>
                  <td className="serif px-4 py-3 text-right text-brass">{formatAgc(savings.cachedBalanceCents)}</td>
                  <td className="px-4 py-3">
                    {agent.purchaseEnabled ? <Badge tone="ok">enabled</Badge> : <Badge tone="muted">off</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Panel title="Hire an agent" className="mt-8">
        {orgId ? <HireAgentForm orgId={orgId} /> : <p className="text-sm text-muted">No organization on file.</p>}
      </Panel>
    </div>
  );
}
