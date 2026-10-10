import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".ico": "image/x-icon", ".svg": "image/svg+xml",
};

/** Serves logos and screenshots downloaded by the worker (MEDIA_DIR). Put a CDN in front. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  if (parts.some((p) => p === ".." || p.includes("/") || p.includes("\\") || p.startsWith("."))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const root = path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_DIR ?? "./media");
  const file = path.resolve(root, ...parts);
  if (!file.startsWith(root + path.sep)) return new NextResponse("Not found", { status: 404 });
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type) return new NextResponse("Not found", { status: 404 });
  try {
    await stat(file);
    const buf = await readFile(file);
    const headers: Record<string, string> = {
      "content-type": type,
      "cache-control": "public, max-age=604800, immutable",
      "x-content-type-options": "nosniff",
    };
    // SVGs can carry script; force them to render as an isolated image.
    if (type === "image/svg+xml") headers["content-security-policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    return new NextResponse(buf, { headers });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
