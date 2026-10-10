import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, jevJudgments, snapshots, toolCategories, tools } from "@/db/schema";
import { mergeToolAction, recheckTool, saveTool, setToolStatus } from "../../../actions";
import { ActionForm, SubmitButton } from "../../../components";
import { ToolEditor } from "../../ToolEditor";
import { input, Section } from "../../ui";

export default async function ToolEdit({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [tool] = await db.select().from(tools).where(eq(tools.id, id));
  if (!tool) notFound();
  const [cats, links, snaps, judgments] = await Promise.all([
    db.select().from(categories).orderBy(categories.sort),
    db.select({ slug: categories.slug, isPrimary: toolCategories.isPrimary, parentId: categories.parentId }).from(toolCategories).innerJoin(categories, eq(categories.id, toolCategories.categoryId)).where(eq(toolCategories.toolId, id)),
    db.select().from(snapshots).where(eq(snapshots.toolId, id)).orderBy(desc(snapshots.checkedAt)).limit(5),
    db.select().from(jevJudgments).where(eq(jevJudgments.toolId, id)).orderBy(desc(jevJudgments.id)).limit(10),
  ]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-2xl font-semibold">{tool.name}</h1>
          <span className="text-sm text-muted">/{tool.slug} · {tool.status}</span>
          {tool.status === "listed" && <a href={`/zh/tool/${tool.slug}`} target="_blank" className="text-sm underline">查看页面</a>}
          {tool.mergedIntoId && <Link href={`/admin/tools/${tool.mergedIntoId}`} className="text-sm underline">已合并到 #{tool.mergedIntoId}</Link>}
        </div>
        <Section title="编辑">
          <ActionForm action={saveTool}>
            <input type="hidden" name="toolId" value={tool.id} />
            <ToolEditor
              categories={cats}
              v={{ ...tool, primaryCategory: links.find((l) => l.isPrimary)?.slug, secondaryCategories: links.filter((l) => !l.isPrimary && l.parentId).map((l) => l.slug) }}
            />
            <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" name="pinned" defaultChecked={tool.pinned} />在分类中置顶（编辑推荐，不受排序影响）</label>
            <div className="mt-4"><SubmitButton>保存</SubmitButton></div>
          </ActionForm>
        </Section>
      </div>

      <aside className="space-y-4">
        <Section title="状态">
          <ActionForm action={setToolStatus}>
            <input type="hidden" name="toolId" value={tool.id} />
            <div className="flex gap-2">
              <select name="status" defaultValue={tool.status} className={input}>
                <option value="listed">在架</option><option value="draft">草稿</option><option value="suspect_offline">疑似下线</option><option value="offline">已下线</option><option value="rejected">已驳回</option>
              </select>
              <SubmitButton variant="secondary">更改</SubmitButton>
            </div>
          </ActionForm>
          <ActionForm action={recheckTool} className="mt-3" refresh={false}>
            <input type="hidden" name="toolId" value={tool.id} />
            <SubmitButton variant="secondary">立即巡检</SubmitButton>
          </ActionForm>
        </Section>
        <Section title="合并重复项">
          <p className="mb-2 text-xs text-muted">把这个工具并入另一个工具：名称成为别名，旧网址 301 跳转。</p>
          <ActionForm action={mergeToolAction} confirm="确认合并？此操作会让当前工具下线。">
            <input type="hidden" name="toolId" value={tool.id} />
            <div className="flex gap-2">
              <input name="intoSlug" placeholder="目标 slug" required className={input} />
              <SubmitButton variant="danger">合并</SubmitButton>
            </div>
          </ActionForm>
        </Section>
        <Section title="数据">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">热度</dt><dd>{tool.heatScore.toFixed(3)}</dd>
            <dt className="text-muted">AI 评审（中/英）</dt><dd>{tool.aiScoreZh?.toFixed(2) ?? "—"} / {tool.aiScoreEn?.toFixed(2) ?? "—"}</dd>
            <dt className="text-muted">综合分（中/英）</dt><dd>{tool.rankScoreZh.toFixed(3)} / {tool.rankScoreEn.toFixed(3)}</dd>
            <dt className="text-muted">外部信号</dt><dd className="break-all">{JSON.stringify(tool.signals)}</dd>
            <dt className="text-muted">安全</dt><dd>{tool.safety?.flagged ? <span className="text-danger">已标记 {tool.safety.detail}</span> : "未发现问题"}</dd>
          </dl>
        </Section>
        <Section title="巡检记录">
          <ul className="space-y-1 text-xs">
            {snaps.map((s) => <li key={s.id} className={s.ok ? "" : "text-danger"}>{s.checkedAt.toLocaleString("zh-CN", { hour12: false })} {s.ok ? `OK ${s.httpStatus}` : s.error}</li>)}
            {!snaps.length && <li className="text-muted">还没有巡检。</li>}
          </ul>
        </Section>
        <Section title="Jev 判断">
          <ul className="space-y-1 text-xs">
            {judgments.map((j) => <li key={j.id}><span className="text-muted">{j.kind}/{j.question}</span> {Object.entries(j.probabilities).map(([k, v]) => `${k}:${Number(v).toFixed(2)}`).join(" ")}</li>)}
            {!judgments.length && <li className="text-muted">无</li>}
          </ul>
        </Section>
      </aside>
    </div>
  );
}
