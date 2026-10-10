import { sql as dsql } from "drizzle-orm";
import { db } from "@/db/client";
import { dailyStats } from "@/db/schema";

const today = () => new Date().toISOString().slice(0, 10);

export async function bumpStat(toolId: number, kind: "views" | "clicks") {
  await db
    .insert(dailyStats)
    .values({ toolId, day: today(), views: kind === "views" ? 1 : 0, clicks: kind === "clicks" ? 1 : 0 })
    .onConflictDoUpdate({
      target: [dailyStats.toolId, dailyStats.day],
      set: kind === "views" ? { views: dsql`${dailyStats.views} + 1` } : { clicks: dsql`${dailyStats.clicks} + 1` },
    });
}

/** Very small bot filter so crawlers don't inflate heat. */
export function looksLikeBot(ua: string | null) {
  return !ua || /bot|crawl|spider|slurp|preview|monitor|curl|wget|python|httpclient|headless/i.test(ua);
}
