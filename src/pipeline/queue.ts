import { and, eq, inArray, sql as dsql } from "drizzle-orm";
import { db, sql } from "@/db/client";
import { jobRuns } from "@/db/schema";

/** Queue a job (from cron or the admin "Run now" button). Skips if one is already waiting or running. */
export async function enqueue(job: string, args: Record<string, unknown> = {}, trigger = "cron") {
  const [busy] = await db
    .select({ id: jobRuns.id })
    .from(jobRuns)
    .where(and(eq(jobRuns.job, job), inArray(jobRuns.status, ["queued", "running"]), dsql`${jobRuns.args} = ${JSON.stringify(args)}::jsonb`));
  if (busy) return { id: busy.id, queued: false };
  const [row] = await db.insert(jobRuns).values({ job, args, trigger, status: "queued" }).returning({ id: jobRuns.id });
  return { id: row.id, queued: true };
}

/** Atomically claim the oldest queued job (safe with several workers). */
export async function claimNext(): Promise<{ id: number; job: string; args: Record<string, unknown> } | null> {
  const rows = await sql<{ id: number; job: string; args: Record<string, unknown> }[]>`
    update job_runs set status = 'running', started_at = now()
    where id = (select id from job_runs where status = 'queued' order by created_at, id limit 1 for update skip locked)
    returning id, job, args`;
  return rows[0] ?? null;
}

/** Runs left "running" by a crashed worker are marked failed on startup. */
export async function failStale() {
  await sql`update job_runs set status = 'failed', finished_at = now(), error = 'worker restarted while job was running'
            where status = 'running' and started_at < now() - interval '6 hours'`;
}
