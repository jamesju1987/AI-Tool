import { and, desc, eq, gte, sql as dsql } from "drizzle-orm";
import { db } from "@/db/client";
import { jobRuns, reviewTasks, tools } from "@/db/schema";
import { env } from "@/lib/env";
import { notify } from "../notify";
import type { JobContext } from "../runner";

/** 07:00 — "review queue is ready" message with today's numbers (PRD §6 schedule). */
export async function digest(ctx: JobContext) {
  const dayAgo = new Date(Date.now() - 86400_000);
  const pending = await db.select({ type: reviewTasks.type, n: dsql<number>`count(*)::int` }).from(reviewTasks).where(eq(reviewTasks.status, "pending")).groupBy(reviewTasks.type);
  const fresh = await db.select({ name: tools.name }).from(tools).where(and(eq(tools.status, "listed"), gte(tools.listedAt, dayAgo))).orderBy(desc(tools.heatScore)).limit(5);
  const [{ failed }] = await db.select({ failed: dsql<number>`count(*)::int` }).from(jobRuns).where(and(eq(jobRuns.status, "failed"), gte(jobRuns.createdAt, dayAgo)));
  const label: Record<string, string> = { new_tool: "新工具", field_change: "字段变更", suspect_offline: "疑似下线", duplicate: "疑似重复", user_report: "用户纠错" };
  const total = pending.reduce((a, p) => a + p.n, 0);
  const lines = [
    `【AI 工具箱】今日待审核 ${total} 条` + (pending.length ? `：${pending.map((p) => `${label[p.type] ?? p.type} ${p.n}`).join("，")}` : ""),
    fresh.length ? `过去 24 小时新上架：${fresh.map((f) => f.name).join("、")}` : "过去 24 小时没有新上架的工具",
    failed ? `⚠ ${failed} 个任务运行失败，请查看后台任务日志` : "",
    `审核入口：${env.siteUrl}/admin/review`,
  ].filter(Boolean);
  const sent = await notify(lines.join("\n"));
  ctx.log(sent ? "digest sent" : "no webhook configured (NOTIFY_WEBHOOK_URL); digest:\n" + lines.join("\n"));
}
