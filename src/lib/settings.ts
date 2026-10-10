import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settings } from "@/db/schema";

/** Tunable knobs, editable in the admin "Settings" page. */
export type AppSettings = {
  /** PRD: keep off for the first 4 weeks so every item is reviewed and thresholds calibrated. */
  autoPublish: boolean;
  thresholds: {
    isTool: number;
    neutral: number;
    categoryFit: number;
    maxInjection: number;
    duplicateSimilarity: number;
  };
  /** Composite ranking weights: AI judge, on-site behaviour, external signals, freshness. */
  weights: { ai: number; behavior: number; external: number; freshness: number };
  /** Heat score weights (PRD §8). */
  heatWeights: { clicks: number; views: number; external: number; freshness: number };
  /** Max pending reviews before low-priority sources pause (PRD risk table). */
  reviewBacklogLimit: number;
  /** Domains whose outbound links are blocked at /go. */
  blockedDomains: string[];
  pairwise: { budgetPerItem: number; maxItemsPerCategory: number };
};

export const DEFAULT_SETTINGS: AppSettings = {
  autoPublish: false,
  thresholds: { isTool: 0.85, neutral: 0.85, categoryFit: 0.85, maxInjection: 0.2, duplicateSimilarity: 0.92 },
  weights: { ai: 0.6, behavior: 0.1, external: 0.2, freshness: 0.1 },
  heatWeights: { clicks: 0.4, views: 0.2, external: 0.3, freshness: 0.1 },
  reviewBacklogLimit: 100,
  blockedDomains: [],
  pairwise: { budgetPerItem: 6, maxItemsPerCategory: 40 },
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settings);
  const out: Record<string, unknown> = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) {
    const def = (DEFAULT_SETTINGS as Record<string, unknown>)[r.key];
    out[r.key] =
      def && typeof def === "object" && !Array.isArray(def) ? { ...def, ...(r.value as object) } : r.value;
  }
  return out as AppSettings;
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export async function deleteSetting(key: keyof AppSettings) {
  await db.delete(settings).where(eq(settings.key, key));
}
