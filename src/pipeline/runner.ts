import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobRuns } from "@/db/schema";

export type JobContext = {
  runId: number;
  args: Record<string, unknown>;
  log: (msg: string) => void;
  stats: Record<string, number>;
  inc: (key: string, n?: number) => void;
};

export type JobFn = (ctx: JobContext) => Promise<void>;

const MAX_LOG = 60_000;

/** Runs a job and records it in job_runs (shown under Admin → Jobs). */
export async function runJob(name: string, fn: JobFn, opts: { args?: Record<string, unknown>; trigger?: string; runId?: number } = {}) {
  const args = opts.args ?? {};
  let runId = opts.runId;
  if (runId) {
    await db.update(jobRuns).set({ status: "running", startedAt: new Date() }).where(eq(jobRuns.id, runId));
  } else {
    const [row] = await db.insert(jobRuns).values({ job: name, args, trigger: opts.trigger ?? "cron", status: "running", startedAt: new Date() }).returning({ id: jobRuns.id });
    runId = row.id;
  }
  const lines: string[] = [];
  const stats: Record<string, number> = {};
  const ctx: JobContext = {
    runId,
    args,
    stats,
    log: (msg) => {
      const line = `${new Date().toISOString().slice(11, 19)} ${msg}`;
      lines.push(line);
      console.log(`[${name}#${runId}] ${msg}`);
    },
    inc: (key, n = 1) => {
      stats[key] = (stats[key] ?? 0) + n;
    },
  };
  try {
    await fn(ctx);
    await db.update(jobRuns).set({ status: "success", finishedAt: new Date(), stats, log: lines.join("\n").slice(-MAX_LOG) }).where(eq(jobRuns.id, runId));
    return { ok: true as const, runId, stats };
  } catch (e) {
    const err = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
    ctx.log(`FAILED: ${err.split("\n")[0]}`);
    await db.update(jobRuns).set({ status: "failed", finishedAt: new Date(), stats, error: err.slice(0, 5000), log: lines.join("\n").slice(-MAX_LOG) }).where(eq(jobRuns.id, runId));
    return { ok: false as const, runId, stats, error: err };
  }
}
