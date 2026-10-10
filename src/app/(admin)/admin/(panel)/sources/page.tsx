import { eq, sql as dsql } from "drizzle-orm";
import { db } from "@/db/client";
import { rawItems, reviewTasks, sources } from "@/db/schema";
import { runJobNow, saveSource } from "../../actions";
import { ActionForm, SubmitButton } from "../../components";
import { input, Section, textarea } from "../ui";

export default async function SourcesAdmin() {
  const list = await db.select().from(sources).orderBy(sources.id);
  // Output and approval rate per source (PRD §7).
  const stats = await db
    .select({
      sourceId: rawItems.sourceId,
      items: dsql<number>`count(*)::int`,
      approved: dsql<number>`count(*) filter (where ${reviewTasks.status} = 'approved')::int`,
      decided: dsql<number>`count(*) filter (where ${reviewTasks.status} <> 'pending')::int`,
    })
    .from(rawItems)
    .leftJoin(reviewTasks, eq(reviewTasks.rawItemId, rawItems.id))
    .groupBy(rawItems.sourceId);
  const statMap = new Map(stats.map((s) => [s.sourceId, s]));

  return (
    <div className="space-y-4">
      {list.map((s) => {
        const st = statMap.get(s.id);
        const rate = st && st.decided ? `${Math.round((st.approved / st.decided) * 100)}%` : "—";
        return (
          <Section
            key={s.id}
            title={`${s.name}（${s.type}）`}
            action={
              <ActionForm action={runJobNow} refresh={false}>
                <input type="hidden" name="job" value="collect" />
                <input type="hidden" name="source" value={s.key} />
                <SubmitButton variant="secondary">立即采集</SubmitButton>
              </ActionForm>
            }
          >
            <p className="mb-3 text-sm text-muted">
              累计条目 {st?.items ?? 0}，审核通过率 {rate}，上次运行 {s.lastRunAt?.toLocaleString("zh-CN", { hour12: false }) ?? "从未"}
              {s.lastError && <span className="block text-danger">上次错误：{s.lastError}</span>}
            </p>
            <ActionForm action={saveSource} className="space-y-2">
              <input type="hidden" name="id" value={s.id} />
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5"><input type="checkbox" name="enabled" defaultChecked={s.enabled} />启用</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" name="trusted" defaultChecked={s.trusted} />可信来源（允许自动上架）</label>
                <label className="flex items-center gap-1.5">同站请求间隔 ms <input name="rateLimitMs" type="number" defaultValue={s.rateLimitMs} className={`${input} w-24`} /></label>
              </div>
              <textarea name="config" defaultValue={JSON.stringify(s.config, null, 2)} rows={4} className={`${textarea} font-mono`} aria-label="配置 JSON" />
              <SubmitButton variant="secondary">保存</SubmitButton>
            </ActionForm>
          </Section>
        );
      })}

      <Section title="新增数据源">
        <p className="mb-3 text-sm text-muted">
          RSS：<code>{`{"url": "https://…/feed", "mode": "link"}`}</code>（条目链接就是工具官网）或 <code>&quot;mode&quot;: &quot;article&quot;</code>（新闻文章，取正文第一个外链）。
          网页列表：<code>{`{"url": "…", "itemSelector": ".item", "linkSelector": "a"}`}</code>——只取名称和链接作线索，信息一律从官网重新整理。
        </p>
        <ActionForm action={saveSource} className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <input name="key" placeholder="key，如 qbitai" className={input} required />
            <input name="name" placeholder="显示名称" className={input} required />
            <select name="type" className={input}>
              <option value="rss">RSS / Atom</option><option value="html_list">网页列表</option><option value="github">GitHub</option><option value="producthunt">Product Hunt</option><option value="huggingface">Hugging Face</option>
            </select>
          </div>
          <textarea name="config" rows={3} defaultValue={'{"url": "", "mode": "article"}'} className={`${textarea} font-mono`} />
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" name="enabled" defaultChecked />启用</label>
            <input type="hidden" name="rateLimitMs" value="1500" />
            <SubmitButton>添加</SubmitButton>
          </div>
        </ActionForm>
      </Section>
    </div>
  );
}
