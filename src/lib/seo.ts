import type { Metadata } from "next";
import { href, type Locale } from "./i18n";

/** canonical + hreflang pair for a bare path such as "/tool/cursor". */
export function alternates(locale: Locale, path: string): Metadata["alternates"] {
  return {
    canonical: href(locale, path),
    languages: { en: href("en", path), "zh-CN": href("zh", path), "x-default": href("en", path) },
  };
}
