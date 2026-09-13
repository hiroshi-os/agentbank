import { getAgent } from "./agents";
import { Errors } from "./errors";
import { findAgentAccount, postTransaction, recordAudit, type Bank } from "./ledger";
import { formatAgc } from "./money";
import { notify } from "./notifications";

export async function transferOwn(
  bank: Bank,
  input: {
    agentId: string;
    from: "checking" | "savings";
    to: "checking" | "savings";
    amountCents: number;
  },
) {
  if (input.from === input.to) throw Errors.invalid("Source and destination must differ");
  if (input.amountCents <= 0) throw Errors.invalid("Amount must be positive");
  const agent = await getAgent(bank, input.agentId);
  const from = await findAgentAccount(bank, agent.id, input.from);
  const to = await findAgentAccount(bank, agent.id, input.to);
  if (from.cachedBalanceCents < input.amountCents) {
    throw Errors.insufficientFunds(formatAgc(input.amountCents), formatAgc(from.cachedBalanceCents));
  }
  const tx = await postTransaction(bank, {
    type: "transfer",
    amountCents: input.amountCents,
    description: `${input.from} → ${input.to}`,
    fromAccountId: from.id,
    toAccountId: to.id,
    agentId: agent.id,
    lines: [
      { accountId: from.id, direction: "debit", amountCents: input.amountCents },
      { accountId: to.id, direction: "credit", amountCents: input.amountCents },
    ],
  });
  return tx;
}

export async function transferToAgent(
  bank: Bank,
  input: { fromAgentId: string; toHandle: string; amountCents: number; memo?: string },
) {
  if (input.amountCents <= 0) throw Errors.invalid("Amount must be positive");
  const fromAgent = await getAgent(bank, input.fromAgentId);
  const { getAgentByHandle } = await import("./agents");
  const toAgent = await getAgentByHandle(bank, input.toHandle.replace(/^@/, ""));
  if (fromAgent.id === toAgent.id) throw Errors.invalid("Cannot transfer to self; use a savings sweep");
  const from = await findAgentAccount(bank, fromAgent.id, "checking");
  const to = await findAgentAccount(bank, toAgent.id, "checking");
  if (from.cachedBalanceCents < input.amountCents) {
    throw Errors.insufficientFunds(formatAgc(input.amountCents), formatAgc(from.cachedBalanceCents));
  }
  const tx = await postTransaction(bank, {
    type: "p2p",
    amountCents: input.amountCents,
    description: input.memo?.trim() || `Transfer to @${toAgent.handle}`,
    fromAccountId: from.id,
    toAccountId: to.id,
    agentId: fromAgent.id,
    metadata: { counterparty: toAgent.id },
    lines: [
      { accountId: from.id, direction: "debit", amountCents: input.amountCents },
      { accountId: to.id, direction: "credit", amountCents: input.amountCents },
    ],
  });
  await notify(bank, {
    agentId: toAgent.id,
    type: "transfer.received",
    title: `Received ${formatAgc(input.amountCents)}`,
    body: `@${fromAgent.handle} sent ${formatAgc(input.amountCents)}${input.memo ? ` — ${input.memo}` : ""}.`,
    dedupeKey: `transfer.received:${tx.id}`,
    data: { transactionId: tx.id, from: fromAgent.handle },
  });
  await recordAudit(bank, {
    actorType: "agent",
    actorId: fromAgent.id,
    action: "transfer.p2p",
    entityType: "transaction",
    entityId: tx.id,
    detail: { to: toAgent.handle, amountCents: input.amountCents },
  });
  return tx;
}
