import * as cheerio from "cheerio";
import { safeFetch, sha256 } from "./http";

export type SiteInfo = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  title: string;
  description: string;
  ogImage: string | null;
  iconUrl: string | null;
  lang: string | null;
  /** Visible text, whitespace-collapsed and truncated. */
  text: string;
  pricingUrl: string | null;
  pricingText: string;
  /** Hash of the normalised visible text, used by patrol to detect changes. */
  pageHash: string;
  pricingHash: string | null;
};

const TEXT_LIMIT = 9000;
const PRICING_RE = /(pricing|price|plans|subscribe|定价|价格|会员|套餐|付费)/i;

export function parseHtml(html: string, baseUrl: string) {
  const $ = cheerio.load(html);
  const abs = (href?: string | null) => {
    if (!href) return null;
    try {
      const u = new URL(href, baseUrl);
      return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
    } catch {
      return null;
    }
  };
  const meta = (sel: string) => $(sel).attr("content")?.trim() ?? "";
  const title = ($("meta[property='og:title']").attr("content") || $("title").first().text() || "").trim().slice(0, 200);
  const description = (meta("meta[name='description']") || meta("meta[property='og:description']")).slice(0, 500);
  const ogImage = abs(meta("meta[property='og:image']") || meta("meta[name='twitter:image']"));
  const icons = $("link[rel~='icon'], link[rel='apple-touch-icon'], link[rel='apple-touch-icon-precomposed']")
    .toArray()
    .map((el) => ({ href: abs($(el).attr("href")), size: Number(($(el).attr("sizes") ?? "0").split("x")[0]) || ($(el).attr("rel")?.includes("apple") ? 180 : 32) }))
    .filter((i) => i.href)
    .sort((a, b) => b.size - a.size);
  const iconUrl = icons[0]?.href ?? abs("/favicon.ico");

  let pricingUrl: string | null = null;
  $("a[href]").each((_, el) => {
    if (pricingUrl) return;
    const href = $(el).attr("href") ?? "";
    const label = $(el).text();
    if (PRICING_RE.test(href) || PRICING_RE.test(label)) {
      const u = abs(href);
      if (u && new URL(u).host === new URL(baseUrl).host) pricingUrl = u;
    }
  });

  $("script, style, noscript, svg, iframe, template").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, TEXT_LIMIT);
  return { title, description, ogImage, iconUrl, pricingUrl: pricingUrl as string | null, text, lang: $("html").attr("lang") ?? null };
}

export async function fetchSite(url: string, opts: { minGapMs?: number; withPricing?: boolean } = {}): Promise<SiteInfo> {
  const res = await safeFetch(url, { minGapMs: opts.minGapMs });
  const isHtml = /html|xml/i.test(res.contentType) || res.text.trimStart().startsWith("<");
  const parsed = isHtml ? parseHtml(res.text, res.finalUrl) : { title: "", description: "", ogImage: null, iconUrl: null, pricingUrl: null, text: "", lang: null };
  let pricingText = "";
  let pricingHash: string | null = null;
  if (opts.withPricing !== false && parsed.pricingUrl && parsed.pricingUrl !== res.finalUrl) {
    try {
      const p = await safeFetch(parsed.pricingUrl, { minGapMs: opts.minGapMs });
      if (p.status < 400) {
        pricingText = parseHtml(p.text, p.finalUrl).text.slice(0, 5000);
        pricingHash = sha256(pricingText);
      }
    } catch {
      /* pricing page is optional */
    }
  }
  return {
    requestedUrl: url,
    finalUrl: res.finalUrl,
    status: res.status,
    ok: res.status >= 200 && res.status < 400,
    ...parsed,
    pricingText,
    pageHash: sha256(parsed.text.replace(/\d+/g, "#")), // ignore counters/dates that change every load
    pricingHash,
  };
}
