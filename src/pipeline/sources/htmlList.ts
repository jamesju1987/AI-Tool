import * as cheerio from "cheerio";
import { safeFetch } from "../http";
import type { RawCandidate, SourcePlugin } from "./types";

/**
 * Generic "latest additions" list on another directory. We only take the tool's name and
 * outbound link as a lead — every listing is rewritten from the tool's own website.
 * config: { url, itemSelector, nameSelector?, linkSelector?, limit? }
 */
export const htmlList: SourcePlugin = async (source) => {
  const cfg = source.config as { url?: string; itemSelector?: string; nameSelector?: string; linkSelector?: string; limit?: number };
  if (!cfg.url || !cfg.itemSelector) throw new Error("html_list source needs config.url and config.itemSelector");
  const res = await safeFetch(cfg.url, { minGapMs: source.rateLimitMs });
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  const $ = cheerio.load(res.text);
  const out: RawCandidate[] = [];
  $(cfg.itemSelector).slice(0, cfg.limit ?? 40).each((_, el) => {
    const item = $(el);
    const linkEl = cfg.linkSelector ? item.find(cfg.linkSelector).first() : item.is("a") ? item : item.find("a").first();
    const href = linkEl.attr("href");
    const name = (cfg.nameSelector ? item.find(cfg.nameSelector).first().text() : linkEl.text()).trim();
    if (!href || !name) return;
    const url = new URL(href, res.finalUrl).toString();
    out.push({ externalId: `${source.key}:${url}`, url, title: name.slice(0, 80) });
  });
  return out;
};
