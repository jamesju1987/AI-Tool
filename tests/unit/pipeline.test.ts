import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { mockExtract, sanitize, type Extracted } from "@/pipeline/extract";
import { assertPublicUrl, FetchBlockedError, parseRobots, robotsAllows } from "@/pipeline/http";
import { decideRoute, mergeSignals } from "@/pipeline/jobs/process";
import { diffWatched } from "@/pipeline/jobs/patrol";
import { computeScores } from "@/pipeline/jobs/scores";
import { sniffImage } from "@/pipeline/jobs/media";
import { extractJson } from "@/pipeline/llm";
import type { SiteInfo } from "@/pipeline/site";
import { parseHtml } from "@/pipeline/site";
import { parseFeed } from "@/pipeline/sources/rss";

const cats = [
  { slug: "video-generation", nameEn: "Video generation", nameZh: "视频生成", parentSlug: "video" },
  { slug: "chat-general", nameEn: "General assistants", nameZh: "通用助手", parentSlug: "chat" },
];

const site = (over: Partial<SiteInfo> = {}): SiteInfo => ({
  requestedUrl: "https://x.ai", finalUrl: "https://x.ai", status: 200, ok: true, title: "X – AI video generator",
  description: "Create AI videos from text.", ogImage: null, iconUrl: null, lang: "en", text: "AI video model", pricingUrl: null,
  pricingText: "Free plan. Pro $10 per month", pageHash: "h", pricingHash: null, ...over,
});

describe("SSRF guard", () => {
  it.each(["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://10.0.0.5", "http://[::1]/", "file:///etc/passwd", "http://localhost:8080", "https://user:pw@example.com"])(
    "blocks %s",
    async (u) => {
      await expect(assertPublicUrl(u)).rejects.toBeInstanceOf(FetchBlockedError);
    },
  );
});

describe("robots.txt", () => {
  it("applies the * group with longest-match allow", () => {
    const r = parseRobots("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private\nAllow: /private/ok\n");
    expect(robotsAllows(r, "/")).toBe(true);
    expect(robotsAllows(r, "/private/x")).toBe(false);
    expect(robotsAllows(r, "/private/ok/1")).toBe(true);
  });
});

describe("HTML + feed parsing", () => {
  it("extracts meta, largest icon and a same-site pricing link", () => {
    const p = parseHtml(
      `<html lang="zh-CN"><head><title>T</title><meta name="description" content="D"><link rel="icon" href="/a.png" sizes="16x16"><link rel="icon" href="/b.png" sizes="192x192"></head>
       <body><script>var x=1</script><a href="https://other.com/pricing">x</a><a href="/pricing">价格</a> Hello</body></html>`,
      "https://site.com/",
    );
    expect(p.description).toBe("D");
    expect(p.iconUrl).toBe("https://site.com/b.png");
    expect(p.pricingUrl).toBe("https://site.com/pricing");
    expect(p.text).not.toContain("var x");
    expect(p.lang).toBe("zh-CN");
  });

  it("reads RSS and Atom", () => {
    expect(parseFeed(`<rss><channel><item><title>A</title><link>https://a.com</link><guid>1</guid></item></channel></rss>`)[0]).toMatchObject({ title: "A", link: "https://a.com" });
    expect(parseFeed(`<feed><entry><title>B</title><link href="https://b.com"/><id>2</id></entry></feed>`)[0]).toMatchObject({ title: "B", link: "https://b.com" });
  });

  it("pulls JSON out of chatty model output", () => {
    expect(extractJson('Sure!\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });
});

describe("extraction guards", () => {
  it("strips superlatives and repairs an invalid category", () => {
    const e = mockExtract(site(), {}, cats);
    const bad: Extracted = { ...e, taglineEn: "The best revolutionary video tool", taglineZh: "最强视频神器", primaryCategory: "nope" };
    const s = sanitize(bad, cats);
    expect(s.taglineEn).not.toMatch(/best|revolutionary/i);
    expect(s.taglineZh).not.toMatch(/最强|神器/);
    expect(s.primaryCategory).toBe("video-generation");
    expect(s.confidence.category).toBe(0);
  });

  it("mock extractor picks a category from keywords and detects freemium", () => {
    const e = mockExtract(site(), {}, cats);
    expect(e.primaryCategory).toBe("video-generation");
    expect(e.pricingType).toBe("freemium");
  });
});

describe("routing (PRD §6 step 5)", () => {
  const base = {
    settings: { ...DEFAULT_SETTINGS, autoPublish: true },
    scores: { isTool: 0.95, neutral: 0.95, categoryFit: 0.95, injection: 0.01, maturity: 4 },
    extracted: { ...mockExtract(site(), {}, cats), taglineEn: "x", taglineZh: "x", confidence: { overall: 0.9, category: 0.9, pricing: 0.9 } },
    site: site(),
    trustedSource: true,
    sourceCount: 1,
    sensitiveCategory: false,
    duplicate: false,
  };
  it("auto-publishes only when every check passes", () => {
    expect(decideRoute(base).auto).toBe(true);
  });
  it.each([
    ["auto-publish off", { settings: DEFAULT_SETTINGS }],
    ["low tool score", { scores: { ...base.scores, isTool: 0.5 } }],
    ["injection signal", { scores: { ...base.scores, injection: 0.5 } }],
    ["single untrusted source", { trustedSource: false }],
    ["duplicate", { duplicate: true }],
    ["sensitive category", { sensitiveCategory: true }],
    ["dead site", { site: site({ ok: false, status: 500 }) }],
  ])("sends to review on %s", (_, patch) => {
    const d = decideRoute({ ...base, ...patch });
    expect(d.auto).toBe(false);
    expect(d.reasons.length).toBeGreaterThan(0);
  });
});

describe("signals, diffs and scores", () => {
  it("keeps the max signal and records star growth", () => {
    expect(mergeSignals({ githubStars: 100, productHuntVotes: 5 }, { githubStars: 150 })).toEqual({ githubStars: 150, githubStarsDelta: 50, productHuntVotes: 5 });
  });

  it("only flags real structured changes", () => {
    const tool = { pricingType: "free" as const, platforms: ["web", "api"], openSource: true, hasEnterprise: false, hasCnUi: false };
    expect(diffWatched(tool, { pricingType: "unknown", platforms: ["api", "web"] }).after).toEqual({});
    expect(diffWatched(tool, { pricingType: "paid" }).after).toEqual({ pricingType: "paid" });
  });

  it("normalises components and blends them with the configured weights", () => {
    const now = Date.now();
    const rows = [
      { id: 1, clicks7: 100, views7: 500, signals: { productHuntVotes: 400 }, listedAt: new Date(now), aiScoreZh: 1, aiScoreEn: 1 },
      { id: 2, clicks7: 0, views7: 0, signals: {}, listedAt: new Date(now - 365 * 86400_000), aiScoreZh: 0.2, aiScoreEn: null },
    ];
    const [a, b] = computeScores(rows, DEFAULT_SETTINGS, now);
    expect(a.heat).toBeCloseTo(1, 5);
    expect(a.rankZh).toBeCloseTo(1, 5);
    expect(b.heat).toBeLessThan(0.01);
    expect(b.rankEn).toBeCloseTo(DEFAULT_SETTINGS.weights.ai * 0.5, 2); // unranked → neutral 0.5
  });

  it("recognises images by magic bytes, not by name", () => {
    expect(sniffImage(Buffer.from("89504e470d0a1a0a", "hex"))).toBe(".png");
    expect(sniffImage(Buffer.from("<svg xmlns='x'></svg>"))).toBe(".svg");
    expect(sniffImage(Buffer.from("<html>"))).toBeNull();
  });
});
