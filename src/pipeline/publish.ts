import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, toolCategories, tools, type NewTool, type Signals } from "@/db/schema";
import { buildSearchText, siteKey, slugify } from "@/lib/url";

/** Fields an editor (or the auto path) can set on a tool. */
export type ToolFields = Partial<
  Pick<
    NewTool,
    | "name" | "aliases" | "url" | "globalUrl" | "logoUrl" | "imageUrl" | "iconSourceUrl" | "imageSourceUrl"
    | "taglineEn" | "taglineZh" | "descriptionEn" | "descriptionZh"
    | "featuresEn" | "featuresZh" | "useCasesEn" | "useCasesZh"
    | "pricingType" | "pricingNoteEn" | "pricingNoteZh" | "cnAccess" | "platforms"
    | "openSource" | "hasCnUi" | "hasEnterprise" | "company" | "companyRegion" | "originCountry" | "availableRegions" | "maturity"
  >
>;

export const EDITABLE_FIELDS = [
  "name", "aliases", "url", "globalUrl", "logoUrl", "imageUrl", "taglineEn", "taglineZh", "descriptionEn", "descriptionZh",
  "featuresEn", "featuresZh", "useCasesEn", "useCasesZh", "pricingType", "pricingNoteEn", "pricingNoteZh", "cnAccess",
  "platforms", "openSource", "hasCnUi", "hasEnterprise", "company", "companyRegion", "originCountry", "availableRegions", "maturity",
] as const;

export function pickFields(input: Record<string, unknown>): ToolFields {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE_FIELDS) if (k in input) out[k] = input[k];
  return out as ToolFields;
}

export async function uniqueSlug(name: string, excludeId?: number) {
  const base = slugify(name);
  const taken = await db.select({ slug: tools.slug, id: tools.id }).from(tools).where(like(tools.slug, `${base}%`));
  const set = new Set(taken.filter((t) => t.id !== excludeId).map((t) => t.slug));
  if (!set.has(base)) return base;
  for (let i = 2; ; i++) if (!set.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** Link a tool to its categories; the primary's parent is linked too so it shows up one level up. */
export async function setCategories(toolId: number, primarySlug: string, secondarySlugs: string[] = []) {
  const slugs = [primarySlug, ...secondarySlugs].filter(Boolean);
  const rows = slugs.length ? await db.select().from(categories).where(inArray(categories.slug, slugs)) : [];
  const primary = rows.find((r) => r.slug === primarySlug);
  if (!primary) throw new Error(`unknown category: ${primarySlug}`);
  const links = new Map<number, boolean>();
  links.set(primary.id, true);
  for (const r of rows) {
    if (!links.has(r.id)) links.set(r.id, false);
    if (r.parentId && !links.has(r.parentId)) links.set(r.parentId, false);
  }
  await db.delete(toolCategories).where(eq(toolCategories.toolId, toolId));
  await db.insert(toolCategories).values([...links].map(([categoryId, isPrimary]) => ({ toolId, categoryId, isPrimary })));
}

export async function createTool(opts: {
  fields: ToolFields & { name: string; url: string };
  primaryCategory: string;
  secondaryCategories?: string[];
  status: "listed" | "draft";
  signals?: Signals;
  embedding?: number[] | null;
}) {
  const f = opts.fields;
  const slug = await uniqueSlug(f.name);
  const [row] = await db
    .insert(tools)
    .values({
      ...f,
      slug,
      domain: siteKey(f.url),
      status: opts.status,
      listedAt: opts.status === "listed" ? new Date() : null,
      lastCheckedAt: new Date(),
      signals: opts.signals ?? {},
      embedding: opts.embedding ?? null,
      searchText: buildSearchText({ name: f.name, aliases: f.aliases ?? [], taglineZh: f.taglineZh ?? "", taglineEn: f.taglineEn ?? "" }),
    })
    .returning();
  await setCategories(row.id, opts.primaryCategory, opts.secondaryCategories);
  return row;
}

export async function updateTool(id: number, fields: ToolFields, extra: Partial<NewTool> = {}) {
  const [cur] = await db.select().from(tools).where(eq(tools.id, id));
  if (!cur) throw new Error(`tool ${id} not found`);
  const merged = { ...cur, ...fields };
  const patch: Partial<NewTool> = { ...fields, ...extra, updatedAt: new Date() };
  if (fields.url) patch.domain = siteKey(fields.url);
  if (fields.name || fields.aliases || fields.taglineEn || fields.taglineZh) {
    patch.searchText = buildSearchText({ name: merged.name, aliases: merged.aliases, taglineZh: merged.taglineZh, taglineEn: merged.taglineEn });
  }
  const [row] = await db.update(tools).set(patch).where(eq(tools.id, id)).returning();
  return row;
}

export async function setStatus(id: number, status: "listed" | "draft" | "suspect_offline" | "offline" | "rejected") {
  const [cur] = await db.select({ listedAt: tools.listedAt }).from(tools).where(eq(tools.id, id));
  await db
    .update(tools)
    .set({ status, updatedAt: new Date(), ...(status === "listed" && !cur?.listedAt ? { listedAt: new Date() } : {}), ...(status === "listed" ? { consecutiveFailures: 0 } : {}) })
    .where(eq(tools.id, id));
}

/** Merge `fromId` into `intoId`: categories and stats move over, the old slug 301s. */
export async function mergeTools(fromId: number, intoId: number) {
  if (fromId === intoId) throw new Error("cannot merge a tool into itself");
  const [from] = await db.select().from(tools).where(eq(tools.id, fromId));
  const [into] = await db.select().from(tools).where(eq(tools.id, intoId));
  if (!from || !into) throw new Error("tool not found");
  const aliases = [...new Set([...into.aliases, from.name, ...from.aliases].filter((a) => a && a !== into.name))].slice(0, 10);
  await updateTool(intoId, { aliases, globalUrl: into.globalUrl ?? (from.url !== into.url ? from.url : null) });
  await db.update(tools).set({ status: "rejected", mergedIntoId: intoId, updatedAt: new Date() }).where(eq(tools.id, fromId));
  // Point anything already merged into `from` at the new target.
  await db.update(tools).set({ mergedIntoId: intoId }).where(eq(tools.mergedIntoId, fromId));
  const fromCats = await db.select().from(toolCategories).where(eq(toolCategories.toolId, fromId));
  for (const c of fromCats) {
    await db.insert(toolCategories).values({ toolId: intoId, categoryId: c.categoryId, isPrimary: false }).onConflictDoNothing();
  }
  await db.delete(toolCategories).where(and(eq(toolCategories.toolId, fromId)));
}
