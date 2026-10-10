import type { Metadata } from "next";
import { PageTitle } from "@/components/ui";
import { t, type Locale } from "@/lib/i18n";
import { alternates } from "@/lib/seo";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: t(locale).methodologyTitle, alternates: alternates(locale, "/methodology") };
}

const content = {
  zh: [
    ["工具从哪里来", "我们每天从 Product Hunt、GitHub、Hacker News 等公开来源发现新工具，也接受开发者提交。每个工具的信息都从它的官网重新整理，不复制其他导航站的描述。"],
    ["如何核验", "AI 先读取官网并整理出名称、简介、定价、平台等信息，再由判断模型 Jev 检查：这是不是一个能实际使用的 AI 工具、简介是否中立、分类是否正确。没把握的条目一律交给编辑人工审核。已收录的工具每周自动回访官网，发现改版就重新整理，连续打不开就标记为疑似停运，经人工确认后下线。"],
    ["综合排序怎么算", "每周在每个分类内，让 Jev 两两比较工具：完成这类任务时哪个更有用、哪个对新手更容易上手、哪个在国内更方便使用。每一对都正反两个顺序各问一次，抵消位置偏差，再合成一个排名。综合分 = AI 评审分 + 站内点击与浏览 + 外部热度（如 Product Hunt 票数、GitHub 新增 Star）+ 新鲜度，各项权重会随数据积累调整。前两名差距太小时会标注“难分高下”。"],
    ["广告与排名", "推广位统一标注“广告”，与综合排序完全分开。工具方可以申请修改信息或下架，但不能付费改变排名。"],
  ],
  en: [
    ["Where tools come from", "We discover new tools every day from public sources such as Product Hunt, GitHub and Hacker News, and accept submissions from makers. Every listing is written from the tool's own website — we never copy other directories."],
    ["How we check them", "An AI model reads the official site and drafts the listing: name, summary, pricing, platforms. A decision model, Jev, then checks whether it is a usable AI tool, whether the summary is neutral, and whether the category fits. Anything uncertain goes to a human editor. Listed tools are revisited every week; if a site changes we re-draft the listing, and if it stays unreachable an editor confirms before we mark it as shut down."],
    ["How the ranking works", "Each week, within every category, Jev compares tools two at a time: which is more useful for this task, which is easier for a newcomer, and which is easier to use from mainland China. Each pair is asked in both orders to cancel position bias, and the answers are combined into one ranking. The overall score blends that AI ranking with on-site clicks and views, outside signals such as Product Hunt votes and new GitHub stars, and freshness. When the top two are too close to separate, we say so."],
    ["Ads and rankings", "Sponsored placements are always labelled and are kept separate from rankings. Makers can ask us to correct or remove a listing, but cannot pay to change its rank."],
  ],
};

export default async function MethodologyPage({ params }: Props) {
  const { locale } = await params;
  return (
    <article className="max-w-[68ch]">
      <PageTitle title={t(locale).methodologyTitle} />
      {content[locale].map(([h, p]) => (
        <section key={h} className="mt-8">
          <h2 className="font-display text-xl font-semibold">{h}</h2>
          <p className="mt-2">{p}</p>
        </section>
      ))}
    </article>
  );
}
