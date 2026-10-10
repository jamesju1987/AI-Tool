import { pinyin } from "pinyin-pro";

/** Hosts where many unrelated products live under one domain; key on the path too. */
const MULTI_TENANT_HOSTS: Record<string, number> = {
  "github.com": 2,
  "huggingface.co": 3, // /spaces/{owner}/{name}
  "gitlab.com": 2,
  "chromewebstore.google.com": 3,
  "chrome.google.com": 4,
  "apps.apple.com": 4,
  "play.google.com": 0,
  "vercel.app": 0,
  "replit.com": 2,
  "notion.site": 0,
};

const TRACKING_PARAMS = /^(utm_|ref$|ref_|via$|source$|fbclid$|gclid$|mc_)/i;

export function normalizeUrl(input: string): string {
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  const u = new URL(raw);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
  if (u.pathname !== "/") u.pathname = u.pathname.replace(/\/+$/, "");
  const s = u.toString();
  return u.pathname === "/" && !u.search ? s.replace(/\/$/, "") : s;
}

/**
 * Identity key for duplicate detection: host without "www." — plus leading path
 * segments on shared hosts like github.com, so two repos never collide.
 */
export function siteKey(input: string): string {
  const u = new URL(normalizeUrl(input));
  // u.host keeps a non-default port (default ports are already dropped by URL).
  const host = u.host.replace(/^www\./, "");
  const segs = u.pathname.split("/").filter(Boolean);
  const n = MULTI_TENANT_HOSTS[host];
  if (n) return [host, ...segs.slice(0, n)].join("/").toLowerCase();
  // play.google.com/store/apps/details?id=x
  if (host === "play.google.com") return `${host}/${u.searchParams.get("id") ?? ""}`;
  return host;
}

export function slugify(name: string): string {
  const ascii = /[一-鿿]/.test(name) ? pinyin(name, { toneType: "none", nonZh: "consecutive", separator: " " }) : name;
  return (
    ascii
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "tool"
  );
}

/** Lower-cased search blob: names, aliases, full pinyin and initials, taglines. */
export function buildSearchText(t: { name: string; aliases?: string[]; taglineZh?: string; taglineEn?: string }): string {
  const names = [t.name, ...(t.aliases ?? [])];
  const parts: string[] = [...names];
  for (const n of names) {
    if (/[一-鿿]/.test(n)) {
      parts.push(pinyin(n, { toneType: "none", separator: "" }));
      parts.push(pinyin(n, { pattern: "first", toneType: "none", separator: "" }));
    }
  }
  parts.push(t.taglineZh ?? "", t.taglineEn ?? "");
  return parts.join(" ").toLowerCase().replace(/\s+/g, " ").trim();
}
