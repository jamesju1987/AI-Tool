/**
 * Tiny in-process TTL memo for public read queries. The site runs as a single Node
 * process, so this is enough; /api/revalidate (called by the worker and the admin)
 * clears it right after a tool is published or changed.
 */
type Entry = { at: number; value: Promise<unknown> };

declare global {
  var __memo: Map<string, Entry> | undefined;
}
const store: Map<string, Entry> = globalThis.__memo ?? (globalThis.__memo = new Map());

const DEFAULT_TTL_MS = Number(process.env.PAGE_CACHE_TTL_MS ?? 120_000);

export function memo<T>(key: string, fn: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn().catch((e) => {
    store.delete(key); // never cache failures
    throw e;
  });
  store.set(key, { at: Date.now(), value });
  if (store.size > 5000) store.delete(store.keys().next().value!);
  return value;
}

export function clearMemo(prefix?: string) {
  if (!prefix) return store.clear();
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
