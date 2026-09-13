import { notFound } from "next/navigation";
import { agentDossier, formatAgc, formatPan, humanWhen, listMerchants } from "@agentbank/core";
import { getBank } from "@/lib/bank";
import {
  IssueCardForm,
  PayrollForm,
  PurchaseForm,
  RotateKeyButton,
  StatusButtons,
} from "@/components/forms";
import { Avatar, Badge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { cadenceLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bank = await getBank();
  let dossier;
  try {
    dossier = await agentDossier(bank, id);
  } catch {
    notFound();
  }
  const merchants = await listMerchants(bank);
  const { agent, checking, savings, cards, forecasts, transactions, notifications, apiKeys, purchases } = dossier;
  const liveKey = apiKeys.find((k) => !k.revokedAt);

  return (
    <div>
      <PageHeader
        kicker={`@${agent.handle}`}
        title={agent.name}
        description={agent.bio}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusButtons
              path={`/api/ops/agents/${agent.id}/status`}
              body={{ status: agent.status === "active" ? "paused" : "active" }}
              label={agent.status === "active" ? "Pause agent" : "Reactivate"}
            />
            <StatusButtons
              path={`/api/ops/agents/${agent.id}/purchase-enabled`}
              body={{ enabled: !agent.purchaseEnabled }}
              label={agent.purchaseEnabled ? "Disable purchases" : "Enable purchases"}
            />
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Avatar name={agent.name} hue={agent.avatarHue} />
        <Badge tone={agent.status === "active" ? "ok" : "muted"}>{agent.status}</Badge>
        <Badge>{agent.modelFamily}</Badge>
        <span className="text-sm text-muted">{agent.role}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="panel rounded-2xl p-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Checking</div>
          <div className="serif mt-2 text-3xl text-brass">{formatAgc(checking.cachedBalanceCents)}</div>
        </div>
        <div className="panel rounded-2xl p-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Savings</div>
          <div className="serif mt-2 text-3xl text-brass">{formatAgc(savings.cachedBalanceCents)}</div>
        </div>
        <div className="panel rounded-2xl p-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Total book</div>
          <div className="serif mt-2 text-3xl">{formatAgc(checking.cachedBalanceCents + savings.cachedBalanceCents)}</div>
          <div className="mt-2 text-xs text-muted">Daily spend cap {formatAgc(agent.dailySpendLimitCents)}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Predicted pay">
          {forecasts.length === 0 ? (
            <EmptyState title="No schedule" body="Attach a salary or stipend so this agent is notified before payday." />
          ) : (
            <ul className="space-y-3">
              {forecasts.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                  <div>
                    <div className="text-sm">
                      {row.kind} · {cadenceLabel(row.cadence)}
                    </div>
                    <div className="text-xs text-muted">
                      Next {row.nextRunAt.slice(0, 16).replace("T", " ")} UTC · {humanWhen(row.nextRunAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="serif text-brass">{formatAgc(row.amountCents)}</div>
                    <StatusButtons path={`/api/ops/payroll/${row.id}/run`} body={{}} label="Post now" />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5">
            <PayrollForm agentId={agent.id} />
          </div>
        </Panel>

        <Panel title="Connector key">
          <p className="text-sm text-muted">
            Claude Code and Grok authenticate as this agent with a bearer key. Demo keys are stored in this database only.
          </p>
          {liveKey ? (
            <pre className="mt-3 overflow-x-auto rounded-lg bg-ink-2 p-3 font-mono text-xs">
              {liveKey.plaintextDemo ?? `${liveKey.keyPrefix}…`}
            </pre>
          ) : (
            <p className="mt-3 text-sm text-danger">No active key.</p>
          )}
          <div className="mt-3">
            <RotateKeyButton agentId={agent.id} />
          </div>
        </Panel>
      </div>

      <Panel title="Virtual cards" className="mt-6">
        {cards.length === 0 ? (
          <EmptyState title="No cards" body="Issue a virtual Agent Coin card so this agent can purchase inside the ledger." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {cards.map((card) => (
              <div
                key={card.id}
                className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#3a2a12] via-[#1b1710] to-[#111] p-5"
              >
                <div className="text-[11px] uppercase tracking-[0.24em] text-brass">Agent Coin card</div>
                <div className="mt-6 font-mono text-lg tracking-[0.2em]">{formatPan(card.pan)}</div>
                <div className="mt-4 flex justify-between text-xs text-muted">
                  <span>
                    EXP {String(card.expMonth).padStart(2, "0")}/{card.expYear}
                  </span>
                  <span>CVV {card.cvv}</span>
                  <span>•••• {card.last4}</span>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm">{card.label}</span>
                  <Badge tone={card.status === "active" ? "ok" : "danger"}>{card.status}</Badge>
                </div>
                <div className="mt-3 text-xs text-muted">
                  Daily {formatAgc(card.dailyLimitCents)} · per purchase {formatAgc(card.perTxnLimitCents)}
                </div>
                <div className="mt-3 flex gap-2">
                  <StatusButtons
                    path={`/api/ops/cards/${card.id}/status`}
                    body={{ status: card.status === "frozen" ? "active" : "frozen" }}
                    label={card.status === "frozen" ? "Unfreeze" : "Freeze"}
                  />
                  <StatusButtons
                    path={`/api/ops/cards/${card.id}/status`}
                    body={{ status: "cancelled" }}
                    label="Cancel"
                  />
                </div>
                <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-brass/70">
                  Not valid for real commerce
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-5">
          <IssueCardForm agentId={agent.id} />
        </div>
        {cards[0] && merchants.length > 0 ? (
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="mb-3 text-[11px] uppercase tracking-[0.16em] text-muted">Charge a merchant</h3>
            <PurchaseForm agentId={agent.id} cardId={cards[0].id} merchants={merchants} />
          </div>
        ) : null}
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Ledger">
          {transactions.length === 0 ? (
            <EmptyState title="No movements" body="Salary, interest, and purchases will land here." />
          ) : (
            <ul className="divide-y divide-line text-sm">
              {transactions.map((tx) => (
                <li key={tx.id} className="flex justify-between gap-3 py-2">
                  <div>
                    <div>{tx.description}</div>
                    <div className="text-xs text-muted">
                      {tx.type} · {tx.createdAt.slice(0, 16).replace("T", " ")}
                    </div>
                  </div>
                  <div className="serif text-brass">{formatAgc(tx.amountCents)}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Notices">
          {notifications.length === 0 ? (
            <EmptyState title="Inbox empty" body="Predicted paydays and deposits show up here." />
          ) : (
            <ul className="space-y-3">
              {notifications.map((n) => (
                <li key={n.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm">{n.title}</div>
                    <Badge tone={n.type.includes("predicted") ? "info" : "brass"}>{n.type}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {purchases.length > 0 ? (
        <Panel title="Purchases" className="mt-6">
          <ul className="divide-y divide-line text-sm">
            {purchases.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span>
                  {p.memo} · {p.status}
                  {p.declineReason ? ` (${p.declineReason})` : ""}
                </span>
                <span className="serif">{formatAgc(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
