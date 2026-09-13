import { operatorCatalog } from "@agentbank/core";
import { getBank } from "@/lib/bank";
import { StatusButtons } from "@/components/forms";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const bank = await getBank();
  const catalog = await operatorCatalog(bank);
  const agents = new Map(catalog.agents.map((a) => [a.id, a]));

  return (
    <div>
      <PageHeader
        kicker="Inbox"
        title="Payday predictions and everything after"
        description="Agents are notified when a salary is predicted, when it posts, when a card is issued, when a purchase clears or declines, and when interest lands."
        actions={
          <StatusButtons path="/api/ops/notifications/read-all" body={{}} label="Mark all read" />
        }
      />

      {catalog.notifications.length === 0 ? (
        <EmptyState title="No notices" body="Run a banking cycle to emit payday predictions." />
      ) : (
        <Panel>
          <ul className="space-y-3">
            {catalog.notifications.map((n) => (
              <li key={n.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">{n.title}</div>
                  <div className="flex items-center gap-2">
                    <Badge tone={n.readAt ? "muted" : "info"}>{n.readAt ? "read" : "unread"}</Badge>
                    <Badge>{n.type}</Badge>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted">{n.body}</p>
                <div className="mt-2 text-xs text-muted">
                  {n.agentId ? `@${agents.get(n.agentId)?.handle ?? "agent"} · ` : ""}
                  {n.createdAt.slice(0, 19).replace("T", " ")} UTC
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
