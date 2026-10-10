import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, sql } from "@/db/client";
import { categories, sources, toolCategories, tools } from "@/db/schema";
import { seedCategories } from "@/db/seed-categories";
import { seedTools } from "@/db/seed-tools";
import { buildSearchText, siteKey } from "@/lib/url";

/** Default data sources. API sources are "trusted"; scraping sources start disabled. */
const defaultSources = [
  { key: "producthunt", name: "Product Hunt", type: "producthunt", trusted: true, enabled: true,
    config: { topic: "artificial-intelligence", limit: 40 } },
  { key: "github", name: "GitHub 新项目", type: "github", trusted: true, enabled: true,
    config: { topics: ["llm", "ai-agent", "generative-ai", "ai-tools"], minStars: 100, days: 14, limit: 30 } },
  { key: "huggingface", name: "Hugging Face Spaces 热门", type: "huggingface", trusted: true, enabled: false,
    config: { sort: "trendingScore", limit: 30 } },
  { key: "showhn", name: "Hacker News · Show HN", type: "rss", trusted: false, enabled: true,
    config: { url: "https://hnrss.org/show?q=AI&points=30", mode: "link" } },
  { key: "manual", name: "人工添加 / 投稿", type: "manual", trusted: true, enabled: true, config: {} },
];

async function main() {
  // Categories (idempotent upsert by slug)
  let order = 0;
  for (const c of seedCategories) {
    const [parent] = await db
      .insert(categories)
      .values({ slug: c.slug, nameZh: c.zh, nameEn: c.en, descriptionZh: c.descZh, descriptionEn: c.descEn, sort: order++, sensitive: !!c.sensitive })
      .onConflictDoUpdate({ target: categories.slug, set: { nameZh: c.zh, nameEn: c.en, descriptionZh: c.descZh, descriptionEn: c.descEn } })
      .returning();
    let sub = 0;
    for (const ch of c.children ?? []) {
      await db
        .insert(categories)
        .values({ slug: ch.slug, nameZh: ch.zh, nameEn: ch.en, parentId: parent.id, sort: sub++ })
        .onConflictDoUpdate({ target: categories.slug, set: { nameZh: ch.zh, nameEn: ch.en, parentId: parent.id } });
    }
  }

  for (const s of defaultSources) {
    await db.insert(sources).values(s).onConflictDoNothing({ target: sources.key });
  }

  const catRows = await db.select().from(categories);
  const bySlug = new Map(catRows.map((c) => [c.slug, c]));
  const now = Date.now();

  let inserted = 0;
  for (const [i, t] of seedTools.entries()) {
    const exists = await db.select({ id: tools.id }).from(tools).where(eq(tools.slug, t.slug));
    if (exists.length) continue;
    const listedAt = new Date(now - i * 7 * 3600_000); // spread over the past days so "new" has content
    const [row] = await db
      .insert(tools)
      .values({
        slug: t.slug, name: t.name, url: t.url, globalUrl: t.globalUrl, domain: siteKey(t.url),
        taglineZh: t.tagZh, taglineEn: t.tagEn, descriptionZh: t.descZh, descriptionEn: t.descEn,
        featuresZh: t.featZh, featuresEn: t.featEn, pricingType: t.pricing, cnAccess: t.cn,
        platforms: t.platforms, openSource: !!t.openSource, hasCnUi: !!t.cnUi, hasEnterprise: !!t.enterprise,
        company: t.company, originCountry: t.origin, status: "listed", listedAt,
        // Logos are downloaded by the "logos" job and served from our own domain
        // (third-party favicon services are often unreachable from mainland China).
        logoUrl: null,
        searchText: buildSearchText({ name: t.name, taglineZh: t.tagZh, taglineEn: t.tagEn }),
        heatScore: Math.max(0, 1 - i / seedTools.length),
        rankScoreZh: Math.max(0, 1 - i / seedTools.length),
        rankScoreEn: Math.max(0, 1 - i / seedTools.length),
      })
      .returning({ id: tools.id });
    const cat = bySlug.get(t.cat);
    if (!cat) throw new Error(`unknown category ${t.cat} for ${t.slug}`);
    await db.insert(toolCategories).values({ toolId: row.id, categoryId: cat.id, isPrimary: true });
    if (cat.parentId) await db.insert(toolCategories).values({ toolId: row.id, categoryId: cat.parentId, isPrimary: false });
    inserted++;
  }
  console.log(`seeded ${catRows.length} categories, ${inserted} tools, ${defaultSources.length} sources`);
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
