import Link from "next/link";
import { and, desc, eq, gte, sql as dsql } from "drizzle-orm";
import { db } from "@/db/client";
import { dailyStats, jobRuns, reviewTasks, searchLog, tools } from "@/db/schema";
import { JOB_META } from "@/pipeline/jobs/meta";
import { runJobNow } from "../actions";
import { ActionForm, SubmitButton } from "../components";
import { JobStatus, Section, Stat } from "./ui";

async function loadDashboard() {
  const dayAgo = new Date(Date.now() - 86400_000);
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const [byStatus, pending, newToday, runs, topClicks, noResults] = await Promise.all([
    db.select({ status: tools.status, n: dsql<number>`count(*)::int` }).from(tools).groupBy(tools.status),
    db.select({ type: reviewTasks.type, n: dsql<number>`count(*)::int` }).from(reviewTasks).where(eq(reviewTasks.status, "pending")).groupBy(reviewTasks.type),
    db.select({ n: dsql<number>`count(*)::int` }).from(tools).where(and(eq(tools.status, "listed"), gte(tools.listedAt, dayAgo))),
    db.select().from(jobRuns).orderBy(desc(jobRuns.id)).limit(8),
    db
      .select({ slug: tools.slug, name: tools.name, clicks: dsql<number>`sum(${dailyStats.clicks})::int`, views: dsql<number>`sum(${dailyStats.views})::int` })
      .from(dailyStats)
      .innerJoin(tools, eq(tools.id, dailyStats.toolId))
      .where(gte(dailyStats.day, weekAgo))
      .groupBy(tools.slug, tools.name)
      .orderBy(desc(dsql`sum(${dailyStats.clicks})`))
      .limit(20),
    db
      .select({ query: searchLog.query, n: dsql<number>`count(*)::int` })
      .from(searchLog)
      .where(and(eq(searchLog.results, 0), gte(searchLog.createdAt, new Date(Date.now() - 7 * 86400_000))))
      .groupBy(searchLog.query)
      .orderBy(desc(dsql`count(*)`))
      .limit(20),
  ]);
  return { byStatus, pending, newToday, runs, topClicks, noResults };
}

export default async function Dashboard() {
  const { byStatus, pending, newToday, runs, topClicks, noResults } = await loadDashboard();
  const count = (s: string) => byStatus.find((x) => x.status === s)?.n ?? 0;
  const pendingTotal = pending.reduce((a, p) => a + p.n, 0);
  const typeLabel: Record<string, string> = { new_tool: "新工具", field_change: "字段变更", suspect_offline: "疑似下线", duplicate: "疑似重复", user_report: "用户纠错" };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="在架工具" value={count("listed")} />
        <Stat label="24 小时新上架" value={newToday[0].n} />
        <Stat label="待审核" value={pendingTotal} href="/admin/review" accent={pendingTotal > 0} />
        <Stat label="疑似下线" value={count("suspect_offline")} href="/admin/tools?status=suspect_offline" />
        <Stat label="已下线" value={count("offline")} href="/admin/tools?status=offline" />
      </div>

      {pending.length > 0 && (
        <p className="text-sm text-muted">
          待审核：{pending.map((p) => `${typeLabel[p.type] ?? p.type} ${p.n}`).join("，")}。{" "}
          <Link href="/admin/review" className="text-ink underline">开始审核</Link>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="最近任务">
          <table className="w-full text-sm">
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="py-2"><Link href={`/admin/jobs/${r.id}`} className="hover:underline">{JOB_META[r.job as keyof typeof JOB_META]?.label ?? r.job}</Link></td>
                  <td><JobStatus status={r.status} /></td>
                  <td className="text-muted">{r.createdAt.toLocaleString("zh-CN", { hour12: false })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["collect", "process", "patrol", "media", "scores", "rank"] as const).map((j) => (
              <ActionForm key={j} action={runJobNow} refresh={false}>
                <input type="hidden" name="job" value={j} />
                <SubmitButton variant="secondary">运行：{JOB_META[j].label}</SubmitButton>
              </ActionForm>
            ))}
          </div>
        </Section>

        <Section title="近 7 天外链点击 Top 20">
          {topClicks.length ? (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {topClicks.map((t) => (
                <li key={t.slug}>
                  <a href={`/zh/tool/${t.slug}`} target="_blank" className="hover:underline">{t.name}</a>
                  <span className="ml-2 text-muted">点击 {t.clicks} · 浏览 {t.views}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">还没有点击数据。上线后这里会显示最受欢迎的工具。</p>
          )}
        </Section>

        <Section title="近 7 天无结果的搜索">
          {noResults.length ? (
            <ul className="flex flex-wrap gap-2 text-sm">
              {noResults.map((s) => (
                <li key={s.query} className="rounded-full bg-canvas px-3 py-1 ring-1 ring-line">{s.query} <span className="text-muted">×{s.n}</span></li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">没有无结果的搜索。出现时，这些词就是该补收录的方向。</p>
          )}
        </Section>
      </div>
    </div>
  );
}
