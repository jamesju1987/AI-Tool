import { clearMemo } from "./cache";
import { env } from "./env";

/**
 * Make public pages reflect a change. Inside the Next.js server we clear the memo
 * directly; from the worker process we call the site's /api/revalidate endpoint.
 */
export async function revalidateSite() {
  if (process.env.NEXT_RUNTIME) {
    clearMemo();
    return;
  }
  if (!env.revalidateSecret) return;
  const base = process.env.INTERNAL_SITE_URL ?? env.siteUrl;
  try {
    await fetch(`${base}/api/revalidate`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.revalidateSecret}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.warn("revalidate failed:", (e as Error).message);
  }
}
