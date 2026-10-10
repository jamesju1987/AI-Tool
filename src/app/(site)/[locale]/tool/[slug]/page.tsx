import type { Metadata } from "next";
import Link from "next/link";
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

      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
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

      {offline && <p className="mb-6 rounded-lg border border-danger/40 bg-surface p-3 text-sm text-danger">{d.offlineNotice}</p>}

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <header className="flex items-start gap-4">
            <ToolLogo name={tool.name} src={tool.logoUrl} size={64} />
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{tool.name}</h1>
              <p className="mt-1 text-lg text-muted">{L(tool, "tagline", locale)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <PriceTag pricing={tool.pricingType} locale={locale} />
                <AccessDot access={tool.cnAccess} locale={locale} />
                {tool.openSource && <span className="text-xs text-muted">{d.openSourceYes}</span>}
                {tool.hasCnUi && <span className="text-xs text-muted">{d.cnUiYes}</span>}
                {tool.hasEnterprise && <span className="text-xs text-muted">{d.enterpriseYes}</span>}
              </div>
            </div>
          </header>

          {rank && primary && (
            <p className="mt-5 text-sm">
              <Link href={href(locale, `/category/${parent?.slug ?? primary.slug}`) + (parent ? `?sub=${primary.slug}` : "")} className="font-medium underline-offset-2 hover:underline">
                {d.rankIn(catName, rank)}
              </Link>
              {tieAtTop && <span className="ml-2 text-muted">({d.tieTop})</span>}
            </p>
          )}

          {!offline && (
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={`/go/${tool.slug}`} rel="nofollow noopener" target="_blank" className="inline-flex h-11 items-center rounded-lg bg-ink px-5 font-medium text-canvas hover:opacity-90">
                {d.visit}
              </a>
              {tool.globalUrl && (
                <a href={`/go/${tool.slug}?v=global`} rel="nofollow noopener" target="_blank" className="inline-flex h-11 items-center rounded-lg px-5 font-medium ring-1 ring-line hover:ring-ink">
                  {d.globalVersion}
                </a>
              )}
            </div>
          )}

          {tool.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tool.imageUrl} alt="" loading="lazy" className="mt-8 w-full rounded-xl border border-line bg-surface" />
          )}

          {L(tool, "description", locale) && <p className="mt-8 max-w-[68ch] text-[1.05rem]">{L(tool, "description", locale)}</p>}

          {features.length > 0 && (
            <section className="mt-8">
              <h2 className="font-display text-xl font-semibold">{d.features}</h2>
              <ul className="mt-3 max-w-[68ch] list-disc space-y-1.5 pl-5">
                {features.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </section>
          )}
          {useCases.length > 0 && (
            <section className="mt-8">
              <h2 className="font-display text-xl font-semibold">{d.useCases}</h2>
              <ul className="mt-3 max-w-[68ch] list-disc space-y-1.5 pl-5">
                {useCases.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </section>
          )}
          <section className="mt-8">
            <h2 className="font-display text-xl font-semibold">{d.pricingTitle}</h2>
            <p className="mt-2 font-medium">{d.pricing[tool.pricingType]}</p>
            {pricingNote && <p className="mt-1 max-w-[68ch] text-muted">{pricingNote}</p>}
          </section>

          <p className="mt-10 text-xs text-muted">{d.aiDisclaimer}</p>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border border-line bg-surface p-4 text-sm">
            <h2 className="mb-3 font-display font-semibold">{d.facts}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              {tool.company && (<><dt className="text-muted">{d.company}</dt><dd>{tool.company}</dd></>)}
              {region && (<><dt className="text-muted">{d.origin}</dt><dd>{region}</dd></>)}
              {tool.platforms.length > 0 && (<><dt className="text-muted">{d.platformsLabel}</dt><dd>{tool.platforms.map((p) => d.platforms[p] ?? p).join(" / ")}</dd></>)}
              <dt className="text-muted">{d.filters.access}</dt><dd>{d.cnAccess[tool.cnAccess]}</dd>
              {tool.maturity != null && (<><dt className="text-muted">{d.maturity}</dt><dd aria-label={`${Math.round(tool.maturity)}/5`}>{"●".repeat(Math.round(tool.maturity))}<span className="text-line">{"●".repeat(5 - Math.round(tool.maturity))}</span></dd></>)}
              <dt className="text-muted">{d.listedAt}</dt><dd>{fmtDate(tool.listedAt, locale)}</dd>
              <dt className="text-muted">{d.checkedAt}</dt><dd>{tool.lastCheckedAt ? fmtDate(tool.lastCheckedAt, locale) : d.notChecked}</dd>
            </dl>
          </section>
          {similar.length > 0 && (
            <section>
              <div className="mb-1 flex items-baseline justify-between">
                <h2 className="font-display font-semibold">{d.similar}</h2>
                <Link href={href(locale, `/tool/${tool.slug}/alternatives`)} className="text-sm text-muted hover:text-ink">{d.seeAll}</Link>
              </div>
              <div className="-mx-2">
                {similar.slice(0, 5).map((s) => <ToolRow key={s.id} tool={s} locale={locale} />)}
              </div>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}
