import { and, eq, gte, sql as dsql } from "drizzle-orm";
import { db } from "@/db/client";
import { dailyStats, tools, type Signals } from "@/db/schema";
import { revalidateSite } from "@/lib/revalidate";
import { getSettings, type AppSettings } from "@/lib/settings";
import type { JobContext } from "../runner";

export type ScoreInput = {
  id: number;
  clicks7: number;
  views7: number;
  signals: Signals;
  listedAt: Date | null;
  aiScoreZh: number | null;
  aiScoreEn: number | null;
};

export function externalRaw(s: Signals) {
  const stars = s.githubStarsDelta ?? (s.githubStars ? s.githubStars * 0.1 : 0);
  return Math.log1p(s.productHuntVotes ?? 0) + Math.log1p(stars) + Math.log1p(s.hfLikes ?? 0) + 0.5 * Math.log1p(Math.max(0, (s.sourceCount ?? 1) - 1));
}

/** Pure scoring so it can be unit-tested. Every component is normalised to 0–1 across the catalogue. */
export function computeScores(rows: ScoreInput[], settings: Pick<AppSettings, "weights" | "heatWeights">, now = Date.now()) {
  const max = (xs: number[]) => Math.max(1e-9, ...xs);
  const c = rows.map((r) => Math.log1p(r.clicks7));
  const v = rows.map((r) => Math.log1p(r.views7));
  const e = rows.map((r) => externalRaw(r.signals));
  const [cMax, vMax, eMax] = [max(c), max(v), max(e)];
  const hw = settings.heatWeights;
  const w = settings.weights;
  return rows.map((r, i) => {
    const clicks = c[i] / cMax;
    const views = v[i] / vMax;
    const external = e[i] / eMax;
    const ageDays = r.listedAt ? (now - r.listedAt.getTime()) / 86400_000 : 365;
    const freshness = Math.exp(-ageDays / 30);
    const heat = hw.clicks * clicks + hw.views * views + hw.external * external + hw.freshness * freshness;
    const behavior = (2 * clicks + views) / 3;
    const rank = (ai: number | null) => w.ai * (ai ?? 0.5) + w.behavior * behavior + w.external * external + w.freshness * freshness;
    return { id: r.id, heat, rankZh: rank(r.aiScoreZh), rankEn: rank(r.aiScoreEn) };
  });
}

/** Daily: heat score + composite ranking score for every listed tool (PRD §8). */
export async function scores(ctx: JobContext) {
  const settings = await getSettings();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const stats = await db
    .select({ toolId: dailyStats.toolId, clicks: dsql<number>`sum(${dailyStats.clicks})::int`, views: dsql<number>`sum(${dailyStats.views})::int` })
    .from(dailyStats)
    .where(gte(dailyStats.day, since))
    .groupBy(dailyStats.toolId);
  const statMap = new Map(stats.map((s) => [s.toolId, s]));
  const rows = await db
    .select({ id: tools.id, signals: tools.signals, listedAt: tools.listedAt, aiScoreZh: tools.aiScoreZh, aiScoreEn: tools.aiScoreEn })
    .from(tools)
    .where(and(eq(tools.status, "listed")));
  const result = computeScores(
    rows.map((r) => ({ ...r, clicks7: statMap.get(r.id)?.clicks ?? 0, views7: statMap.get(r.id)?.views ?? 0 })),
    settings,
  );
  for (const r of result) {
    await db.update(tools).set({ heatScore: r.heat, rankScoreZh: r.rankZh, rankScoreEn: r.rankEn }).where(eq(tools.id, r.id));
  }
  ctx.inc("scored", result.length);
  await revalidateSite();
}
