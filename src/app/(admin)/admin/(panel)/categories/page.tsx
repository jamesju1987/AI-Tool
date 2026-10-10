import { eq, sql as dsql } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, toolCategories } from "@/db/schema";
import { moveCategoryTools, saveCategory } from "../../actions";
import { ActionForm, SubmitButton } from "../../components";
import { input, Section } from "../ui";

export default async function CategoriesAdmin() {
  const rows = await db.select().from(categories).orderBy(categories.sort, categories.id);
  const counts = await db.select({ id: toolCategories.categoryId, n: dsql<number>`count(*)::int` }).from(toolCategories).where(eq(toolCategories.isPrimary, true)).groupBy(toolCategories.categoryId);
  const countMap = new Map(counts.map((c) => [c.id, c.n]));
  const tops = rows.filter((r) => !r.parentId);

  const Row = ({ c }: { c: (typeof rows)[number] }) => (
    <ActionForm action={saveCategory} className="grid grid-cols-[110px_1fr_1fr_60px_auto_auto] items-center gap-2 border-b border-line py-2 text-sm last:border-0">
      <input type="hidden" name="id" value={c.id} />
      <input type="hidden" name="parentId" value={c.parentId ?? ""} />
      <input name="slug" defaultValue={c.slug} className={input} aria-label="slug" />
      <input name="nameZh" defaultValue={c.nameZh} className={input} aria-label="中文名" />
      <input name="nameEn" defaultValue={c.nameEn} className={input} aria-label="English name" />
      <input name="sort" type="number" defaultValue={c.sort} className={input} aria-label="排序" />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="sensitive" defaultChecked={c.sensitive} />敏感</label>
      <span className="flex items-center gap-2"><span className="w-10 text-right text-muted tabular-nums">{countMap.get(c.id) ?? 0}</span><SubmitButton variant="secondary">保存</SubmitButton></span>
    </ActionForm>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">数字为以该分类为主分类的工具数。标记“敏感”的分类里的工具永远需要人工审核。排序数字越小越靠前。</p>
      {tops.map((t) => (
        <Section key={t.id} title={`${t.nameZh} / ${t.nameEn}`}>
          <Row c={t} />
          <div className="ml-6">
            {rows.filter((r) => r.parentId === t.id).map((c) => <Row key={c.id} c={c} />)}
            <ActionForm action={saveCategory} className="mt-2 grid grid-cols-[110px_1fr_1fr_auto] items-center gap-2 text-sm">
              <input type="hidden" name="parentId" value={t.id} />
              <input name="slug" placeholder="新子类 slug" className={input} required />
              <input name="nameZh" placeholder="中文名" className={input} required />
              <input name="nameEn" placeholder="English name" className={input} required />
              <SubmitButton variant="secondary">添加子类</SubmitButton>
            </ActionForm>
          </div>
        </Section>
      ))}
      <Section title="新增一级分类">
        <ActionForm action={saveCategory} className="grid grid-cols-[140px_1fr_1fr_auto] items-center gap-2 text-sm">
          <input name="slug" placeholder="slug" className={input} required />
          <input name="nameZh" placeholder="中文名" className={input} required />
          <input name="nameEn" placeholder="English name" className={input} required />
          <SubmitButton>添加</SubmitButton>
        </ActionForm>
      </Section>
      <Section title="批量迁移工具">
        <ActionForm action={moveCategoryTools} confirm="把源分类下所有工具的主分类改为目标分类？" className="flex flex-wrap items-center gap-2 text-sm">
          <select name="from" className={`${input} w-56`}>{rows.map((r) => <option key={r.id} value={r.slug}>{r.nameZh}（{r.slug}）</option>)}</select>
          <span>→</span>
          <select name="to" className={`${input} w-56`}>{rows.map((r) => <option key={r.id} value={r.slug}>{r.nameZh}（{r.slug}）</option>)}</select>
          <SubmitButton variant="secondary">迁移</SubmitButton>
        </ActionForm>
      </Section>
    </div>
  );
}
