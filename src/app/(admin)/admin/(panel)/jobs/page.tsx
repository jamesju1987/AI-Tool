import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { jobRuns } from "@/db/schema";
import { JOB_META } from "@/pipeline/jobs/meta";
import { runJobNow } from "../../actions";
import { ActionForm, SubmitButton } from "../../components";
import { JobStatus, Section } from "../ui";

export default async function JobsAdmin() {
  const runs = await db.select().from(jobRuns).orderBy(desc(jobRuns.id)).limit(100);
  return (
    <div className="space-y-4">
      <Section title="定时任务">
        <table className="w-full text-sm">
          <thead className="text-left text-muted"><tr><th className="py-1">任务</th><th>计划（cron）</th><th /></tr></thead>
          <tbody>
            {Object.entries(JOB_META).map(([name, j]) => (
              <tr key={name} className="border-t border-line">
                <td className="py-2">{j.label} <span className="text-muted">({name})</span></td>
                <td className="font-mono text-xs">{j.schedule}</td>
                <td className="text-right">
                  <ActionForm action={runJobNow} refresh={false}>
                    <input type="hidden" name="job" value={name} />
                    <SubmitButton variant="secondary">立即运行</SubmitButton>
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="运行记录">
        <table className="w-full text-sm">
          <thead className="text-left text-muted"><tr><th className="py-1">#</th><th>任务</th><th>触发</th><th>状态</th><th>开始</th><th>耗时</th><th>结果</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="py-2"><Link href={`/admin/jobs/${r.id}`} className="underline">{r.id}</Link></td>
                <td>{JOB_META[r.job as keyof typeof JOB_META]?.label ?? r.job}</td>
                <td className="text-muted">{r.trigger}</td>
                <td><JobStatus status={r.status} /></td>
                <td className="text-muted">{(r.startedAt ?? r.createdAt).toLocaleString("zh-CN", { hour12: false })}</td>
                <td className="tabular-nums text-muted">{r.startedAt && r.finishedAt ? `${Math.round((+r.finishedAt - +r.startedAt) / 1000)}s` : "—"}</td>
                <td className="max-w-md truncate text-xs text-muted">{r.error ? <span className="text-danger">{r.error.split("\n")[0]}</span> : Object.entries(r.stats).map(([k, v]) => `${k} ${v}`).join("，")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
