import { and, eq, sql as dsql } from "drizzle-orm";
import { db } from "@/db/client";
import { rawItems, reviewTasks, sources } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { normalizeUrl } from "@/lib/url";
import { sha256 } from "../http";
import { plugins } from "../sources";
import type { JobContext } from "../runner";

/** Pull candidates from every enabled source into raw_items (deduped by hash). */
export async function collect(ctx: JobContext) {
  const settings = await getSettings();
  const [{ pending }] = await db.select({ pending: dsql<number>`count(*)::int` }).from(reviewTasks).where(eq(reviewTasks.status, "pending"));
  const backlogged = pending >= settings.reviewBacklogLimit;
  if (backlogged) ctx.log(`review backlog ${pending} ≥ ${settings.reviewBacklogLimit}: only trusted sources run`);

  const only = typeof ctx.args.source === "string" ? ctx.args.source : null;
  const list = await db.select().from(sources).where(only ? eq(sources.key, only) : eq(sources.enabled, true));
  for (const source of list) {
    if (backlogged && !source.trusted) continue;
    const plugin = plugins[source.type];
    if (!plugin) {
      ctx.log(`no plugin for type ${source.type}`);
      continue;
    }
    try {
      const candidates = await plugin(source, { log: (m) => ctx.log(`[${source.key}] ${m}`) });
      let added = 0;
      for (const c of candidates) {
        let url: string;
        try {
          url = normalizeUrl(c.url);
        } catch {
          continue;
        }
        const hash = sha256(`${source.id}|${c.externalId ?? url}`);
        const res = await db
          .insert(rawItems)
          .values({ sourceId: source.id, externalId: c.externalId, url, title: c.title.slice(0, 200), rawText: (c.text ?? "").slice(0, 5000), signals: c.signals ?? {}, hash })
          .onConflictDoNothing({ target: rawItems.hash })
          .returning({ id: rawItems.id });
        if (res.length) added++;
      }
      ctx.inc("candidates", candidates.length);
      ctx.inc("new_raw_items", added);
      ctx.log(`[${source.key}] ${candidates.length} candidates, ${added} new`);
      await db.update(sources).set({ lastRunAt: new Date(), lastError: null }).where(eq(sources.id, source.id));
    } catch (e) {
      ctx.inc("source_errors");
      ctx.log(`[${source.key}] error: ${(e as Error).message}`);
      await db.update(sources).set({ lastRunAt: new Date(), lastError: (e as Error).message.slice(0, 500) }).where(and(eq(sources.id, source.id)));
    }
  }
}
