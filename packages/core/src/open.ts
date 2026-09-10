import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { schema, resolveDatabaseUrl, type Database } from "@agentbank/db";
import { createBank, type Bank } from "./ledger";
import { migrate } from "./migrate";
import { iso, type Clock, systemClock } from "./time";

export async function openBank(options?: { url?: string; clock?: Clock }): Promise<{
  bank: Bank;
  db: Database;
}> {
  const url = options?.url ?? resolveDatabaseUrl();
  const filePath = url.startsWith("file:") ? url.slice(5) : url;
  if (!filePath.startsWith("libsql:") && !filePath.startsWith("http")) {
    const fs = await import("node:fs");
    const path = await import("node:path");
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }
  const client = createClient({ url });
  await migrate(client);
  const db = drizzle(client, { schema });
  const bank = createBank(db, options?.clock ?? systemClock);
  return { bank, db };
}

export { iso };
