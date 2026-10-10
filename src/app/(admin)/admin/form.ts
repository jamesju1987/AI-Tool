import { z } from "zod";
import type { ToolFields } from "@/pipeline/publish";

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
const text = (v: FormDataEntryValue | null, max = 2000) => String(v ?? "").trim().slice(0, max);
const optUrl = (v: FormDataEntryValue | null) => {
  const s = text(v, 500);
  if (!s) return null;
  const u = new URL(s); // throws on garbage
  if (!/^https?:$/.test(u.protocol)) throw new Error("URL must be http(s)");
  return u.toString();
};

const PRICING = z.enum(["free", "freemium", "paid", "unknown"]);
const ACCESS = z.enum(["direct", "unstable", "blocked", "unknown"]);
const PLATFORMS = ["web", "desktop", "mobile", "plugin", "api"];

/** Parse the shared tool editor form (review card and tool edit page). */
export function parseToolForm(fd: FormData): { fields: ToolFields & { name: string; url: string }; primaryCategory: string; secondaryCategories: string[] } {
  const name = text(fd.get("name"), 80);
  const url = optUrl(fd.get("url"));
  if (!name || !url) throw new Error("名称和官网地址必填");
  const country = text(fd.get("originCountry"), 2).toUpperCase();
  const maturity = Number(fd.get("maturity"));
  return {
    fields: {
      name,
      url,
      globalUrl: optUrl(fd.get("globalUrl")),
      aliases: text(fd.get("aliases"), 300).split(/[,，]/).map((s) => s.trim()).filter(Boolean).slice(0, 8),
      taglineZh: text(fd.get("taglineZh"), 60),
      taglineEn: text(fd.get("taglineEn"), 120),
      descriptionZh: text(fd.get("descriptionZh"), 600),
      descriptionEn: text(fd.get("descriptionEn"), 1000),
      featuresZh: lines(fd.get("featuresZh")),
      featuresEn: lines(fd.get("featuresEn")),
      useCasesZh: lines(fd.get("useCasesZh")),
      useCasesEn: lines(fd.get("useCasesEn")),
      pricingType: PRICING.catch("unknown").parse(fd.get("pricingType")),
      pricingNoteZh: text(fd.get("pricingNoteZh"), 200),
      pricingNoteEn: text(fd.get("pricingNoteEn"), 300),
      cnAccess: ACCESS.catch("unknown").parse(fd.get("cnAccess")),
      platforms: fd.getAll("platforms").map(String).filter((p) => PLATFORMS.includes(p)),
      openSource: fd.get("openSource") === "on",
      hasCnUi: fd.get("hasCnUi") === "on",
      hasEnterprise: fd.get("hasEnterprise") === "on",
      company: text(fd.get("company"), 80) || null,
      originCountry: /^[A-Z]{2}$/.test(country) ? country : null,
      maturity: Number.isFinite(maturity) && maturity >= 1 && maturity <= 5 ? maturity : null,
    },
    primaryCategory: text(fd.get("primaryCategory"), 80),
    secondaryCategories: fd.getAll("secondaryCategories").map(String).filter(Boolean).slice(0, 3),
  };
}
