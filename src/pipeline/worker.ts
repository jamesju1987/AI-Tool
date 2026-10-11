import "dotenv/config";
import cron from "node-cron";
import { env } from "@/lib/env";
import { JOBS } from "./jobs";
import { notify } from "./notify";
import { claimNext, enqueue, failStale } from "./queue";
import { runJob } from "./runner";

/**
 * Long-running worker: cron enqueues jobs, a single loop runs them one at a time
 * (so a slow crawl never overlaps the next one), and admin "Run now" requests go
 * through the same queue.
 */
let stopping = false;

async function loop() {
  while (!stopping) {
    const next = await claimNext().catch((e) => {
      console.error("queue error", e);
      return null;
    });
    if (!next) {
      await new Promise((r) => setTimeout(r, 10_000));
      continue;
    }
    const def = JOBS[next.job];
    if (!def) {
      console.error(`unknown job ${next.job}`);
      continue;
    }
    const res = await runJob(next.job, def.fn, { args: next.args, runId: next.id });
    if (!res.ok) await notify(`【AI 工具箱】任务失败：${def.label}（#${res.runId}）\n${res.error.split("\n")[0]}`);
  }
}

async function main() {
  await failStale();
  for (const [name, def] of Object.entries(JOBS)) {
    if (!def.schedule) continue;
    cron.schedule(def.schedule, () => void enqueue(name).catch((e) => console.error(e)), { timezone: env.timezone });
    console.log(`scheduled ${name.padEnd(8)} ${def.schedule} (${env.timezone})`);
  }
  const jev = env.jevEnabled ? `Jev ${env.jevModel} via ${env.jevProvider}` : "Jev off";
  const llm = env.llmEnabled ? `LLM ${env.llmModel} @ ${new URL(env.llmBase).host}` : "LLM off (rule-based extraction)";
  console.log(`worker started — ${jev}; ${llm}`);
  const shutdown = () => {
    stopping = true;
    console.log("stopping after current job…");
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  await loop();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
