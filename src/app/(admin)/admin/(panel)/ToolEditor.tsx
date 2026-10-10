import type { Category } from "@/db/schema";
import { input, textarea } from "./ui";

export type EditorValues = {
  name?: string; url?: string; globalUrl?: string | null; aliases?: string[];
  taglineZh?: string; taglineEn?: string; descriptionZh?: string; descriptionEn?: string;
  featuresZh?: string[]; featuresEn?: string[]; useCasesZh?: string[]; useCasesEn?: string[];
  pricingType?: string; pricingNoteZh?: string; pricingNoteEn?: string; cnAccess?: string;
  platforms?: string[]; openSource?: boolean; hasCnUi?: boolean; hasEnterprise?: boolean;
  company?: string | null; originCountry?: string | null; maturity?: number | null;
  primaryCategory?: string; secondaryCategories?: string[];
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}{hint && <span className="ml-2 text-xs">{hint}</span>}</span>
      {children}
    </label>
  );
}

/** Shared bilingual editor used by the review card and the tool page. Field names match parseToolForm. */
export function ToolEditor({ v, categories }: { v: EditorValues; categories: Category[] }) {
  const tops = categories.filter((c) => !c.parentId);
  const leaves = tops.flatMap((t) => {
    const kids = categories.filter((c) => c.parentId === t.id);
    return kids.length ? kids.map((k) => ({ slug: k.slug, label: `${t.nameZh} › ${k.nameZh}` })) : [{ slug: t.slug, label: t.nameZh }];
  });
  const secondary = new Set(v.secondaryCategories ?? []);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="名称"><input name="name" defaultValue={v.name} required className={input} /></Field>
        <Field label="别名" hint="逗号分隔"><input name="aliases" defaultValue={(v.aliases ?? []).join(", ")} className={input} /></Field>
        <Field label="官网"><input name="url" type="url" defaultValue={v.url} required className={input} /></Field>
        <Field label="海外版 / 国内版网址"><input name="globalUrl" type="url" defaultValue={v.globalUrl ?? ""} className={input} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="一句话简介（中）" hint="≤30 字，中立"><input name="taglineZh" defaultValue={v.taglineZh} maxLength={60} className={input} /></Field>
        <Field label="Tagline (EN)" hint="≤90 chars"><input name="taglineEn" defaultValue={v.taglineEn} maxLength={120} className={input} /></Field>
        <Field label="介绍（中）"><textarea name="descriptionZh" defaultValue={v.descriptionZh} rows={3} className={textarea} /></Field>
        <Field label="Description (EN)"><textarea name="descriptionEn" defaultValue={v.descriptionEn} rows={3} className={textarea} /></Field>
        <Field label="核心功能（中）" hint="每行一条"><textarea name="featuresZh" defaultValue={(v.featuresZh ?? []).join("\n")} rows={3} className={textarea} /></Field>
        <Field label="Features (EN)" hint="one per line"><textarea name="featuresEn" defaultValue={(v.featuresEn ?? []).join("\n")} rows={3} className={textarea} /></Field>
        <Field label="适用场景（中）"><textarea name="useCasesZh" defaultValue={(v.useCasesZh ?? []).join("\n")} rows={2} className={textarea} /></Field>
        <Field label="Use cases (EN)"><textarea name="useCasesEn" defaultValue={(v.useCasesEn ?? []).join("\n")} rows={2} className={textarea} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="定价">
          <select name="pricingType" defaultValue={v.pricingType ?? "unknown"} className={input}>
            <option value="free">免费</option><option value="freemium">免费增值</option><option value="paid">付费</option><option value="unknown">未知</option>
          </select>
        </Field>
        <Field label="国内访问">
          <select name="cnAccess" defaultValue={v.cnAccess ?? "unknown"} className={input}>
            <option value="direct">可直接访问</option><option value="unstable">不稳定</option><option value="blocked">无法访问</option><option value="unknown">未知</option>
          </select>
        </Field>
        <Field label="公司"><input name="company" defaultValue={v.company ?? ""} className={input} /></Field>
        <Field label="团队所在地" hint="两位国家码，如 CN/US"><input name="originCountry" defaultValue={v.originCountry ?? ""} maxLength={2} className={input} /></Field>
        <Field label="定价说明（中）"><input name="pricingNoteZh" defaultValue={v.pricingNoteZh} className={input} /></Field>
        <Field label="Pricing note (EN)"><input name="pricingNoteEn" defaultValue={v.pricingNoteEn} className={input} /></Field>
        <Field label="成熟度 1–5"><input name="maturity" type="number" min={1} max={5} step={0.1} defaultValue={v.maturity ?? ""} className={input} /></Field>
      </div>
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <legend className="mb-1 text-muted">平台与属性</legend>
        {["web", "desktop", "mobile", "plugin", "api"].map((p) => (
          <label key={p} className="flex items-center gap-1.5"><input type="checkbox" name="platforms" value={p} defaultChecked={v.platforms?.includes(p)} />{p}</label>
        ))}
        <label className="flex items-center gap-1.5"><input type="checkbox" name="openSource" defaultChecked={v.openSource} />开源</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" name="hasCnUi" defaultChecked={v.hasCnUi} />中文界面</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" name="hasEnterprise" defaultChecked={v.hasEnterprise} />企业版</label>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="主分类">
          <select name="primaryCategory" defaultValue={v.primaryCategory} required className={input}>
            {leaves.map((l) => <option key={l.slug} value={l.slug}>{l.label}</option>)}
          </select>
        </Field>
        <Field label="附加分类" hint="可多选（按住 Ctrl/⌘）">
          <select name="secondaryCategories" multiple defaultValue={[...secondary]} className={`${input} h-20`}>
            {leaves.map((l) => <option key={l.slug} value={l.slug}>{l.label}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}
