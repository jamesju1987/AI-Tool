import { execSync } from "node:child_process";
import postgres from "postgres";

/** Fresh test database: drop, create, migrate, seed. */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/aitoolbox_test");
  const dbName = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  await sql.unsafe(`drop database if exists "${dbName}" with (force)`);
  await sql.unsafe(`create database "${dbName}"`);
  await sql.end();
  const env = { ...process.env, DATABASE_URL: url.toString() };
  execSync("npx tsx src/scripts/migrate.ts", { env, stdio: "inherit" });
  execSync("npx tsx src/scripts/seed.ts", { env, stdio: "inherit" });
}
