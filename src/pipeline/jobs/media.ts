import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { tools } from "@/db/schema";
import { revalidateSite } from "@/lib/revalidate";
import { safeFetch, sha256 } from "../http";
import type { JobContext } from "../runner";

const MAX_IMAGE_BYTES = 1_500_000;

/** Identify an image by magic bytes — never trust the server's content-type. */
export function sniffImage(b: Buffer): string | null {
  if (b.length < 4) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ".png";
  if (b[0] === 0xff && b[1] === 0xd8) return ".jpg";
  if (b.subarray(0, 3).toString() === "GIF") return ".gif";
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return ".webp";
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return ".ico";
  const head = b.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return ".svg";
  return null;
}

async function download(url: string, dir: string, slug: string) {
  const res = await safeFetch(url, { binary: true, timeoutMs: 15000, minGapMs: 500, ignoreRobots: true });
  if (res.status >= 400 || !res.bytes?.length) throw new Error(`HTTP ${res.status}`);
  if (res.bytes.length > MAX_IMAGE_BYTES) throw new Error("image too large");
  const ext = sniffImage(res.bytes);
  if (!ext) throw new Error("not an image");
  const root = path.resolve(process.env.MEDIA_DIR ?? "./media");
  const file = `${slug}-${sha256(res.bytes).slice(0, 10)}${ext}`;
  await mkdir(path.join(root, dir), { recursive: true });
  await writeFile(path.join(root, dir, file), res.bytes);
  return `/media/${dir}/${file}`;
}

/**
 * Copy logos and preview images to our own storage, so pages load fast from mainland
 * China and we don't hotlink third-party servers.
 */
export async function media(ctx: JobContext) {
  const force = ctx.args.force === true;
  const rows = await db
    .select({ id: tools.id, slug: tools.slug, url: tools.url, iconSourceUrl: tools.iconSourceUrl, imageSourceUrl: tools.imageSourceUrl, logoUrl: tools.logoUrl, imageUrl: tools.imageUrl })
    .from(tools)
    .where(and(
      or(eq(tools.status, "listed"), eq(tools.status, "draft"), eq(tools.status, "suspect_offline")),
      force ? undefined : or(and(isNull(tools.logoUrl), isNotNull(tools.iconSourceUrl)), and(isNull(tools.imageUrl), isNotNull(tools.imageSourceUrl))),
    ))
    .limit(Number(ctx.args.limit ?? 200));
  let changed = 0;
  for (const t of rows) {
    const patch: { logoUrl?: string; imageUrl?: string } = {};
    if ((force || !t.logoUrl) && t.iconSourceUrl) {
      try {
        patch.logoUrl = await download(t.iconSourceUrl, "logos", t.slug);
        ctx.inc("logos");
      } catch (e) {
        ctx.inc("logo_errors");
        ctx.log(`${t.slug} logo: ${(e as Error).message}`);
      }
    }
    if ((force || !t.imageUrl) && t.imageSourceUrl) {
      try {
        patch.imageUrl = await download(t.imageSourceUrl, "previews", t.slug);
        ctx.inc("previews");
      } catch {
        ctx.inc("preview_errors");
      }
    }
    if (Object.keys(patch).length) {
      await db.update(tools).set(patch).where(eq(tools.id, t.id));
      changed++;
    }
  }
  if (changed) await revalidateSite();
}
