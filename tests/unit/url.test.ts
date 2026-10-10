import { describe, expect, it } from "vitest";
import { buildSearchText, normalizeUrl, siteKey, slugify } from "@/lib/url";

describe("normalizeUrl", () => {
  it("adds https, strips tracking params, hash and trailing slash", () => {
    expect(normalizeUrl("Example.com/?utm_source=ph&ref=abc#top")).toBe("https://example.com");
    expect(normalizeUrl("https://example.com/app/?id=3&utm_medium=x")).toBe("https://example.com/app?id=3");
  });
});

describe("siteKey", () => {
  it("ignores www and paths on normal hosts", () => {
    expect(siteKey("https://www.cursor.com/pricing")).toBe("cursor.com");
  });
  it("keeps owner/repo on shared hosts", () => {
    expect(siteKey("https://github.com/ollama/ollama/tree/main")).toBe("github.com/ollama/ollama");
    expect(siteKey("https://github.com/features/copilot")).toBe("github.com/features/copilot");
    expect(siteKey("https://huggingface.co/spaces/a/b")).toBe("huggingface.co/spaces/a/b");
  });
  it("keeps distinct subdomains distinct", () => {
    expect(siteKey("https://chat.deepseek.com")).not.toBe(siteKey("https://deepseek.com"));
  });
  it("keys play store apps by id", () => {
    expect(siteKey("https://play.google.com/store/apps/details?id=com.x.y&hl=en")).toBe("play.google.com/com.x.y");
  });
});

describe("slugify / search text", () => {
  it("turns Chinese names into pinyin slugs", () => {
    expect(slugify("可灵 AI")).toBe("ke-ling-ai");
    expect(slugify("Hello, World!")).toBe("hello-world");
  });
  it("indexes pinyin and initials", () => {
    const s = buildSearchText({ name: "豆包", taglineZh: "字节跳动的助手" });
    expect(s).toContain("doubao");
    expect(s).toContain("db");
  });
});
