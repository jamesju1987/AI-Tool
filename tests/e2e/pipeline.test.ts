import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, sql } from "@/db/client";
import { categoryRankings, jevJudgments, rawItems, reviewTasks, sources, tools } from "@/db/schema";
import { setSetting, DEFAULT_SETTINGS } from "@/lib/settings";
import { siteKey } from "@/lib/url";
import { JOBS } from "@/pipeline/jobs";
import { runJob } from "@/pipeline/runner";
import { startFixtures, type Fixture } from "../fixtures/server";

let fx: Fixture;

async function run(name: keyof typeof JOBS, args: Record<string, unknown> = {}) {
  const res = await runJob(name, JOBS[name].fn, { args, trigger: "test" });
  if (!res.ok) throw new Error(res.error);
  return res.stats;
}

beforeAll(async () => {
  fx = await startFixtures();
  // Point a feed source at the fixture feed, switch the real network sources off.
  await db.update(sources).set({ enabled: false });
  await db.insert(sources).values({ key: "fixture", name: "Fixture feed", type: "rss", trusted: false, enabled: true, rateLimitMs: 0, config: { url: fx.feedUrl, mode: "link" } });
});

afterAll(async () => {
  await fx.close();
  await sql.end();
});

describe("intake pipeline (mock AI)", () => {
  it("collects feed items into raw_items without duplicates", async () => {
    const s1 = await run("collect");
    expect(s1.new_raw_items).toBe(5);
    const s2 = await run("collect");
    expect(s2.new_raw_items ?? 0).toBe(0);
  });

  it("processes raw items: reviews real tools, rejects non-tools, skips dead and robots-blocked sites", async () => {
    const stats = await run("process");
    expect(stats.queued_for_review).toBe(2); // vidgen + inject
    expect(stats.not_a_tool).toBe(1); // blog
    expect(stats.dead_links).toBe(1);
    expect(stats.blocked).toBe(1); // robots.txt disallow

    const vid = (await db.select().from(tools).where(eq(tools.domain, siteKey(fx.urls.vidgen))))[0];
    expect(vid.status).toBe("draft"); // autoPublish is off by default
    expect(vid.iconSourceUrl).toContain("/icon.png");
    expect(vid.pricingType).toBe("freemium");

    const blog = (await db.select().from(tools).where(eq(tools.domain, siteKey(fx.urls.blog))))[0];
    expect(blog.status).toBe("rejected");

    const tasks = await db.select().from(reviewTasks).where(eq(reviewTasks.status, "pending"));
    const injectTask = tasks.find((t) => t.payload.site?.finalUrl.startsWith(fx.urls.inject));
    expect(injectTask?.reasons.some((r) => r.includes("针对 AI 的指令"))).toBe(true);
    expect(await db.select().from(jevJudgments).where(eq(jevJudgments.toolId, vid.id))).toHaveLength(5);
  });

  it("re-seeing a known site only adds a signal", async () => {
    const [fixture] = await db.select().from(sources).where(eq(sources.key, "fixture"));
    await db.insert(rawItems).values({ sourceId: fixture.id, url: `${fx.urls.vidgen}/?utm_source=x`, title: "VidGenie", hash: "again-1", signals: { productHuntVotes: 120 } });
    const stats = await run("process");
    expect(stats.matched_existing).toBe(1);
    const vid = (await db.select().from(tools).where(eq(tools.domain, siteKey(fx.urls.vidgen))))[0];
    expect(vid.signals.productHuntVotes).toBe(120);
    expect(vid.signals.sourceCount).toBe(2);
  });

  it("keeps low-confidence drafts in review even with auto-publish on", async () => {
    await setSetting("autoPublish", true);
    await setSetting("thresholds", { ...DEFAULT_SETTINGS.thresholds, isTool: 0.5, neutral: 0.5, categoryFit: 0.5 });
    const [manual] = await db.select().from(sources).where(eq(sources.key, "manual")); // trusted
    // Mock extraction confidence is 0.4, so even with relaxed thresholds it must still go to review.
    await db.delete(tools).where(eq(tools.domain, siteKey(fx.urls.vidgen)));
    await db.insert(rawItems).values({ sourceId: manual.id, url: fx.urls.vidgen, title: "VidGenie", hash: "manual-vid" });
    const stats = await run("process");
    expect(stats.auto_published ?? 0).toBe(0);
    expect(stats.queued_for_review).toBe(1);
    await setSetting("autoPublish", false);
  });

  it("downloads logos to local media", async () => {
    const stats = await run("media");
    expect(stats.logos).toBeGreaterThanOrEqual(1);
    const vid = (await db.select().from(tools).where(eq(tools.domain, siteKey(fx.urls.vidgen))))[0];
    expect(vid.logoUrl).toMatch(/^\/media\/logos\/.+\.png$/);
  });
});

describe("patrol", () => {
  it("marks a listed tool suspect-offline after 3 failures and relists it when it recovers", async () => {
    const [vid] = await db.select().from(tools).where(eq(tools.domain, siteKey(fx.urls.vidgen)));
    await db.update(tools).set({ status: "listed", listedAt: new Date() }).where(eq(tools.id, vid.id));
    fx.setDown("vidgen", true);
    for (let i = 0; i < 3; i++) await run("patrol", { toolId: vid.id });
    let [row] = await db.select().from(tools).where(eq(tools.id, vid.id));
    expect(row.status).toBe("suspect_offline");
    const offline = await db.select().from(reviewTasks).where(and(eq(reviewTasks.toolId, vid.id), eq(reviewTasks.type, "suspect_offline")));
    expect(offline).toHaveLength(1);

    fx.setDown("vidgen", false);
    await run("patrol", { toolId: vid.id });
    [row] = await db.select().from(tools).where(eq(tools.id, vid.id));
    expect(row.status).toBe("listed");
    expect(row.consecutiveFailures).toBe(0);
  });
});

describe("ranking", () => {
  it("ranks each category pairwise and writes composite scores", async () => {
    await run("rank", { category: "chat-general" });
    const [r] = await db.select().from(categoryRankings).where(and(eq(categoryRankings.locale, "zh")));
    expect(r.toolIds.length).toBeGreaterThanOrEqual(5);
    expect(r.judgments).toBeGreaterThan(0);
    const ranked = await db.select({ ai: tools.aiScoreZh }).from(tools).where(inArray(tools.id, r.toolIds));
    expect(ranked.every((x) => x.ai !== null && x.ai > 0 && x.ai <= 1)).toBe(true);
    expect(Math.max(...ranked.map((x) => x.ai!))).toBeCloseTo(1, 5);

    const stats = await run("scores");
    expect(stats.scored).toBeGreaterThan(30);
  });
});
