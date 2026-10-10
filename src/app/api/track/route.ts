import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { tools } from "@/db/schema";
import { memo } from "@/lib/cache";
import { bumpStat, looksLikeBot } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (looksLikeBot(req.headers.get("user-agent"))) return new NextResponse(null, { status: 204 });
  let slug = "";
  try {
    const body = await req.json();
    slug = typeof body?.slug === "string" ? body.slug.slice(0, 80) : "";
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) return new NextResponse(null, { status: 400 });
  const id = await memo(`tool-id:${slug}`, async () => {
    const [r] = await db.select({ id: tools.id }).from(tools).where(and(eq(tools.slug, slug), eq(tools.status, "listed")));
    return r?.id ?? null;
  }, 600_000);
  if (id) await bumpStat(id, "views").catch(() => {});
  return new NextResponse(null, { status: 204 });
}
