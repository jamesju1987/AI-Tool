import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, rawItems, reviewTasks, snapshots, sources, toolCategories, tools } from "@/db/schema";
import { approveFieldChange, approveNewTool, confirmOffline, mergeDuplicate, rejectTask } from "../../actions";
import { ActionForm, ReviewShortcuts, SubmitButton } from "../../components";
import { ToolEditor } from "../ToolEditor";
import { Section } from "../ui";

const TYPE_LABEL: Record<string, string> = { new_tool: "新工具", field_change: "字段变更", suspect_offline: "疑似下线", duplicate: "疑似重复", user_report: "用户纠错" };

function Bar({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const good = invert ? value < 0.2 : value >= 0.85;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-muted">{label}</span>
      <span className="h-1.5 flex-1 rounded-full bg-canvas">
        <span className={`block h-1.5 rounded-full ${good ? "bg-accent" : "bg-warn"}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="w-9 text-right tabular-nums">{value.toFixed(2)}</span>
    </div>
  );
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const queue = await db.select({ id: reviewTasks.id, type: reviewTasks.type, confidence: reviewTasks.confidence, toolId: reviewTasks.toolId, name: tools.name })
    .from(reviewTasks).leftJoin(tools, eq(tools.id, reviewTasks.toolId))
    .where(eq(reviewTasks.status, "pending")).orderBy(asc(reviewTasks.createdAt), asc(reviewTasks.id)).limit(100);

  if (!queue.length) {
    return (
      <Section title="审核队列">
        <p className="text-sm text-muted">队列已清空。新的待审条目会在下一次采集（每 6 小时）后出现，也可以去 <Link href="/admin/add" className="underline">添加网址</Link>。</p>
      </Section>
    );
  }
  // A handled task (e.g. just approved) falls through to the next pending one.
  const currentId = queue.some((q) => q.id === Number(id)) ? Number(id) : queue[0].id;
  const [task] = await db.select().from(reviewTasks).where(eq(reviewTasks.id, currentId));
  const idx = queue.findIndex((q) => q.id === currentId);
  const next = queue[idx + 1] ?? queue[0];
  const nextHref = next && next.id !== currentId ? `/admin/review?id=${next.id}` : null;
  const [tool] = task?.toolId ? await db.select().from(tools).where(eq(tools.id, task.toolId)) : [];
  const cats = await db.select().from(categories).orderBy(categories.sort);
  const links = tool ? await db.select({ slug: categories.slug, isPrimary: toolCategories.isPrimary, parentId: categories.parentId }).from(toolCategories).innerJoin(categories, eq(categories.id, toolCategories.categoryId)).where(eq(toolCategories.toolId, tool.id)) : [];
  const raw = task?.rawItemId ? (await db.select({ title: rawItems.title, text: rawItems.rawText, url: rawItems.url, source: sources.name }).from(rawItems).innerJoin(sources, eq(sources.id, rawItems.sourceId)).where(eq(rawItems.id, task.rawItemId)))[0] : null;
  const p = task?.payload;

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-1 text-sm lg:max-h-[80vh] lg:overflow-y-auto">
        <p className="mb-2 text-muted">待审 {queue.length} 条</p>
        {queue.map((q) => (
          <Link key={q.id} href={`/admin/review?id=${q.id}`} className={`block rounded-md px-2 py-1.5 ${q.id === currentId ? "bg-ink text-canvas" : "hover:bg-surface"}`}>
            <span className="block truncate">{q.name ?? `#${q.id}`}</span>
            <span className="text-xs opacity-70">{TYPE_LABEL[q.type]}{q.confidence != null ? ` · ${q.confidence.toFixed(2)}` : ""}</span>
          </Link>
        ))}
      </aside>

      {!task || task.status !== "pending" ? (
        <p className="text-muted">这条任务已处理。<Link href="/admin/review" className="underline">回到队列</Link></p>
      ) : (
        <div className="space-y-4" key={task.id}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="font-display text-2xl font-semibold">{TYPE_LABEL[task.type]}：{tool?.name ?? `#${task.id}`}</h1>
            <ReviewShortcuts nextHref={nextHref} />
          </div>
          {task.reasons.length > 0 && (
            <ul className="flex flex-wrap gap-2 text-xs">
              {task.reasons.map((r) => <li key={r} className="rounded-full bg-warn/10 px-2.5 py-1 text-warn">{r}</li>)}
            </ul>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {/* Left: evidence */}
            <div className="space-y-4">
              <Section title="来源与官网">
                {p?.site && (
                  <div className="space-y-2 text-sm">
                    <a href={p.site.finalUrl} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent hover:underline">{p.site.finalUrl}</a>
                    <p><span className="text-muted">标题：</span>{p.site.title}</p>
                    {p.site.description && <p><span className="text-muted">描述：</span>{p.site.description}</p>}
                    <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-canvas p-2 text-xs text-muted">{p.site.excerpt}</p>
                  </div>
                )}
                {raw && <p className="mt-2 text-xs text-muted">来自 {raw.source}：{raw.title} {raw.text && `— ${raw.text.slice(0, 200)}`}</p>}
                {tool?.imageSourceUrl && <p className="mt-2 text-xs text-muted">预览图：<a href={tool.imageSourceUrl} target="_blank" rel="noopener noreferrer" className="underline">打开</a></p>}
              </Section>
              {p?.jev && (
                <Section title="Jev 打分">
                  <div className="space-y-1.5">
                    <Bar label="是 AI 工具" value={p.jev.isTool ?? 0} />
                    <Bar label="简介中立" value={p.jev.neutral ?? 0} />
                    <Bar label="分类匹配" value={p.jev.categoryFit ?? 0} />
                    <Bar label="注入信号" value={p.jev.injection ?? 0} invert />
                    <Bar label="抽取置信度" value={p.jev.extractConfidence ?? 0} />
                    <p className="pt-1 text-xs text-muted">成熟度 {p.jev.maturity?.toFixed(1)} / 5</p>
                  </div>
                </Section>
              )}
            </div>

            {/* Right: decision */}
            <div className="space-y-4">
              {(task.type === "new_tool" || task.type === "duplicate") && tool && (
                <>
                  {task.type === "duplicate" && p?.duplicateOf && (
                    <Section title="可能与现有工具重复">
                      <p className="text-sm">与 <a href={`/zh/tool/${p.duplicateOf.slug}`} target="_blank" className="underline">{p.duplicateOf.slug}</a> 相似度 {p.duplicateOf.similarity}</p>
                      <ActionForm id="merge-form" action={mergeDuplicate} className="mt-3">
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="intoId" value={p.duplicateOf.toolId} />
                        <SubmitButton variant="secondary">合并到现有工具（M）</SubmitButton>
                      </ActionForm>
                    </Section>
                  )}
                  <Section title="编辑并上架">
                    <ActionForm id="approve-form" action={approveNewTool}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <ToolEditor
                        categories={cats}
                        v={{
                          ...tool,
                          primaryCategory: links.find((l) => l.isPrimary)?.slug ?? p?.categorySlugs?.[0],
                          secondaryCategories: links.filter((l) => !l.isPrimary && l.parentId).map((l) => l.slug),
                        }}
                      />
                      <div className="mt-4 flex gap-2"><SubmitButton>通过并上架（A）</SubmitButton></div>
                    </ActionForm>
                  </Section>
                </>
              )}

              {task.type === "field_change" && tool && (
                <Section title="官网有变化，选择要更新的字段">
                  <ActionForm id="approve-form" action={approveFieldChange}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <table className="w-full text-sm">
                      <thead className="text-left text-muted"><tr><th className="w-8" /><th>字段</th><th>当前</th><th>建议</th></tr></thead>
                      <tbody>
                        {Object.entries(p?.fields ?? {}).filter(([k]) => k !== "_suggested").map(([k, after]) => (
                          <tr key={k} className="border-t border-line align-top">
                            <td className="py-2"><input type="checkbox" name="apply" value={k} defaultChecked /></td>
                            <td className="py-2 font-medium">{k}</td>
                            <td className="py-2 text-muted">{JSON.stringify(p?.before?.[k])}</td>
                            <td className="py-2">{JSON.stringify(after)}</td>
                          </tr>
                        ))}
                        {Object.entries((p?.fields?._suggested ?? {}) as Record<string, string>).filter(([, v]) => v).map(([k, after]) => (
                          <tr key={k} className="border-t border-line align-top">
                            <td className="py-2"><input type="checkbox" name="apply" value={k} /></td>
                            <td className="py-2 font-medium">{k}</td>
                            <td className="py-2 text-muted">{String((tool as Record<string, unknown>)[k] ?? "")}</td>
                            <td className="py-2">{after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-4"><SubmitButton>更新所选字段（A）</SubmitButton></div>
                  </ActionForm>
                </Section>
              )}

              {task.type === "suspect_offline" && tool && <OfflineCard taskId={task.id} toolId={tool.id} url={tool.url} />}

              <ActionForm id="reject-form" action={rejectTask}>
                <input type="hidden" name="taskId" value={task.id} />
                <div className="flex items-center gap-2">
                  <input name="note" placeholder="驳回原因（可选）" className="h-9 flex-1 rounded-md border border-line bg-surface px-2 text-sm" />
                  <SubmitButton variant="danger">{task.type === "suspect_offline" ? "仍然在线，保留（R）" : task.type === "field_change" ? "忽略变化（R）" : "驳回（R）"}</SubmitButton>
                </div>
              </ActionForm>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function OfflineCard({ taskId, toolId, url }: { taskId: number; toolId: number; url: string }) {
  const snaps = await db.select().from(snapshots).where(and(eq(snapshots.toolId, toolId))).orderBy(desc(snapshots.checkedAt)).limit(6);
  return (
    <Section title="最近巡检记录">
      <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-accent hover:underline">{url}</a>
      <ul className="mt-2 space-y-1 text-sm">
        {snaps.map((s) => (
          <li key={s.id} className={s.ok ? "text-accent" : "text-danger"}>
            {s.checkedAt.toLocaleString("zh-CN", { hour12: false })} — {s.ok ? `正常 ${s.httpStatus}` : s.error ?? "失败"}
          </li>
        ))}
      </ul>
      <ActionForm id="approve-form" action={confirmOffline} className="mt-3">
        <input type="hidden" name="taskId" value={taskId} />
        <SubmitButton>确认停运并下线（A）</SubmitButton>
      </ActionForm>
    </Section>
  );
}
