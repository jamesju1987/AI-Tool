import { and, eq, ne, sql as dsql } from "drizzle-orm";
import { db } from "@/db/client";
import { tools } from "@/db/schema";

export function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Exact identity: same site key (host, or host+path on shared hosts like github.com). */
export async function findBySiteKey(key: string) {
  const [row] = await db.select().from(tools).where(eq(tools.domain, key)).limit(1);
  return row ?? null;
}

export type DuplicateHit = { toolId: number; slug: string; name: string; similarity: number; via: "embedding" | "name" };

/**
 * Fuzzy duplicates (same product, different domain — e.g. a CN and a global site).
 * Uses embeddings when configured, plus trigram similarity on the name.
 */
export async function findSimilar(name: string, embedding: number[] | null, threshold: number, excludeId?: number): Promise<DuplicateHit | null> {
  const lname = name.toLowerCase();
  const nameHits = await db
    .select({ id: tools.id, slug: tools.slug, name: tools.name, sim: dsql<number>`similarity(lower(${tools.name}), ${lname})`, embedding: tools.embedding })
    .from(tools)
    .where(and(ne(tools.status, "rejected"), excludeId ? ne(tools.id, excludeId) : dsql`true`, dsql`(lower(${tools.name}) % ${lname} or ${lname} = any(select lower(unnest(${tools.aliases}))))`))
    .orderBy(dsql`similarity(lower(${tools.name}), ${lname}) desc`)
    .limit(10);

  let best: DuplicateHit | null = null;
  for (const h of nameHits) {
    const nameSim = Number(h.sim);
    if (nameSim >= 0.8 && (!best || nameSim > best.similarity)) best = { toolId: h.id, slug: h.slug, name: h.name, similarity: nameSim, via: "name" };
  }
  if (embedding) {
    // Brute force is fine at directory scale (a few thousand rows).
    const rows = await db.select({ id: tools.id, slug: tools.slug, name: tools.name, embedding: tools.embedding }).from(tools).where(ne(tools.status, "rejected"));
    for (const r of rows) {
      if (!r.embedding || r.id === excludeId) continue;
      const s = cosine(embedding, r.embedding);
      if (s >= threshold && (!best || s > best.similarity)) best = { toolId: r.id, slug: r.slug, name: r.name, similarity: s, via: "embedding" };
    }
  }
  return best;
}
