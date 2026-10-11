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
    <Link href={href(locale, "/")} className="flex items-center gap-2.5 font-display text-[17px] font-semibold tracking-tight">
      {/* Radar glyph: rings, a sweep and one blip */}
      <svg aria-hidden viewBox="0 0 28 28" className="h-7 w-7">
        <defs>
          <linearGradient id="wm-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#38e1d0" />
            <stop offset="1" stopColor="#8b7cff" />
          </linearGradient>
        </defs>
        <rect x="0.5" y="0.5" width="27" height="27" rx="8" fill="#0c1220" stroke="rgb(140 160 220 / 0.3)" />
        <circle cx="14" cy="14" r="8.5" fill="none" stroke="url(#wm-g)" strokeOpacity="0.55" />
        <circle cx="14" cy="14" r="4.5" fill="none" stroke="url(#wm-g)" strokeOpacity="0.8" />
        <path d="M14 14 L22.5 14 A8.5 8.5 0 0 0 20 8 Z" fill="url(#wm-g)" fillOpacity="0.45" />
        <circle cx="18.6" cy="9.8" r="1.6" fill="#ffb547" />
      </svg>
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
        <header className="sticky top-0 z-40 border-b border-line bg-canvas/70 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-x-8 px-4">
            <Wordmark locale={locale} />
            <nav aria-label="Main" className="hidden gap-6 text-sm sm:flex">
              {nav.map((n) => (
                <Link key={n.href} href={href(locale, n.href)} className="whitespace-nowrap py-1 text-muted transition-colors hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <LangSwitch locale={locale} label={d.langSwitch} />
            </div>
          </div>
          <nav aria-label="Main" className="flex gap-5 overflow-x-auto px-4 pb-2.5 text-sm sm:hidden">
            {nav.map((n) => (
              <Link key={n.href} href={href(locale, n.href)} className="whitespace-nowrap text-muted hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-4 py-10">{children}</main>
        <footer className="mt-20 border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-sm text-faint sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl">{d.footerAbout} {d.footerAd}</p>
            <Link href={href(locale, "/methodology")} className="text-muted hover:text-accent">{d.nav.methodology}</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
