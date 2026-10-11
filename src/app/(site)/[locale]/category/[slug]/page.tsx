import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ToolRow } from "@/components/ui";
import { getCategoryPage, type ToolFilters } from "@/lib/queries";
import { href, L, t, type Locale } from "@/lib/i18n";
import { alternates } from "@/lib/seo";

type SP = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ locale: Locale; slug: string }>; searchParams: Promise<SP> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function parseFilters(sp: SP): ToolFilters {
  const sort = one(sp.sort);
  return {
    sub: one(sp.sub),
    pricing: one(sp.pricing),
    access: one(sp.access),
    platform: one(sp.platform),
    openSource: one(sp.os) === "1",
    cnUi: one(sp.cnui) === "1",
    sort: sort === "new" || sort === "heat" ? sort : "rank",
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = await getCategoryPage(slug, locale, {});
  if (!page) return {};
  const name = L(page.category, "name", locale);
  const month = new Date().toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "long" });
  return {
    title: locale === "zh" ? `${month}好用的${name}工具` : `Best ${name} tools (${month})`,
    description: L(page.category, "description", locale),
    alternates: alternates(locale, `/category/${slug}`),
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const sp = await searchParams;
  const f = parseFilters(sp);
  const page = await getCategoryPage(slug, locale, f);
  if (!page) notFound();
  const d = t(locale);
  const base = href(locale, `/category/${slug}`);

  const current: Record<string, string> = {};
  for (const k of ["sub", "pricing", "access", "platform", "os", "cnui", "sort"]) {
    const v = one(sp[k]);
    if (v) current[k] = v;
  }
  const link = (patch: Record<string, string | undefined>) => {
    const next = { ...current, ...patch };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]).toString();
    return qs ? `${base}?${qs}` : base;
  };
  const hasFilters = ["pricing", "access", "platform", "os", "cnui"].some((k) => current[k]);

  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full px-3 py-1 text-sm transition ${active ? "bg-accent-soft text-accent ring-1 ring-accent/50" : "bg-white/[0.03] text-muted ring-1 ring-line hover:text-ink hover:ring-line-strong"}`;

  const groups: { key: string; label: string; options: [string, string][] }[] = [
    { key: "pricing", label: d.filters.pricing, options: Object.entries(d.pricing).filter(([k]) => k !== "unknown") },
    { key: "access", label: d.filters.access, options: Object.entries(d.cnAccessShort).filter(([k]) => k !== "unknown") },
    { key: "platform", label: d.filters.platform, options: Object.entries(d.platforms) },
  ];

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-faint">
        <Link href={href(locale, "/")} className="hover:text-ink">{d.siteName}</Link>
        <span className="mx-2">/</span>
        {page.sub ? (
          <Link href={base} className="hover:text-ink">{L(page.category, "name", locale)}</Link>
        ) : (
          <span className="text-muted">{L(page.category, "name", locale)}</span>
        )}
      </nav>
      <div className="flex items-center gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent ring-1 ring-accent/25 shadow-[0_0_30px_-6px_rgb(56_225_208/0.5)]">
          <CategoryIcon slug={page.category.slug} className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] sm:text-[2.4rem]">
            {L(page.sub ?? page.category, "name", locale)}
          </h1>
          {page.category.descriptionZh && <p className="mt-1 text-muted">{L(page.category, "description", locale)}</p>}
        </div>
      </div>

      {page.category.children.length > 0 && (
        <div role="tablist" className="mt-6 flex gap-2 overflow-x-auto pb-1">
          <Link role="tab" aria-selected={!page.sub} href={link({ sub: undefined })} className={chip(!page.sub)}>{d.all}</Link>
          {page.category.children.map((c) => (
            <Link key={c.id} role="tab" aria-selected={page.sub?.id === c.id} href={link({ sub: c.slug })} className={chip(page.sub?.id === c.id)}>
              {L(c, "name", locale)}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside aria-label={locale === "zh" ? "筛选" : "Filters"} className="space-y-5 text-sm">
          {groups.map((g) => (
            <fieldset key={g.key}>
              <legend className="mb-2.5 text-xs text-faint">{g.label}</legend>
              <div className="flex flex-wrap gap-1.5">
                <Link href={link({ [g.key]: undefined })} className={chip(!current[g.key])}>{d.filters.any}</Link>
                {g.options.map(([v, label]) => (
                  <Link key={v} href={link({ [g.key]: current[g.key] === v ? undefined : v })} className={chip(current[g.key] === v)}>
                    {label}
                  </Link>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-1.5">
            <Link href={link({ os: current.os ? undefined : "1" })} className={chip(!!current.os)}>{d.filters.openSource}</Link>
            <Link href={link({ cnui: current.cnui ? undefined : "1" })} className={chip(!!current.cnui)}>{d.filters.cnUi}</Link>
          </div>
          {hasFilters && (
            <Link href={link({ pricing: undefined, access: undefined, platform: undefined, os: undefined, cnui: undefined })} className="inline-block text-muted underline hover:text-ink">
              {d.filters.clear}
            </Link>
          )}
        </aside>

        <section>
          <div className="mb-2 flex items-center justify-between gap-4 text-sm">
            <span className="font-mono text-xs text-faint tabular-nums">{page.tools.length} {d.tools}</span>
            <span className="flex items-center gap-1">
              <span className="mr-1 text-xs text-faint">{d.sort.label}</span>
              {(["rank", "new", "heat"] as const).map((s) => (
                <Link key={s} href={link({ sort: s === "rank" ? undefined : s })} className={chip((f.sort ?? "rank") === s)}>
                  {d.sort[s]}
                </Link>
              ))}
            </span>
          </div>
          <div className="grid panel p-2 sm:grid-cols-2">
            {page.tools.map((tool, i) => (
              <ToolRow key={tool.id} tool={tool} locale={locale} rank={f.sort === "rank" && !hasFilters ? i + 1 : undefined} />
            ))}
            {page.tools.length === 0 && (
              <p className="col-span-full p-6 text-muted">
                {locale === "zh" ? "没有符合条件的工具。" : "No tools match these filters."}{" "}
                <Link href={base} className="underline">{d.filters.clear}</Link>
              </p>
            )}
          </div>
          {page.tieAtTop && f.sort === "rank" && <p className="mt-2 text-xs text-muted">1–2: {d.tieTop}</p>}
        </section>
      </div>
    </>
  );
}
