import { and, desc, eq, inArray, isNull, lt, or, sql as dsql } from "drizzle-orm";
import { db } from "@/db/client";
import { reviewTasks, snapshots, tools, type Tool } from "@/db/schema";
import { env } from "@/lib/env";
import { revalidateSite } from "@/lib/revalidate";
import { extractTool } from "../extract";
import { FetchBlockedError } from "../http";
import { setStatus } from "../publish";
import type { JobContext } from "../runner";
import { checkUrls } from "../safety";
import { fetchSite } from "../site";
import { loadCategoryOptions } from "./process";

/** Structured fields worth an editor's attention when they change. */
const WATCHED = ["pricingType", "platforms", "openSource", "hasEnterprise", "hasCnUi"] as const;

const FAIL_LIMIT = 3;

async function hasPending(toolId: number, type: "suspect_offline" | "field_change") {
  const [r] = await db.select({ id: reviewTasks.id }).from(reviewTasks).where(and(eq(reviewTasks.toolId, toolId), eq(reviewTasks.type, type), eq(reviewTasks.status, "pending")));
  return !!r;
}

/** Weekly re-check of listed tools (popular ones every 3 days) — PRD §6 step 6. */
export async function patrol(ctx: JobContext) {
  const limit = Number(ctx.args.limit ?? 300);
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const threeDaysAgo = new Date(Date.now() - 3 * 86400_000);
  const [{ p90 }] = await db.select({ p90: dsql<number>`coalesce(percentile_cont(0.9) within group (order by ${tools.heatScore}), 0)` }).from(tools).where(eq(tools.status, "listed"));

  const due = ctx.args.toolId
    ? await db.select().from(tools).where(eq(tools.id, Number(ctx.args.toolId)))
    : await db
        .select()
        .from(tools)
        .where(and(
          inArray(tools.status, ["listed", "suspect_offline"]),
          or(isNull(tools.lastCheckedAt), lt(tools.lastCheckedAt, weekAgo), and(lt(tools.lastCheckedAt, threeDaysAgo), dsql`${tools.heatScore} >= ${p90}`)),
        ))
        .orderBy(dsql`${tools.lastCheckedAt} asc nulls first`)
        .limit(limit);
  ctx.log(`${due.length} tools due for a check`);
  const { options } = await loadCategoryOptions();
  let changedListing = false;

  for (const tool of due) {
    const [prev] = await db.select().from(snapshots).where(and(eq(snapshots.toolId, tool.id), eq(snapshots.ok, true))).orderBy(desc(snapshots.checkedAt)).limit(1);
    try {
      const site = await fetchSite(tool.url);
      if (!site.ok) throw new Error(`HTTP ${site.status}`);
      await db.insert(snapshots).values({ toolId: tool.id, httpStatus: site.status, ok: true, pageHash: site.pageHash, pricingHash: site.pricingHash });
      await db.update(tools).set({ lastCheckedAt: new Date(), consecutiveFailures: 0, iconSourceUrl: tool.iconSourceUrl ?? site.iconUrl, imageSourceUrl: tool.imageSourceUrl ?? site.ogImage }).where(eq(tools.id, tool.id));
      ctx.inc("ok");

      // Back from the dead: relist and close the pending offline task.
      if (tool.status === "suspect_offline") {
        await setStatus(tool.id, "listed");
        await db.update(reviewTasks).set({ status: "rejected", reviewer: "patrol", decidedAt: new Date() })
          .where(and(eq(reviewTasks.toolId, tool.id), eq(reviewTasks.type, "suspect_offline"), eq(reviewTasks.status, "pending")));
        changedListing = true;
        ctx.inc("recovered");
      }

      const pageChanged = prev && prev.pageHash !== site.pageHash;
      const pricingChanged = prev && site.pricingHash && prev.pricingHash && prev.pricingHash !== site.pricingHash;
      // Offline heuristics are too coarse to diff against an edited listing, so only with a real model.
      if (!env.mockAi && (pageChanged || pricingChanged) && !(await hasPending(tool.id, "field_change"))) {
        const fresh = await extractTool(site, { title: tool.name }, options);
        const diff = diffWatched(tool, fresh);
        if (Object.keys(diff.after).length) {
          await db.insert(reviewTasks).values({
            type: "field_change",
            toolId: tool.id,
            payload: {
              fields: { ...diff.after, _suggested: { taglineEn: fresh.taglineEn, taglineZh: fresh.taglineZh, descriptionEn: fresh.descriptionEn, descriptionZh: fresh.descriptionZh, pricingNoteEn: fresh.pricingNoteEn, pricingNoteZh: fresh.pricingNoteZh } },
              before: diff.before,
              site: { finalUrl: site.finalUrl, title: site.title, description: site.description, httpStatus: site.status, excerpt: (site.pricingText || site.text).slice(0, 1500) },
            },
            confidence: fresh.confidence.overall,
            reasons: [pricingChanged ? "定价页有变化" : "官网内容有变化"],
          });
          ctx.inc("field_changes");
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (e instanceof FetchBlockedError) {
        ctx.log(`${tool.slug}: ${msg}`);
        await db.update(tools).set({ lastCheckedAt: new Date() }).where(eq(tools.id, tool.id));
        continue;
      }
      const failures = tool.consecutiveFailures + 1;
      await db.insert(snapshots).values({ toolId: tool.id, ok: false, error: msg.slice(0, 300), httpStatus: Number(msg.match(/HTTP (\d+)/)?.[1]) || null });
      await db.update(tools).set({ lastCheckedAt: new Date(), consecutiveFailures: failures }).where(eq(tools.id, tool.id));
      ctx.inc("failed");
      if (failures >= FAIL_LIMIT && tool.status === "listed") {
        await setStatus(tool.id, "suspect_offline");
        if (!(await hasPending(tool.id, "suspect_offline"))) {
          await db.insert(reviewTasks).values({ type: "suspect_offline", toolId: tool.id, payload: { fields: {} }, reasons: [`连续 ${failures} 次无法访问：${msg.slice(0, 120)}`] });
        }
        ctx.inc("suspect_offline");
      }
    }
  }

  // Safe Browsing for everything we link to.
  try {
    const listed = await db.select({ id: tools.id, url: tools.url, globalUrl: tools.globalUrl, safety: tools.safety }).from(tools).where(eq(tools.status, "listed"));
    const flagged = await checkUrls(listed.flatMap((t) => [t.url, t.globalUrl].filter(Boolean) as string[]));
    for (const t of listed) {
      const hit = flagged.get(t.url) ?? (t.globalUrl ? flagged.get(t.globalUrl) : undefined);
      if (hit || t.safety?.flagged) {
        await db.update(tools).set({ safety: { flagged: !!hit, checkedAt: new Date().toISOString(), detail: hit } }).where(eq(tools.id, t.id));
        if (hit) ctx.inc("unsafe");
      }
    }
  } catch (e) {
    ctx.log(`safe browsing: ${(e as Error).message}`);
  }
  if (changedListing) await revalidateSite();
}

export function diffWatched(tool: Pick<Tool, (typeof WATCHED)[number]>, fresh: Partial<Record<(typeof WATCHED)[number], unknown>>) {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const k of WATCHED) {
    const a = tool[k];
    const b = fresh[k];
    if (b === undefined) continue;
    if (k === "pricingType" && b === "unknown") continue; // "unknown" is a non-answer, not a change
    const same = Array.isArray(a) && Array.isArray(b) ? [...a].sort().join() === [...b].sort().join() : a === b;
    if (!same) {
      before[k] = a;
      after[k] = b;
    }
  }
  return { before, after };
}
