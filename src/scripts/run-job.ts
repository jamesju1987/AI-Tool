import "dotenv/config";
import { sql } from "@/db/client";
import { JOBS } from "@/pipeline/jobs";
import { queueManualUrls } from "@/pipeline/manual";
import { runJob } from "@/pipeline/runner";

/**
 * Run a pipeline job once, in the foreground:
 *   npm run job -- collect
 *   npm run job -- process limit=20
 *   npm run job -- rank category=video-generation locale=zh
 *   npm run job -- add https://example.com https://another.ai   (queue URLs, then: npm run job -- process)
 */
async function main() {
  const [name, ...rest] = process.argv.slice(2);
  if (name === "add") {
    const n = await queueManualUrls(rest);
    console.log(`queued ${n} URL(s); run "npm run job -- process" to process them`);
    return;
  }
  const def = name ? JOBS[name] : undefined;
  if (!def) {
    console.log(`usage: npm run job -- <${Object.keys(JOBS).join("|")}|add> [key=value ...]`);
    process.exitCode = 1;
    return;
  }
  const args: Record<string, unknown> = {};
  for (const kv of rest) {
    const [k, ...v] = kv.split("=");
    const val = v.join("=");
    args[k] = val === "true" ? true : val === "false" ? false : /^\d+$/.test(val) ? Number(val) : val;
  }
  const res = await runJob(name, def.fn, { args, trigger: "cli" });
  console.log(JSON.stringify({ ok: res.ok, run: res.runId, stats: res.stats }, null, 2));
  if (!res.ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
