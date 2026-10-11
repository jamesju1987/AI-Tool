import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { notFound, permanentRedirect } from "next/navigation";
import { TrackView } from "@/components/TrackView";
import { AccessDot, fmtDate, PriceTag, ToolLogo, ToolRow } from "@/components/ui";
import { getToolPage } from "@/lib/queries";
import { env } from "@/lib/env";
import { href, L, t, type Locale } from "@/lib/i18n";
import { alternates } from "@/lib/seo";

type Props = { params: Promise<{ locale: Locale; slug: string }> };

const REGION_NAMES: Record<string, { zh: string; en: string }> = {
  CN: { zh: "中国", en: "China" }, US: { zh: "美国", en: "United States" }, GB: { zh: "英国", en: "United Kingdom" },
  DE: { zh: "德国", en: "Germany" }, FR: { zh: "法国", en: "France" }, SG: { zh: "新加坡", en: "Singapore" },
  CA: { zh: "加拿大", en: "Canada" }, SE: { zh: "瑞典", en: "Sweden" }, AT: { zh: "奥地利", en: "Austria" },
  JP: { zh: "日本", en: "Japan" }, KR: { zh: "韩国", en: "South Korea" }, IL: { zh: "以色列", en: "Israel" },
  IN: { zh: "印度", en: "India" }, HK: { zh: "中国香港", en: "Hong Kong" },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const data = await getToolPage(slug, locale);
  if (!data || data.redirectTo !== undefined) return {};
  const { tool } = data;
  const title =
    locale === "zh"
      ? `${tool.name} 是什么、怎么用、免费吗`
      : `${tool.name}: what it is, pricing and alternatives`;
  return {
    title,
    description: L(tool, "description", locale) || L(tool, "tagline", locale),
    alternates: alternates(locale, `/tool/${slug}`),
    robots: tool.status === "offline" ? { index: false } : undefined,
  };
}

export default async function ToolPage({ params }: Props) {
  const { locale, slug } = await params;
  const data = await getToolPage(slug, locale);
  if (!data) notFound();
  if (data.redirectTo !== undefined) {
    if (!data.redirectTo) notFound();
    permanentRedirect(href(locale, `/tool/${data.redirectTo}`));
  }
  const { tool, primary, parent, similar, rank, tieAtTop } = data;
  const d = t(locale);
  const features = locale === "zh" ? tool.featuresZh : tool.featuresEn;
  const useCases = locale === "zh" ? tool.useCasesZh : tool.useCasesEn;
  const pricingNote = L(tool, "pricingNote", locale);
  const offline = tool.status === "offline";
  const region = tool.originCountry ? REGION_NAMES[tool.originCountry]?.[locale] ?? tool.originCountry : null;
  const catName = primary ? L(primary, "name", locale) : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: tool.name,
    url: tool.url,
    description: L(tool, "description", locale) || L(tool, "tagline", locale),
    applicationCategory: catName || undefined,
    operatingSystem: tool.platforms.length ? tool.platforms.map((p) => d.platforms[p] ?? p).join(", ") : undefined,
    offers: tool.pricingType === "free" ? { "@type": "Offer", price: 0, priceCurrency: "USD" } : undefined,
    publisher: tool.company ? { "@type": "Organization", name: tool.company } : undefined,
    mainEntityOfPage: `${env.siteUrl}${href(locale, `/tool/${tool.slug}`)}`,
  };

  return (
    <article>
      <TrackView slug={tool.slug} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-faint">
        <Link href={href(locale, "/")} className="hover:text-ink">{d.siteName}</Link>
        {parent && (
          <>
            <span className="mx-2">/</span>
            <Link href={href(locale, `/category/${parent.slug}`)} className="hover:text-ink">{L(parent, "name", locale)}</Link>
          </>
        )}
        {primary && (
          <>
            <span className="mx-2">/</span>
            <Link
              href={parent ? `${href(locale, `/category/${parent.slug}`)}?sub=${primary.slug}` : href(locale, `/category/${primary.slug}`)}
              className="hover:text-ink"
            >
              {catName}
            </Link>
          </>
        )}
      </nav>

      {offline && <p className="mb-6 rounded-xl bg-danger/10 p-3 text-sm text-danger ring-1 ring-danger/30">{d.offlineNotice}</p>}

      {/* Hero card: identity, verdict chips and the one primary action. */}
      <header className="panel relative overflow-hidden p-6 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgb(139_124_255/0.25),transparent_65%)]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgb(56_225_208/0.14),transparent_65%)]" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="rounded-2xl shadow-[0_0_40px_-6px_rgb(56_225_208/0.45)]">
            <ToolLogo name={tool.name} src={tool.logoUrl} size={72} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] sm:text-[2.6rem] sm:leading-tight">{tool.name}</h1>
            <p className="mt-1.5 text-lg text-muted">{L(tool, "tagline", locale)}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <PriceTag pricing={tool.pricingType} locale={locale} />
              <AccessDot access={tool.cnAccess} locale={locale} />
              {[tool.openSource && d.openSourceYes, tool.hasCnUi && d.cnUiYes, tool.hasEnterprise && d.enterpriseYes]
                .filter(Boolean)
                .map((x) => (
                  <span key={String(x)} className="rounded-md px-1.5 py-0.5 text-[11px] text-muted ring-1 ring-line">{x}</span>
                ))}
            </div>
          </div>
          {!offline && (
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <a
                href={`/go/${tool.slug}`}
                rel="nofollow noopener"
                target="_blank"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 font-medium text-[#04201c] shadow-[0_0_30px_-6px_rgb(56_225_208/0.7)] transition hover:brightness-110"
              >
                {d.visit}
                <ArrowUpRight aria-hidden className="h-4 w-4" />
              </a>
              {tool.globalUrl && (
                <a href={`/go/${tool.slug}?v=global`} rel="nofollow noopener" target="_blank" className="text-center text-sm text-muted hover:text-accent">
                  {d.globalVersion}
                </a>
              )}
            </div>
          )}
        </div>

        {rank && primary && (
          <div className="relative mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-5 text-sm">
            <Link
              href={href(locale, `/category/${parent?.slug ?? primary.slug}`) + (parent ? `?sub=${primary.slug}` : "")}
              className="inline-flex items-center gap-2 text-ink hover:text-accent"
            >
              <span className="font-mono text-accent">#{rank}</span>
              {d.rankLabel(catName)}
            </Link>
            {tieAtTop && <span className="text-muted">{d.tieTop}</span>}
          </div>
        )}
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {tool.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tool.imageUrl} alt="" loading="lazy" className="mb-8 w-full rounded-2xl ring-1 ring-line bg-surface" />
          )}

          {L(tool, "description", locale) && <p className="max-w-[68ch] text-[1.08rem] leading-relaxed text-ink/90">{L(tool, "description", locale)}</p>}

          {features.length > 0 && (
            <section className="mt-10">
              <h2 className="font-display text-lg font-semibold">{d.features}</h2>
              <ul className="mt-4 grid max-w-[68ch] gap-2 sm:grid-cols-2">
                {features.map((f) => (
                  <li key={f} className="flex gap-2.5 rounded-xl bg-white/[0.02] px-3.5 py-2.5 text-sm ring-1 ring-line">
                    <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {useCases.length > 0 && (
            <section className="mt-10">
              <h2 className="font-display text-lg font-semibold">{d.useCases}</h2>
              <ul className="mt-4 grid max-w-[68ch] gap-2 sm:grid-cols-2">
                {useCases.map((f) => (
                  <li key={f} className="flex gap-2.5 rounded-xl bg-white/[0.02] px-3.5 py-2.5 text-sm ring-1 ring-line">
                    <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="mt-10">
            <h2 className="font-display text-lg font-semibold">{d.pricingTitle}</h2>
            <p className="mt-2 font-medium">{d.pricing[tool.pricingType]}</p>
            {pricingNote && <p className="mt-1 max-w-[68ch] text-muted">{pricingNote}</p>}
          </section>

          <p className="mt-12 text-xs text-faint">{d.aiDisclaimer}</p>
        </div>

        <aside className="space-y-6">
          <section className="panel p-5 text-sm">
            <h2 className="mb-4 font-display font-semibold">{d.facts}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 [&_dt]:text-faint">
              {tool.company && (<><dt className="text-muted">{d.company}</dt><dd>{tool.company}</dd></>)}
              {region && (<><dt className="text-muted">{d.origin}</dt><dd>{region}</dd></>)}
              {tool.platforms.length > 0 && (<><dt className="text-muted">{d.platformsLabel}</dt><dd>{tool.platforms.map((p) => d.platforms[p] ?? p).join(" / ")}</dd></>)}
              <dt className="text-muted">{d.filters.access}</dt><dd>{d.cnAccess[tool.cnAccess]}</dd>
              {tool.maturity != null && (<><dt className="text-muted">{d.maturity}</dt><dd aria-label={`${Math.round(tool.maturity)}/5`} className="flex items-center gap-1 pt-1.5">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-1.5 w-5 rounded-full ${i <= Math.round(tool.maturity!) ? "heat-fill" : "bg-white/10"}`} />)}</dd></>)}
              <dt className="text-muted">{d.listedAt}</dt><dd className="font-mono text-xs leading-6">{fmtDate(tool.listedAt, locale)}</dd>
              <dt className="text-muted">{d.checkedAt}</dt><dd className="font-mono text-xs leading-6">{tool.lastCheckedAt ? fmtDate(tool.lastCheckedAt, locale) : d.notChecked}</dd>
            </dl>
          </section>
          {similar.length > 0 && (
            <section>
              <div className="mb-1 flex items-baseline justify-between">
                <h2 className="font-display font-semibold">{d.similar}</h2>
                <Link href={href(locale, `/tool/${tool.slug}/alternatives`)} className="text-sm text-muted hover:text-accent">{d.seeAll}</Link>
              </div>
              <div className="panel p-1.5">
                {similar.slice(0, 5).map((s) => <ToolRow key={s.id} tool={s} locale={locale} />)}
              </div>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}
