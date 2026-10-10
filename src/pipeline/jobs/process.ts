import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, jevJudgments, rawItems, reviewTasks, sources, tools, type RawItem, type ReviewPayload, type Signals, type Source, type Tool } from "@/db/schema";
import { revalidateSite } from "@/lib/revalidate";
import { getSettings, type AppSettings } from "@/lib/settings";
import { siteKey } from "@/lib/url";
import { findBySiteKey, findSimilar } from "../dedupe";
import { extractTool, type CategoryOption, type Extracted } from "../extract";
import { FetchBlockedError } from "../http";
import { scoreIntake, type IntakeScores } from "../intake";
import { embed } from "../llm";
import { createTool } from "../publish";
import type { JobContext } from "../runner";
import { fetchSite, type SiteInfo } from "../site";

/** Max of numeric signals; sourceCount is tracked separately. */
export function mergeSignals(a: Signals, b: Signals): Signals {
  const out: Signals = { ...a };
  for (const [k, v] of Object.entries(b) as [keyof Signals, number][]) {
    if (typeof v !== "number") continue;
    if (k === "githubStars" && typeof a.githubStars === "number" && v > a.githubStars) out.githubStarsDelta = v - a.githubStars;
    out[k] = Math.max(a[k] ?? 0, v);
  }
  return out;
}

export async function loadCategoryOptions(): Promise<{ options: CategoryOption[]; bySlug: Map<string, typeof categories.$inferSelect> }> {
  const rows = await db.select().from(categories);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const options = rows
    // Leaf categories only (a top-level category with children is not a valid primary).
    .filter((r) => r.parentId || !rows.some((c) => c.parentId === r.id))
    .map((r) => ({ slug: r.slug, nameEn: r.nameEn, nameZh: r.nameZh, parentSlug: r.parentId ? byId.get(r.parentId)?.slug ?? null : null }));
  return { options, bySlug: new Map(rows.map((r) => [r.slug, r])) };
}

export type RouteDecision = { auto: boolean; reasons: string[]; confidence: number };

/** PRD §6 step 5 — the only place that decides between auto-publish and human review. */
export function decideRoute(input: {
  settings: AppSettings;
  scores: IntakeScores;
  extracted: Extracted;
  site: SiteInfo;
  trustedSource: boolean;
  sourceCount: number;
  sensitiveCategory: boolean;
  duplicate: boolean;
}): RouteDecision {
  const { settings: s, scores, extracted: e } = input;
  const t = s.thresholds;
  const reasons: string[] = [];
  if (!s.autoPublish) reasons.push("自动上架已关闭（校准期）");
  if (!input.site.ok) reasons.push(`官网返回 ${input.site.status}`);
  if (scores.isTool < t.isTool) reasons.push(`是否为 AI 工具置信度 ${scores.isTool.toFixed(2)}`);
  if (scores.neutral < t.neutral) reasons.push(`简介中立度 ${scores.neutral.toFixed(2)}，可能需要改写`);
  if (scores.categoryFit < t.categoryFit) reasons.push(`分类匹配度 ${scores.categoryFit.toFixed(2)}`);
  if (scores.injection >= t.maxInjection) reasons.push(`页面疑似含针对 AI 的指令（${scores.injection.toFixed(2)}）`);
  if (e.confidence.overall < 0.7) reasons.push(`抽取置信度 ${e.confidence.overall.toFixed(2)}`);
  if (!input.trustedSource && input.sourceCount < 2) reasons.push("仅单一非官方来源");
  if (input.sensitiveCategory) reasons.push("敏感类目");
  if (input.duplicate) reasons.push("疑似重复");
  if (!e.taglineZh || !e.taglineEn) reasons.push("缺少中文或英文简介");
  const confidence = Math.min(scores.isTool, scores.neutral, scores.categoryFit, 1 - scores.injection, e.confidence.overall);
  const blocking = reasons.filter((r) => r !== "自动上架已关闭（校准期）");
  return { auto: s.autoPublish && blocking.length === 0, reasons, confidence };
}

async function markRaw(id: number, patch: Partial<RawItem>) {
  await db.update(rawItems).set({ ...patch, processedAt: new Date() }).where(eq(rawItems.id, id));
}

async function resolveExisting(key: string): Promise<Tool | null> {
  let t = await findBySiteKey(key);
  for (let i = 0; t?.mergedIntoId && i < 5; i++) [t] = await db.select().from(tools).where(eq(tools.id, t.mergedIntoId));
  return t ?? null;
}

/** Turn pending raw items into draft tools + review tasks (or published tools when confident). */
export async function processRaw(ctx: JobContext) {
  const settings = await getSettings();
  const { options, bySlug } = await loadCategoryOptions();
  const sourceRows = await db.select().from(sources);
  const sourceById = new Map<number, Source>(sourceRows.map((s) => [s.id, s]));
  const limit = Number(ctx.args.limit ?? 100);
  const items = await db.select().from(rawItems).where(eq(rawItems.status, "pending")).orderBy(asc(rawItems.id)).limit(limit);
  ctx.log(`${items.length} pending raw items`);
  let published = 0;

  for (const item of items) {
    const source = sourceById.get(item.sourceId);
    try {
      // 1. Fetch the site (follows redirects, e.g. Product Hunt → real domain).
      let site: SiteInfo;
      try {
        site = await fetchSite(item.url, { minGapMs: source?.rateLimitMs });
      } catch (e) {
        ctx.inc(e instanceof FetchBlockedError ? "blocked" : "fetch_errors");
        await markRaw(item.id, { status: e instanceof FetchBlockedError ? "skipped" : "error", error: (e as Error).message.slice(0, 500) });
        continue;
      }
      const key = siteKey(site.finalUrl);

      // 2. Known tool? Just add the new signal and move on.
      const existing = await resolveExisting(key);
      if (existing) {
        const signals = mergeSignals(existing.signals, item.signals);
        signals.sourceCount = (existing.signals.sourceCount ?? 1) + 1;
        await db.update(tools).set({ signals }).where(eq(tools.id, existing.id));
        await markRaw(item.id, { status: "processed", matchedToolId: existing.id });
        ctx.inc("matched_existing");
        continue;
      }
      if (!site.ok) {
        await markRaw(item.id, { status: "skipped", error: `HTTP ${site.status}` });
        ctx.inc("dead_links");
        continue;
      }

      // 3. AI extraction (bilingual card) + 4. intake judgments.
      const extracted = await extractTool(site, { title: item.title, text: item.rawText }, options);
      const cat = bySlug.get(extracted.primaryCategory);
      const parent = cat?.parentId ? [...bySlug.values()].find((c) => c.id === cat.parentId) : undefined;
      const intake = await scoreIntake(site, extracted, cat ? `${cat.nameEn} / ${cat.nameZh}` : extracted.primaryCategory);

      // Clearly not a tool: remember the domain as rejected so we never re-process it.
      if (!extracted.isAiTool && intake.scores.isTool < 0.3) {
        await createTool({ fields: { name: extracted.name || item.title || key, url: site.finalUrl }, primaryCategory: extracted.primaryCategory, status: "draft" })
          .then((t) => db.update(tools).set({ status: "rejected" }).where(eq(tools.id, t.id)));
        await markRaw(item.id, { status: "skipped", error: "not an AI tool" });
        ctx.inc("not_a_tool");
        continue;
      }

      // 5. Fuzzy duplicate check.
      const vec = (await embed([`${extracted.name}. ${extracted.taglineEn} ${extracted.descriptionEn}`]))?.[0] ?? null;
      const dup = await findSimilar(extracted.name, vec, settings.thresholds.duplicateSimilarity);

      // 6. Route.
      const signals: Signals = { ...item.signals, sourceCount: 1 };
      const decision = decideRoute({
        settings, scores: intake.scores, extracted, site,
        trustedSource: !!source?.trusted, sourceCount: 1,
        sensitiveCategory: !!(cat?.sensitive || parent?.sensitive),
        duplicate: !!dup,
      });

      const fields = {
        name: extracted.name, aliases: extracted.aliases, url: site.finalUrl,
        taglineEn: extracted.taglineEn, taglineZh: extracted.taglineZh,
        descriptionEn: extracted.descriptionEn, descriptionZh: extracted.descriptionZh,
        featuresEn: extracted.featuresEn, featuresZh: extracted.featuresZh,
        useCasesEn: extracted.useCasesEn, useCasesZh: extracted.useCasesZh,
        pricingType: extracted.pricingType, pricingNoteEn: extracted.pricingNoteEn, pricingNoteZh: extracted.pricingNoteZh,
        platforms: extracted.platforms, openSource: extracted.openSource, hasCnUi: extracted.hasCnUi, hasEnterprise: extracted.hasEnterprise,
        company: extracted.company, originCountry: extracted.originCountry, maturity: intake.scores.maturity,
        iconSourceUrl: site.iconUrl, imageSourceUrl: site.ogImage,
      };
      const tool = await createTool({
        fields,
        primaryCategory: extracted.primaryCategory,
        secondaryCategories: extracted.secondaryCategories,
        status: decision.auto ? "listed" : "draft",
        signals,
        embedding: vec,
      });

      await db.insert(jevJudgments).values(
        Object.entries(intake.answers).map(([question, probabilities]) => ({ kind: "intake", toolId: tool.id, rawItemId: item.id, question, probabilities, judge: intake.judge })),
      );

      if (decision.auto) {
        published++;
        ctx.inc("auto_published");
      } else {
        const payload: ReviewPayload = {
          fields: { ...fields, primaryCategory: extracted.primaryCategory, secondaryCategories: extracted.secondaryCategories },
          site: { finalUrl: site.finalUrl, title: site.title, description: site.description, httpStatus: site.status, excerpt: site.text.slice(0, 1500) },
          jev: { ...intake.scores, extractConfidence: extracted.confidence.overall },
          categorySlugs: [extracted.primaryCategory, ...extracted.secondaryCategories],
          duplicateOf: dup ? { toolId: dup.toolId, slug: dup.slug, similarity: Math.round(dup.similarity * 100) / 100 } : undefined,
          sourceKeys: source ? [source.key] : [],
        };
        await db.insert(reviewTasks).values({
          type: dup ? "duplicate" : "new_tool",
          toolId: tool.id,
          rawItemId: item.id,
          payload,
          confidence: decision.confidence,
          reasons: decision.reasons,
        });
        ctx.inc("queued_for_review");
      }
      await markRaw(item.id, { status: "processed", matchedToolId: tool.id });
    } catch (e) {
      ctx.inc("errors");
      ctx.log(`raw #${item.id} ${item.url}: ${(e as Error).message}`);
      await markRaw(item.id, { status: "error", error: (e as Error).message.slice(0, 500) });
    }
  }
  if (published) await revalidateSite();
}
