import { eq, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { rawItems, sources } from "@/db/schema";
import { normalizeUrl } from "@/lib/url";

/** Admin "Add tools" form / CLI: queue URLs as raw items from the manual source. */
export async function queueManualUrls(urls: string[]) {
  const [manual] = await db.select().from(sources).where(eq(sources.key, "manual"));
  if (!manual) throw new Error("manual source missing — run db:seed");
  let added = 0;
  for (const raw of urls) {
    let url: string;
    try {
      url = normalizeUrl(raw);
    } catch {
      continue;
    }
    const hash = createHash("sha256").update(`${manual.id}|${url}`).digest("hex");
    const res = await db
      .insert(rawItems)
      .values({ sourceId: manual.id, url, title: "", hash })
      // Re-adding a URL that failed before retries it; one that became a tool stays put.
      .onConflictDoUpdate({ target: rawItems.hash, set: { status: "pending", error: null }, where: isNull(rawItems.matchedToolId) })
      .returning({ id: rawItems.id });
    if (res.length) added++;
  }
  return added;
}
