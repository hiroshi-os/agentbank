import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import { schema } from "./schema";

export type Database = LibSQLDatabase<typeof schema>;

let cached: { url: string; db: Database; client: Client } | null = null;

function findMonorepoRoot(start = process.cwd()): string | null {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function resolveDatabaseUrl(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.AGENTBANK_DATABASE_URL) return process.env.AGENTBANK_DATABASE_URL;
  const root = findMonorepoRoot();
  const file = root
    ? path.join(root, "data", "agentbank.db")
    : path.resolve(process.cwd(), "data", "agentbank.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return `file:${file}`;
}

export function createDb(url = resolveDatabaseUrl()): Database {
  if (cached && cached.url === url) return cached.db;
  const filePath = url.startsWith("file:") ? url.slice(5) : url;
  if (!filePath.startsWith("libsql:") && !filePath.startsWith("http")) {
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }
  const client = createClient({ url });
  const db = drizzle(client, { schema });
  cached = { url, db, client };
  return db;
}

export async function closeDb() {
  if (cached) {
    cached.client.close();
    cached = null;
  }
}
