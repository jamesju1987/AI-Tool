"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Links to the same page in the other language. */
export function LangSwitch({ locale, label }: { locale: "en" | "zh"; label: string }) {
  const path = usePathname() || "/";
  const bare = path === "/zh" ? "/" : path.startsWith("/zh/") ? path.slice(3) : path.replace(/^\/en(?=\/|$)/, "") || "/";
  const target = locale === "zh" ? bare : bare === "/" ? "/zh" : `/zh${bare}`;
  return (
    <Link href={target} hrefLang={locale === "zh" ? "en" : "zh"} className="rounded-md px-2 py-1 text-sm text-muted ring-1 ring-line hover:text-ink">
      {label}
    </Link>
  );
}
