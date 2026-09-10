import { and, eq } from "drizzle-orm";
import { notifications } from "@agentbank/db";
import { id } from "./ids";
import type { Bank } from "./ledger";
import { iso } from "./time";

export async function notify(
  bank: Bank,
  input: {
    agentId?: string | null;
    type: string;
    title: string;
    body: string;
    dedupeKey: string;
    data?: Record<string, unknown>;
  },
) {
  const existing = await bank.db
    .select()
    .from(notifications)
    .where(eq(notifications.dedupeKey, input.dedupeKey))
    .limit(1);
  if (existing[0]) return { created: false, notification: existing[0] };
  const row = {
    id: id("ntf"),
    agentId: input.agentId ?? null,
    type: input.type,
    title: input.title,
    body: input.body,
    dedupeKey: input.dedupeKey,
    dataJson: JSON.stringify(input.data ?? {}),
    readAt: null,
    createdAt: iso(bank.clock.now()),
  };
  await bank.db.insert(notifications).values(row);
  return { created: true, notification: row };
}

export async function listNotifications(bank: Bank, agentId?: string, unreadOnly = false) {
  const rows = await bank.db.select().from(notifications);
  return rows
    .filter((n) => (agentId ? n.agentId === agentId : true))
    .filter((n) => (unreadOnly ? !n.readAt : true))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function markNotificationRead(bank: Bank, notificationId: string, agentId?: string) {
  const [row] = await bank.db
    .select()
    .from(notifications)
    .where(
      agentId
        ? and(eq(notifications.id, notificationId), eq(notifications.agentId, agentId))
        : eq(notifications.id, notificationId),
    )
    .limit(1);
  if (!row) return null;
  await bank.db
    .update(notifications)
    .set({ readAt: iso(bank.clock.now()) })
    .where(eq(notifications.id, notificationId));
  return { ...row, readAt: iso(bank.clock.now()) };
}

export async function markAllRead(bank: Bank, agentId?: string) {
  const now = iso(bank.clock.now());
  if (agentId) {
    await bank.db.update(notifications).set({ readAt: now }).where(eq(notifications.agentId, agentId));
  } else {
    await bank.db.update(notifications).set({ readAt: now });
  }
}
