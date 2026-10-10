import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { tools } from "@/db/schema";
import { memo } from "@/lib/cache";
import { getSettings } from "@/lib/settings";
import { bumpStat, looksLikeBot } from "@/lib/stats";
import { siteKey } from "@/lib/url";

export const dynamic = "force-dynamic";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function blockedPage(name: string) {
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>已拦截 / Link blocked</title><body style="font-family:system-ui,sans-serif;max-width:36rem;margin:15vh auto;padding:0 1rem;line-height:1.6;color:#18224a">
<h1 style="font-size:1.5rem">已拦截此链接 · Link blocked</h1>
<p>安全检查提示 <strong>${escapeHtml(name)}</strong> 的网站可能存在风险，我们暂时停止了跳转，正在人工复核。</p>
<p>A safety check flagged <strong>${escapeHtml(name)}</strong>, so we've paused the redirect while an editor reviews it.</p>
<p><a href="/">返回首页 / Back to home</a></p></body></html>`;
  return new NextResponse(html, { status: 451, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let [tool] = await db.select().from(tools).where(eq(tools.slug, slug));
  if (tool?.mergedIntoId) [tool] = await db.select().from(tools).where(eq(tools.id, tool.mergedIntoId));
  if (!tool || !["listed", "suspect_offline"].includes(tool.status)) {
    return NextResponse.redirect(new URL(tool ? `/tool/${tool.slug}` : "/", req.url), 302);
  }

  const settings = await memo("settings", getSettings, 60_000);
  const dest = req.nextUrl.searchParams.get("v") === "global" && tool.globalUrl ? tool.globalUrl : tool.url;
  const key = siteKey(dest);
  const blocked = tool.safety?.flagged || settings.blockedDomains.some((d) => key === d || key.endsWith(`.${d}`));
  if (blocked) return blockedPage(tool.name);

  if (!looksLikeBot(req.headers.get("user-agent"))) {
    bumpStat(tool.id, "clicks").catch(() => {});
  }
  const res = NextResponse.redirect(dest, 302);
  res.headers.set("cache-control", "no-store");
  res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}
