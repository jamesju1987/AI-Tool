import { getSettings } from "@/lib/settings";
import { saveSettings } from "../../actions";
import { ActionForm, SubmitButton } from "../../components";
import { input, Section, textarea } from "../ui";

function Num({ name, label, value, step = 0.01, hint }: { name: string; label: string; value: number; step?: number; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}{hint && <span className="ml-1 text-xs">{hint}</span>}</span>
      <input name={name} type="number" step={step} defaultValue={value} className={input} />
    </label>
  );
}

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <ActionForm action={saveSettings} className="max-w-4xl space-y-4">
      <Section title="自动上架">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="autoPublish" defaultChecked={s.autoPublish} />
          开启自动上架（PRD 建议上线前 4 周关闭，全部人工审核，用来校准下面的阈值）
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <Num name="t_isTool" label="是 AI 工具 ≥" value={s.thresholds.isTool} />
          <Num name="t_neutral" label="简介中立 ≥" value={s.thresholds.neutral} />
          <Num name="t_categoryFit" label="分类匹配 ≥" value={s.thresholds.categoryFit} />
          <Num name="t_maxInjection" label="注入信号 <" value={s.thresholds.maxInjection} />
          <Num name="t_duplicateSimilarity" label="疑似重复 ≥" value={s.thresholds.duplicateSimilarity} hint="向量相似度" />
        </div>
      </Section>
      <Section title="综合排序权重">
        <p className="mb-3 text-sm text-muted">冷启动建议 0.6 / 0.1 / 0.2 / 0.1，有 3 个月行为数据后改为 0.3 / 0.4 / 0.2 / 0.1。</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Num name="w_ai" label="AI 评审" value={s.weights.ai} />
          <Num name="w_behavior" label="站内行为" value={s.weights.behavior} />
          <Num name="w_external" label="外部信号" value={s.weights.external} />
          <Num name="w_freshness" label="新鲜度" value={s.weights.freshness} />
        </div>
      </Section>
      <Section title="热度权重">
        <div className="grid gap-3 sm:grid-cols-4">
          <Num name="h_clicks" label="外链点击" value={s.heatWeights.clicks} />
          <Num name="h_views" label="详情浏览" value={s.heatWeights.views} />
          <Num name="h_external" label="外部信号" value={s.heatWeights.external} />
          <Num name="h_freshness" label="新鲜度" value={s.heatWeights.freshness} />
        </div>
      </Section>
      <Section title="两两排序（Jev）">
        <div className="grid gap-3 sm:grid-cols-3">
          <Num name="p_budget" label="每个工具最多比较次数" value={s.pairwise.budgetPerItem} step={1} />
          <Num name="p_max" label="每个分类最多参与排序的工具数" value={s.pairwise.maxItemsPerCategory} step={1} />
          <Num name="reviewBacklogLimit" label="待审积压上限" value={s.reviewBacklogLimit} step={1} hint="超过后暂停非可信来源" />
        </div>
      </Section>
      <Section title="外链拦截">
        <p className="mb-2 text-sm text-muted">每行一个域名。/go 跳转到这些域名时会显示拦截页（另有 Safe Browsing 自动检查）。</p>
        <textarea name="blockedDomains" rows={4} defaultValue={s.blockedDomains.join("\n")} className={`${textarea} font-mono`} />
      </Section>
      <SubmitButton>保存设置</SubmitButton>
    </ActionForm>
  );
}
