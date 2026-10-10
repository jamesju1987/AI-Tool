import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { href, locales } from "@/lib/i18n";
import { getSitemapRows } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { tools, categories } = await getSitemapRows();
  const entry = (path: string, lastModified?: string, priority = 0.6): MetadataRoute.Sitemap[number] => ({
    url: `${env.siteUrl}${href("en", path)}`,
    lastModified,
    priority,
    alternates: { languages: Object.fromEntries(locales.map((l) => [l === "zh" ? "zh-CN" : l, `${env.siteUrl}${href(l, path)}`])) },
  });
  return [
    entry("/", undefined, 1),
    entry("/new", undefined, 0.8),
    entry("/rank", undefined, 0.8),
    entry("/china-ai", undefined, 0.8),
    entry("/categories", undefined, 0.5),
    ...categories.map((c) => entry(`/category/${c}`, undefined, 0.8)),
    ...tools.flatMap((t) => [entry(`/tool/${t.slug}`, t.updatedAt, 0.7), entry(`/tool/${t.slug}/alternatives`, t.updatedAt, 0.5)]),
  ];
}
