import { and, desc, eq, gte, inArray, sql as dsql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, categoryRankings, searchLog, toolCategories, tools, type Category, type Tool } from "@/db/schema";
import { memo } from "./cache";
import type { Locale } from "./i18n";

/** What a list/card needs — keeps cache entries small and serialisable. */
export type ToolCard = Pick<
  Tool,
  "id" | "slug" | "name" | "logoUrl" | "taglineZh" | "taglineEn" | "pricingType" | "cnAccess" | "openSource" | "hasCnUi" | "originCountry"
> & { listedAt: string | null };

const cardColumns = {
  id: tools.id,
  slug: tools.slug,
  name: tools.name,
  logoUrl: tools.logoUrl,
  taglineZh: tools.taglineZh,
  taglineEn: tools.taglineEn,
  pricingType: tools.pricingType,
  cnAccess: tools.cnAccess,
  openSource: tools.openSource,
  hasCnUi: tools.hasCnUi,
  originCountry: tools.originCountry,
  listedAt: tools.listedAt,
};

function toCard(r: { listedAt: Date | null } & Omit<ToolCard, "listedAt">): ToolCard {
  return { ...r, listedAt: r.listedAt ? r.listedAt.toISOString() : null };
}

const listed = eq(tools.status, "listed");
const rankCol = (locale: Locale) => (locale === "zh" ? tools.rankScoreZh : tools.rankScoreEn);

export type CategoryNode = Category & { children: Category[]; toolCount: number };

export function getCategoryTree(): Promise<CategoryNode[]> {
  return memo("cat:tree", async () => {
    const rows = await db.select().from(categories).orderBy(categories.sort, categories.id);
    const counts = await db
      .select({ categoryId: toolCategories.categoryId, n: dsql<number>`count(*)::int` })
      .from(toolCategories)
      .innerJoin(tools, eq(tools.id, toolCategories.toolId))
      .where(listed)
      .groupBy(toolCategories.categoryId);
    const countMap = new Map(counts.map((c) => [c.categoryId, c.n]));
    const tops = rows.filter((r) => !r.parentId);
    return tops.map((top) => ({
      ...top,
      children: rows.filter((r) => r.parentId === top.id),
      toolCount: countMap.get(top.id) ?? 0,
    }));
  });
}

export function getHomeData(locale: Locale) {
  return memo(`home:${locale}`, async () => {
    const dayAgo = new Date(Date.now() - 24 * 3600_000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);
    let fresh = await db.select(cardColumns).from(tools).where(and(listed, gte(tools.listedAt, dayAgo))).orderBy(desc(tools.listedAt)).limit(10);
    const freshIsToday = fresh.length > 0;
    if (!freshIsToday) {
      fresh = await db.select(cardColumns).from(tools).where(and(listed, gte(tools.listedAt, weekAgo))).orderBy(desc(tools.listedAt)).limit(10);
    }
    const hot = await db.select(cardColumns).from(tools).where(listed).orderBy(desc(tools.heatScore)).limit(8);

    const tree = await getCategoryTree();
    const topIds = tree.map((c) => c.id);
    // Top 8 per top-level category in one query.
    const ranked = await db.execute<{ category_id: number; id: number }>(dsql`
      select category_id, id from (
        select tc.category_id, t.id,
               row_number() over (partition by tc.category_id order by t.pinned desc, ${dsql.raw(locale === "zh" ? "t.rank_score_zh" : "t.rank_score_en")} desc, t.id) as rn
        from tool_categories tc join tools t on t.id = tc.tool_id
        where t.status = 'listed' and tc.category_id in ${topIds.length ? dsql`(${dsql.join(topIds.map((i) => dsql`${i}`), dsql`, `)})` : dsql`(null)`}
      ) x where rn <= 8`);
    const ids = [...new Set(ranked.map((r) => r.id))];
    const cards = ids.length ? await db.select(cardColumns).from(tools).where(inArray(tools.id, ids)) : [];
    const byId = new Map(cards.map((c) => [c.id, toCard(c)]));
    const perCategory: Record<number, ToolCard[]> = {};
    for (const r of ranked) (perCategory[r.category_id] ??= []).push(byId.get(r.id)!);

    return { fresh: fresh.map(toCard), freshIsToday, hot: hot.map(toCard), perCategory };
  });
}

export type ToolFilters = {
  sub?: string;
  pricing?: string;
  access?: string;
  platform?: string;
  openSource?: boolean;
  cnUi?: boolean;
  sort?: "rank" | "new" | "heat";
};

const PRICING = ["free", "freemium", "paid", "unknown"] as const;
const ACCESS = ["direct", "unstable", "blocked", "unknown"] as const;

function filterConds(f: ToolFilters): SQL[] {
  const conds: SQL[] = [listed];
  if (f.pricing && (PRICING as readonly string[]).includes(f.pricing)) conds.push(eq(tools.pricingType, f.pricing as (typeof PRICING)[number]));
  if (f.access && (ACCESS as readonly string[]).includes(f.access)) conds.push(eq(tools.cnAccess, f.access as (typeof ACCESS)[number]));
  if (f.platform && /^[a-z]+$/.test(f.platform)) conds.push(dsql`${f.platform} = any(${tools.platforms})`);
  if (f.openSource) conds.push(eq(tools.openSource, true));
  if (f.cnUi) conds.push(eq(tools.hasCnUi, true));
  return conds;
}

function orderFor(locale: Locale, sort: ToolFilters["sort"]) {
  if (sort === "new") return [desc(tools.listedAt), desc(tools.id)];
  if (sort === "heat") return [desc(tools.heatScore), desc(tools.id)];
  return [desc(tools.pinned), desc(rankCol(locale)), desc(tools.id)];
}

export function getCategoryPage(slug: string, locale: Locale, f: ToolFilters) {
  return memo(`cat:${slug}:${locale}:${JSON.stringify(f)}`, async () => {
    const tree = await getCategoryTree();
    const top = tree.find((c) => c.slug === slug);
    if (!top) return null;
    const sub = f.sub ? top.children.find((c) => c.slug === f.sub) : undefined;
    const catId = sub?.id ?? top.id;
    const rows = await db
      .select(cardColumns)
      .from(tools)
      .innerJoin(toolCategories, and(eq(toolCategories.toolId, tools.id), eq(toolCategories.categoryId, catId)))
      .where(and(...filterConds(f)))
      .orderBy(...orderFor(locale, f.sort))
      .limit(300);
    const [ranking] = await db
      .select()
      .from(categoryRankings)
      .where(and(eq(categoryRankings.categoryId, catId), eq(categoryRankings.locale, locale)));
    return {
      category: top,
      sub: sub ?? null,
      tools: rows.map(toCard),
      tieAtTop: ranking?.tieAtTop ?? false,
    };
  });
}

export function getToolPage(slug: string, locale: Locale) {
  return memo(`tool:${slug}:${locale}`, async () => {
    const [tool] = await db.select().from(tools).where(eq(tools.slug, slug));
    if (!tool) return null;
    if (tool.mergedIntoId) {
      const [target] = await db.select({ slug: tools.slug }).from(tools).where(eq(tools.id, tool.mergedIntoId));
      return { redirectTo: target?.slug ?? null } as const;
    }
    if (tool.status === "draft" || tool.status === "rejected") return null;

    const cats = await db
      .select({ c: categories, isPrimary: toolCategories.isPrimary })
      .from(toolCategories)
      .innerJoin(categories, eq(categories.id, toolCategories.categoryId))
      .where(eq(toolCategories.toolId, tool.id));
    const primary = cats.find((c) => c.isPrimary)?.c ?? cats[0]?.c ?? null;
    const parent = primary?.parentId ? (await db.select().from(categories).where(eq(categories.id, primary.parentId)))[0] : null;

    let similar: ToolCard[] = [];
    let rank: number | null = null;
    let tieAtTop = false;
    if (primary) {
      const peers = await db
        .select({ ...cardColumns, score: rankCol(locale) })
        .from(tools)
        .innerJoin(toolCategories, and(eq(toolCategories.toolId, tools.id), eq(toolCategories.categoryId, primary.id)))
        .where(listed)
        .orderBy(desc(rankCol(locale)), desc(tools.id))
        .limit(200);
      const idx = peers.findIndex((p) => p.id === tool.id);
      rank = idx >= 0 && peers.length >= 3 ? idx + 1 : null;
      similar = peers.filter((p) => p.id !== tool.id).slice(0, 8).map(({ score: _s, ...p }) => toCard(p));
      // A thin sub-category (e.g. "AI IDE" with 2 tools) borrows from its parent category.
      if (similar.length < 5 && parent) {
        const seen = new Set([tool.id, ...similar.map((s) => s.id)]);
        const wider = await db
          .select(cardColumns)
          .from(tools)
          .innerJoin(toolCategories, and(eq(toolCategories.toolId, tools.id), eq(toolCategories.categoryId, parent.id)))
          .where(listed)
          .orderBy(desc(rankCol(locale)), desc(tools.id))
          .limit(20);
        similar = [...similar, ...wider.filter((w) => !seen.has(w.id)).map(toCard)].slice(0, 8);
      }
      const [r] = await db.select().from(categoryRankings).where(and(eq(categoryRankings.categoryId, primary.id), eq(categoryRankings.locale, locale)));
      tieAtTop = !!r?.tieAtTop && (rank === 1 || rank === 2);
    }
    const { embedding: _e, searchText: _s, ...pub } = tool;
    return {
      redirectTo: undefined,
      tool: {
        ...pub,
        listedAt: tool.listedAt?.toISOString() ?? null,
        lastCheckedAt: tool.lastCheckedAt?.toISOString() ?? null,
        launchedAt: tool.launchedAt?.toISOString() ?? null,
        createdAt: tool.createdAt.toISOString(),
        updatedAt: tool.updatedAt.toISOString(),
      },
      primary,
      parent: parent ?? null,
      similar,
      rank,
      tieAtTop,
    };
  });
}

export function getNewTools(page: number) {
  return memo(`new:${page}`, async () => {
    const rows = await db.select(cardColumns).from(tools).where(listed).orderBy(desc(tools.listedAt), desc(tools.id)).limit(60).offset(page * 60);
    return rows.map(toCard);
  });
}

export function getTrending() {
  return memo("trending", async () => {
    const rows = await db.select(cardColumns).from(tools).where(listed).orderBy(desc(tools.heatScore), desc(tools.id)).limit(50);
    return rows.map(toCard);
  });
}

export function getChinaTools(locale: Locale) {
  return memo(`china:${locale}`, async () => {
    const rows = await db
      .select({ ...cardColumns, globalUrl: tools.globalUrl })
      .from(tools)
      .where(and(listed, eq(tools.originCountry, "CN")))
      .orderBy(desc(rankCol(locale)), desc(tools.id))
      .limit(300);
    return rows.map((r) => ({ ...toCard(r), globalUrl: r.globalUrl }));
  });
}

/** Trigram + substring search over names, aliases, pinyin and taglines. */
export async function searchTools(q: string, locale: Locale): Promise<ToolCard[]> {
  const query = q.trim().toLowerCase().slice(0, 64);
  if (!query) return [];
  const res = await memo(`search:${locale}:${query}`, async () => {
    const esc = (s: string) => `%${s.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const like = esc(query);
    // Every word must match the tool's text or one of its category names ("视频 生成", "pdf translate").
    const tokens = query.split(/\s+/).filter(Boolean).slice(0, 6);
    const tokenConds = tokens.map((tok) => {
      const l = esc(tok);
      return dsql`(${tools.searchText} ilike ${l} or ${tools.descriptionZh} ilike ${l} or ${tools.descriptionEn} ilike ${l}
        or exists (select 1 from tool_categories tc join categories c on c.id = tc.category_id
                   where tc.tool_id = ${tools.id} and (c.name_zh ilike ${l} or c.name_en ilike ${l})))`;
    });
    const rows = await db
      .select({ ...cardColumns, sim: dsql<number>`similarity(${tools.searchText}, ${query})` })
      .from(tools)
      .where(and(listed, dsql`((${and(...tokenConds)}) or ${tools.searchText} % ${query})`))
      .orderBy(
        dsql`(lower(${tools.name}) = ${query}) desc`,
        dsql`(${tools.searchText} ilike ${like}) desc`,
        desc(dsql`similarity(${tools.searchText}, ${query})`),
        desc(rankCol(locale)),
      )
      .limit(60);
    return rows.map(({ sim: _s, ...r }) => toCard(r));
  }, 60_000);
  // Log for the "searches with no results" report. Fire and forget.
  db.insert(searchLog).values({ query, locale, results: res.length }).catch(() => {});
  return res;
}

export function getSitemapRows() {
  return memo("sitemap", async () => {
    const t = await db.select({ slug: tools.slug, updatedAt: tools.updatedAt }).from(tools).where(listed);
    const c = await db.select({ slug: categories.slug, parentId: categories.parentId }).from(categories);
    return { tools: t.map((x) => ({ slug: x.slug, updatedAt: x.updatedAt.toISOString() })), categories: c.filter((x) => !x.parentId).map((x) => x.slug) };
  }, 600_000);
}
