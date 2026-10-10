import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "@/db/client";

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  // Trigram search over names, aliases, pinyin and taglines (works for Chinese without a tokenizer).
  await sql`create extension if not exists pg_trgm`;
  await sql`create index if not exists tools_search_trgm on tools using gin (search_text gin_trgm_ops)`;
  console.log("migrations applied");
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
