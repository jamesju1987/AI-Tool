import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";

declare global {
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

// Reuse one pool across hot reloads in dev.
const client = globalThis.__pgClient ?? postgres(env.databaseUrl, { max: 10, idle_timeout: 30 });
if (!env.isProd) globalThis.__pgClient = client;

export const db = drizzle(client, { schema });
export const sql = client;
export { schema };
