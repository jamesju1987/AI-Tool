import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, categoryRankings, jevJudgments, toolCategories, tools, type Category } from "@/db/schema";
import type { Locale } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { getJudge, type Question } from "../jev";
import { blend, bradleyTerry, initialPairs, refinePairs, tieAtTop, toPBest, type Comparison } from "../pairwise";
import type { JobContext } from "../runner";
import { externalRaw } from "./scores";

/** PRD §8 layer 2: three questions, "useful" counts double. Phrased per audience. */
export function rankQuestions(locale: Locale, task: string) {
  return locale === "zh"
    ? [
        { id: "useful", weight: 2, text: `对于在中国大陆、使用中文的用户，完成“${task}”这类任务时，哪个工具更有用？` },
        { id: "easy", weight: 1, text: "哪个工具对中文新手更容易上手？" },
        { id: "access", weight: 1, text: "哪个工具在中国大陆访问和付费更方便？" },
      ]
    : [
        { id: "useful", weight: 2, text: `For someone who needs to do "${task}", which tool is more useful?` },
        { id: "easy", weight: 1, text: "Which tool is easier for a newcomer to start using?" },
        { id: "access", weight: 1, text: "Which tool is easier to sign up for and pay for from most countries?" },
      ];
}

type Item = { id: number; name: string; desc: string; signal: number };

/** Weekly: rank tools within each category by pairwise Jev judgments, per locale. */
export async function rank(ctx: JobContext) {
  const settings = await getSettings();
  const cats = await db.select().from(categories);
  const onlyCat = typeof ctx.args.category === "string" ? ctx.args.category : null;
  const locales: Locale[] = ctx.args.locale === "zh" || ctx.args.locale === "en" ? [ctx.args.locale] : ["zh", "en"];
  const byId = new Map(cats.map((c) => [c.id, c]));
  const scoresByTool: Record<Locale, Map<number, number>> = { zh: new Map(), en: new Map() };

  for (const cat of cats) {
    if (onlyCat && cat.slug !== onlyCat) continue;
    // Tools whose PRIMARY category is this one: each tool is ranked exactly once per locale.
    const members = await db
      .select({ id: tools.id, name: tools.name, taglineEn: tools.taglineEn, taglineZh: tools.taglineZh, descriptionEn: tools.descriptionEn, descriptionZh: tools.descriptionZh, pricingType: tools.pricingType, cnAccess: tools.cnAccess, signals: tools.signals, platforms: tools.platforms })
      .from(tools)
      .innerJoin(toolCategories, and(eq(toolCategories.toolId, tools.id), eq(toolCategories.categoryId, cat.id), eq(toolCategories.isPrimary, true)))
      .where(eq(tools.status, "listed"))
      .orderBy(desc(tools.rankScoreZh))
      .limit(settings.pairwise.maxItemsPerCategory);
    if (members.length < 2) continue;

    for (const locale of locales) {
      const items: Item[] = members.map((m) => ({
        id: m.id,
        name: m.name,
        desc: [locale === "zh" ? m.taglineZh || m.taglineEn : m.taglineEn || m.taglineZh, locale === "zh" ? m.descriptionZh || m.descriptionEn : m.descriptionEn || m.descriptionZh, `pricing: ${m.pricingType}`, `mainland China access: ${m.cnAccess}`, `platforms: ${m.platforms.join(", ")}`].filter(Boolean).join(" | "),
        signal: externalRaw(m.signals),
      }));
      const res = await rankCategory(cat, locale, items, settings.pairwise.budgetPerItem, ctx);
      for (const [toolId, score] of res) scoresByTool[locale].set(toolId, score);
    }
  }

  for (const locale of locales) {
    for (const [toolId, score] of scoresByTool[locale]) {
      await db.update(tools).set(locale === "zh" ? { aiScoreZh: score } : { aiScoreEn: score }).where(eq(tools.id, toolId));
    }
  }
  ctx.log(`ranked ${scoresByTool.zh.size + scoresByTool.en.size} tool/locale pairs across ${byId.size} categories`);
}

async function rankCategory(cat: Category, locale: Locale, items: Item[], budgetPerItem: number, ctx: JobContext) {
  const n = items.length;
  const task = locale === "zh" ? cat.nameZh : cat.nameEn;
  const questions = rankQuestions(locale, task);
  const keyOf = (i: number) => `T${i + 1}`;
  const state = { objective: locale === "zh" ? `比较“${task}”类 AI 工具` : `Compare AI tools for ${task}`, items: Object.fromEntries(items.map((it, i) => [keyOf(i), `${it.name}: ${it.desc}`])) };

  // Offline judge: prefer tools with stronger outside signals (keeps the pipeline testable).
  const judge = getJudge((key) => {
    const m = key.match(/:(\d+):(\d+):/);
    if (!m) return 0.5;
    const a = items[Number(m[1])], b = items[Number(m[2])];
    return 1 / (1 + Math.exp(-(a.signal - b.signal)));
  }, (msg) => ctx.log(msg));

  const budget = Math.min((n * (n - 1)) / 2, budgetPerItem * n);
  const asked = new Set<string>();
  const comps: Record<string, Comparison[]> = Object.fromEntries(questions.map((q) => [q.id, []]));
  const rows: (typeof jevJudgments.$inferInsert)[] = [];

  const askRound = async (pairs: [number, number][]) => {
    const qs: Record<string, Question> = {};
    for (const [a, b] of pairs) {
      asked.add(a < b ? `${a}-${b}` : `${b}-${a}`);
      for (const q of questions) {
        // Both orders, so position bias cancels: P = (q(a,b) + 1 − q(b,a)) / 2
        qs[`${q.id}:${a}:${b}:ab`] = { instructions: q.text, criteria: { A: `items.${keyOf(a)}`, B: `items.${keyOf(b)}` } };
        qs[`${q.id}:${b}:${a}:ba`] = { instructions: q.text, criteria: { A: `items.${keyOf(b)}`, B: `items.${keyOf(a)}` } };
      }
    }
    const ans = await judge.decide(state, qs);
    for (const [a, b] of pairs) {
      for (const q of questions) {
        const ab = ans[`${q.id}:${a}:${b}:ab`]?.A ?? 0.5;
        const ba = ans[`${q.id}:${b}:${a}:ba`]?.A ?? 0.5;
        comps[q.id].push({ i: a, j: b, p: (ab + (1 - ba)) / 2 });
        rows.push({ kind: "pair", toolId: items[a].id, otherToolId: items[b].id, categoryId: cat.id, locale, question: q.id, probabilities: { ab, ba }, judge: judge.name });
      }
    }
  };

  const fit = () => {
    const per = questions.map((q) => ({ weight: q.weight, pBest: toPBest(bradleyTerry(n, comps[q.id])) }));
    return blend(per);
  };

  await askRound(initialPairs(n, Math.min(4, budgetPerItem), cat.id).slice(0, budget));
  let pBest = fit();
  while (asked.size < budget) {
    const order = pBest.map((p, i) => [p, i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
    const next = refinePairs(order, asked, Math.min(n, budget - asked.size));
    if (!next.length) break;
    await askRound(next);
    pBest = fit();
  }

  if (rows.length) {
    for (let i = 0; i < rows.length; i += 500) await db.insert(jevJudgments).values(rows.slice(i, i + 500));
  }
  const max = Math.max(...pBest);
  const order = pBest.map((p, i) => [p, i] as const).sort((a, b) => b[0] - a[0]);
  await db
    .insert(categoryRankings)
    .values({
      categoryId: cat.id, locale,
      toolIds: order.map(([, i]) => items[i].id),
      pBest: Object.fromEntries(order.map(([p, i]) => [String(items[i].id), Math.round(p * 1e4) / 1e4])),
      tieAtTop: tieAtTop(pBest), judgments: rows.length,
    })
    .onConflictDoUpdate({
      target: [categoryRankings.categoryId, categoryRankings.locale],
      set: { toolIds: order.map(([, i]) => items[i].id), pBest: Object.fromEntries(order.map(([p, i]) => [String(items[i].id), Math.round(p * 1e4) / 1e4])), tieAtTop: tieAtTop(pBest), judgments: rows.length, computedAt: new Date() },
    });
  ctx.inc("pair_judgments", rows.length);
  ctx.log(`${cat.slug}/${locale}: ${n} tools, ${asked.size} pairs, top = ${items[order[0][1]].name}${tieAtTop(pBest) ? " (tie)" : ""}`);
  // Score in [0,1] relative to the category leader.
  return new Map(items.map((it, i) => [it.id, pBest[i] / max]));
}

