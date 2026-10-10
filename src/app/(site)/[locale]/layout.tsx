import "../../globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LangSwitch } from "@/components/LangSwitch";
import { env } from "@/lib/env";
import { href, isLocale, t, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = t(locale);
  return {
    metadataBase: new URL(env.siteUrl),
    title: { default: `${d.siteName} — ${locale === "zh" ? "每日更新的 AI 工具导航" : "Daily-updated AI tool directory"}`, template: `%s | ${d.siteName}` },
    description: d.siteDescription,
    openGraph: { siteName: d.siteName, locale: locale === "zh" ? "zh_CN" : "en_US", type: "website" },
  };
}

function Wordmark({ locale }: { locale: Locale }) {
  return (
    <Link href={href(locale, "/")} className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
      {/* 2×2 grid: a toolbox seen from above */}
      <span aria-hidden className="grid h-6 w-6 grid-cols-2 gap-0.5 rounded-md bg-ink p-1">
        <span className="rounded-[2px] bg-canvas" />
        <span className="rounded-[2px] bg-accent" />
        <span className="rounded-[2px] bg-canvas" />
        <span className="rounded-[2px] bg-canvas" />
      </span>
      {t(locale).siteName}
    </Link>
  );
}

export default async function SiteLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = t(locale);
  const nav = [
    { href: "/new", label: d.nav.newToday },
    { href: "/rank", label: d.nav.rank },
    { href: "/china-ai", label: d.nav.chinaAi },
    { href: "/categories", label: d.nav.categories },
  ];
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body className="min-h-screen antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
          {locale === "zh" ? "跳到正文" : "Skip to content"}
        </a>
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Wordmark locale={locale} />
            <nav aria-label="Main" className="order-3 flex w-full gap-4 overflow-x-auto text-sm sm:order-none sm:w-auto">
              {nav.map((n) => (
                <Link key={n.href} href={href(locale, n.href)} className="whitespace-nowrap py-1 text-muted hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto">
              <LangSwitch locale={locale} label={d.langSwitch} />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mt-16 border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:justify-between">
            <p>{d.footerAbout} {d.footerAd}</p>
            <Link href={href(locale, "/methodology")} className="hover:text-ink">{d.nav.methodology}</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
