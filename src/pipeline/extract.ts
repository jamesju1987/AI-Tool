import { z } from "zod";
import { env } from "@/lib/env";
import { chatJson } from "./llm";
import type { SiteInfo } from "./site";

const str = (max: number) => z.string().trim().transform((s) => s.slice(0, max));
const list = (n: number, max: number) =>
  z.array(z.string().trim()).default([]).transform((a) => a.filter(Boolean).slice(0, n).map((s) => s.slice(0, max)));

export const ExtractedSchema = z.object({
  isAiTool: z.boolean(),
  name: str(80),
  aliases: list(5, 60),
  taglineEn: str(90),
  taglineZh: str(40),
  descriptionEn: str(600),
  descriptionZh: str(300),
  featuresEn: list(5, 120),
  featuresZh: list(5, 60),
  useCasesEn: list(4, 120),
  useCasesZh: list(4, 60),
  pricingType: z.enum(["free", "freemium", "paid", "unknown"]).catch("unknown"),
  pricingNoteEn: str(200).default(""),
  pricingNoteZh: str(100).default(""),
  platforms: z.array(z.enum(["web", "desktop", "mobile", "plugin", "api"]).catch("web")).default([]).transform((a) => [...new Set(a)]),
  openSource: z.boolean().default(false),
  hasCnUi: z.boolean().default(false),
  hasEnterprise: z.boolean().default(false),
  company: str(80).nullable().default(null),
  originCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable().catch(null).default(null),
  primaryCategory: z.string().trim(),
  secondaryCategories: z.array(z.string().trim()).default([]),
  confidence: z
    .object({ overall: z.number().min(0).max(1), category: z.number().min(0).max(1), pricing: z.number().min(0).max(1) })
    .catch({ overall: 0.5, category: 0.5, pricing: 0.5 }),
});
export type Extracted = z.infer<typeof ExtractedSchema>;

export type CategoryOption = { slug: string; nameEn: string; nameZh: string; parentSlug: string | null };

const BANNED = /(最强|神器|颠覆性?|革命性|史上|业界第一|全网第一|最好用的?|\b(the )?best(-in-class)?\b|\brevolutionary\b|\bgame[- ]?chang\w*|\bultimate\b|\bunparalleled\b|\bcutting[- ]edge\b|world'?s (first|best|leading))/gi;

const SYSTEM = `You write neutral, factual listings for a bilingual (English + Simplified Chinese) AI tool directory.
Rules:
- Describe only what the website shows. Never invent features, prices or company facts. If unsure, say less.
- No marketing superlatives ("best", "revolutionary", "最强", "神器", "颠覆" …). Plain verbs, short sentences.
- taglineEn ≤ 90 characters, taglineZh ≤ 30 汉字. Chinese must read naturally, not like a literal translation.
- pricingType: "free" (no paid plan), "freemium" (free tier + paid), "paid" (no usable free tier), "unknown".
- platforms: any of web, desktop, mobile, plugin (browser/IDE extension), api.
- originCountry: ISO-3166 alpha-2 of the team/company if the site states it, else null.
- isAiTool: true only if this is a usable product, app, model or service whose core function uses AI. False for news articles, blogs, agencies, generic SaaS, parked domains, login walls with no product info.
- primaryCategory must be one slug from the provided list (prefer the most specific sub-category).
- confidence values are your honest 0–1 certainty.`;

export function categoryListForPrompt(cats: CategoryOption[]) {
  return cats.map((c) => `${c.slug}: ${c.nameEn} / ${c.nameZh}${c.parentSlug ? ` (in ${c.parentSlug})` : ""}`).join("\n");
}

export async function extractTool(site: SiteInfo, hint: { title?: string; text?: string }, cats: CategoryOption[]): Promise<Extracted> {
  if (!env.llmEnabled) return mockExtract(site, hint, cats);
  const data = [
    `URL: ${site.finalUrl}`,
    `TITLE: ${site.title}`,
    `META DESCRIPTION: ${site.description}`,
    hint.title ? `SOURCE LISTING TITLE: ${hint.title}` : "",
    hint.text ? `SOURCE LISTING TEXT: ${hint.text.slice(0, 1500)}` : "",
    `HOMEPAGE TEXT: ${site.text.slice(0, 6000)}`,
    site.pricingText ? `PRICING PAGE TEXT: ${site.pricingText.slice(0, 3000)}` : "",
  ].filter(Boolean).join("\n\n");

  const out = await chatJson({
    system: SYSTEM,
    instructions: `Create the directory listing for the product described below.
Allowed category slugs:
${categoryListForPrompt(cats)}

JSON keys: isAiTool, name, aliases[], taglineEn, taglineZh, descriptionEn, descriptionZh, featuresEn[3-5], featuresZh[3-5], useCasesEn[2-4], useCasesZh[2-4], pricingType, pricingNoteEn, pricingNoteZh, platforms[], openSource, hasCnUi, hasEnterprise, company, originCountry, primaryCategory, secondaryCategories[], confidence{overall,category,pricing}.`,
    data,
    schema: ExtractedSchema,
  });
  return sanitize(out, cats);
}

/** Enforce rules the model may slip on: valid category, no superlatives. */
export function sanitize(e: Extracted, cats: CategoryOption[]): Extracted {
  const slugs = new Set(cats.map((c) => c.slug));
  const clean = (s: string) => s.replace(BANNED, "").replace(/\s{2,}/g, " ").trim();
  const primary = slugs.has(e.primaryCategory) ? e.primaryCategory : cats[0]?.slug ?? "";
  return {
    ...e,
    taglineEn: clean(e.taglineEn),
    taglineZh: clean(e.taglineZh),
    descriptionEn: clean(e.descriptionEn),
    descriptionZh: clean(e.descriptionZh),
    primaryCategory: primary,
    secondaryCategories: e.secondaryCategories.filter((s) => slugs.has(s) && s !== primary).slice(0, 2),
    confidence: slugs.has(e.primaryCategory) ? e.confidence : { ...e.confidence, category: 0 },
  };
}

// ---------------------------------------------------------------------------
// Offline heuristic used when no API key is configured (local dev, tests).
// Produces a low-confidence draft so everything lands in the review queue.
// ---------------------------------------------------------------------------
const KEYWORDS: [RegExp, string][] = [
  [/\b(slides?|presentation|ppt)\b|演示|幻灯/i, "office-slides"],
  [/\b(video|film|animation)\b|视频/i, "video-generation"],
  [/\bavatar|数字人/i, "video-avatar"],
  [/\b(voice|speech|tts|dubbing)\b|配音|语音/i, "audio-tts"],
  [/\b(music|song)\b|音乐|歌曲/i, "audio-music"],
  [/\b(transcri|subtitle|caption)/i, "audio-transcribe"],
  [/background remov|抠图/i, "image-background"],
  [/\b(image|photo|picture|art|illustration)\b|图片|绘画|图像/i, "image-generation"],
  [/\b(code|coding|developer|ide|program)/i, "coding-assistant"],
  [/\bagent/i, "agents-general"],
  [/\btranslat|翻译/i, "translation-docs"],
  [/\bsearch\b|搜索/i, "search-general"],
  [/\b(writ|essay|copy|blog)\w*|写作/i, "writing-general"],
  [/\b(chat|assistant)\b|助手|对话/i, "chat-general"],
];

export function mockExtract(site: SiteInfo, hint: { title?: string; text?: string }, cats: CategoryOption[]): Extracted {
  const blob = `${site.title} ${site.description} ${hint.title ?? ""} ${hint.text ?? ""} ${site.text.slice(0, 2000)}`;
  const slugs = new Set(cats.map((c) => c.slug));
  const primary = KEYWORDS.find(([re, slug]) => re.test(blob) && slugs.has(slug))?.[1] ?? cats.find((c) => c.parentSlug)?.slug ?? cats[0]?.slug ?? "";
  const rawName = (site.title || hint.title || new URL(site.finalUrl).hostname).split(/\s[-–|:·]\s|[|｜–—:]/)[0].trim();
  const desc = (site.description || hint.text || "").replace(/\s+/g, " ").trim();
  const zh = /[一-鿿]/.test(desc);
  const pricing = /free trial|pricing|\$\d|¥|元\/|per month|\/mo/i.test(site.pricingText + site.text)
    ? /free plan|free forever|免费/i.test(site.pricingText + site.text) ? "freemium" : "paid"
    : "unknown";
  return sanitize(
    {
      isAiTool: /\bai\b|artificial intelligence|gpt|llm|人工智能|智能|model/i.test(blob),
      name: rawName.slice(0, 80) || "Untitled",
      aliases: [],
      taglineEn: zh ? "" : desc.slice(0, 90),
      taglineZh: zh ? desc.slice(0, 40) : "",
      descriptionEn: zh ? "" : desc.slice(0, 600),
      descriptionZh: zh ? desc.slice(0, 300) : "",
      featuresEn: [],
      featuresZh: [],
      useCasesEn: [],
      useCasesZh: [],
      pricingType: pricing,
      pricingNoteEn: "",
      pricingNoteZh: "",
      platforms: ["web"],
      openSource: /github\.com|open[- ]source|开源/i.test(site.finalUrl + blob),
      hasCnUi: zh || site.lang?.toLowerCase().startsWith("zh") === true,
      hasEnterprise: /enterprise|企业版/i.test(blob),
      company: null,
      originCountry: zh ? "CN" : null,
      primaryCategory: primary,
      secondaryCategories: [],
      confidence: { overall: 0.4, category: 0.4, pricing: 0.3 },
    },
    cats,
  );
}
