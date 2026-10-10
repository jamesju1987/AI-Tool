import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import { safeFetch } from "../http";
import type { RawCandidate, SourcePlugin } from "./types";

/**
 * RSS/Atom feeds.
 * - mode "link": each item's link is the product itself (e.g. Show HN).
 * - mode "article": items are news articles; we pull outbound links from the item body
 *   and let the processor decide which (if any) is a product.
 */
export function parseFeed(xml: string) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });
  const doc = parser.parse(xml);
  const asArray = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
  type Item = { title?: string | { "#text": string }; link?: string | { "@href"?: string } | { "@href"?: string }[]; guid?: string | { "#text": string }; id?: string; description?: string; summary?: string; content?: string | { "#text": string }; "content:encoded"?: string };
  const items: Item[] = doc?.rss?.channel ? asArray(doc.rss.channel.item) : asArray(doc?.feed?.entry);
  const text = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "#text" in v ? String((v as { "#text": unknown })["#text"]) : "");
  return items.map((it) => {
    const link = typeof it.link === "string" ? it.link : asArray(it.link as { "@href"?: string })[0]?.["@href"] ?? "";
    return {
      id: text(it.guid) || it.id || link,
      title: text(it.title).trim(),
      link,
      html: it["content:encoded"] ?? text(it.content) ?? it.description ?? it.summary ?? "",
    };
  });
}

export const rss: SourcePlugin = async (source, ctx) => {
  const cfg = source.config as { url?: string; mode?: "link" | "article"; limit?: number };
  if (!cfg.url) throw new Error("rss source needs config.url");
  const res = await safeFetch(cfg.url, { minGapMs: source.rateLimitMs });
  if (res.status >= 400) throw new Error(`feed HTTP ${res.status}`);
  const items = parseFeed(res.text).slice(0, cfg.limit ?? 50);
  const out: RawCandidate[] = [];
  for (const it of items) {
    if (cfg.mode === "article") {
      const $ = cheerio.load(it.html || "");
      const feedHost = new URL(cfg.url).hostname;
      const links = $("a[href]").toArray().map((a) => $(a).attr("href") ?? "").filter((h) => /^https?:\/\//.test(h) && !h.includes(feedHost));
      if (!links.length) continue;
      out.push({ externalId: `${source.key}:${it.id}`, url: links[0], title: it.title, text: $.text().replace(/\s+/g, " ").slice(0, 1500) });
    } else if (it.link) {
      // Show HN titles look like "Show HN: Name – does X"
      const title = it.title.replace(/^show hn:\s*/i, "");
      out.push({ externalId: `${source.key}:${it.id}`, url: it.link, title: title.split(/\s[–—-]\s/)[0], text: title });
    }
  }
  ctx.log(`feed returned ${items.length} items, ${out.length} candidates`);
  return out;
};
