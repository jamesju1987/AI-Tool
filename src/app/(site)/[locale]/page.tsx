import type { Metadata } from "next";
import Link from "next/link";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Radar } from "@/components/Radar";
import { HeatBar, isNew, NewMark, SearchBox, SectionHead, ToolLogo, ToolRow } from "@/components/ui";
import { getCategoryTree, getHomeData } from "@/lib/queries";
import { href, L, t, type Locale } from "@/lib/i18n";
import { alternates } from "@/lib/seo";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: alternates(locale, "/") };
}

function clock(iso: string | null, locale: Locale) {
  if (!iso) return "";
  const d = new Date(iso);
  const hours = (Date.now() - d.getTime()) / 3600_000;
  const loc = locale === "zh" ? "zh-CN" : "en-US";
  if (hours < 24) return d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toLocaleDateString(loc, { month: "2-digit", day: "2-digit" });
}

const minutesSince = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)) : null);

export default async function Home({ params }: Props) {
  const { locale } = await params;
  const d = t(locale);
  const [home, tree] = await Promise.all([getHomeData(locale), getCategoryTree()]);
  const lastUpdate = [home.stats.lastListed, home.stats.lastChecked].filter(Boolean).sort().at(-1) ?? null;
  const updatedMins = minutesSince(lastUpdate);
  const maxHeat = Math.max(...home.hot.map((h) => h.heatScore), 1e-6);

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="grid items-center gap-10 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-6 [&>*]:min-w-0">
        <div>
          <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-surface/70 px-3 py-1 text-xs text-muted ring-1 ring-line">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            {locale === "zh"
              ? `已收录 ${home.stats.listed} 个工具${updatedMins !== null ? `，${d.ago(updatedMins)}更新` : ""}`
              : `${home.stats.listed} tools tracked${updatedMins !== null ? `, updated ${d.ago(updatedMins)}` : ""}`}
          </p>
          <h1 className="font-display text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[4.2rem]">
            {d.heroTitle}
          </h1>
          <p className="mt-5 max-w-lg text-[1.05rem] text-muted">{d.heroHint}</p>
          <div className="mt-8 max-w-xl">
            <SearchBox locale={locale} large />
          </div>
          <ul className="mt-5 flex max-w-xl flex-wrap gap-2" aria-label={locale === "zh" ? "常用任务" : "Popular tasks"}>
            {d.quickTasks.map(([label, cat, sub]) => (
              <li key={label}>
                <Link
                  href={`${href(locale, `/category/${cat}`)}${sub ? `?sub=${sub}` : ""}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.03] px-3 py-1.5 text-sm text-muted ring-1 ring-line transition hover:bg-accent-soft hover:text-accent hover:ring-accent/40"
                >
                  <CategoryIcon slug={cat} className="h-3.5 w-3.5" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>

          <dl className="mt-12 grid max-w-xl grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line ring-1 ring-line sm:grid-cols-4">
            {[
              [d.stats.listed, String(home.stats.listed)],
              [d.stats.week, `+${home.stats.week}`],
              [d.stats.categories, String(home.stats.categories)],
              [d.stats.updated, updatedMins === null ? "—" : d.ago(updatedMins)],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface px-4 py-3.5">
                <dt className="text-xs text-faint">{label}</dt>
                <dd className="mt-1 font-mono text-lg font-medium tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <figure className="relative mx-auto w-full max-w-[600px]">
          <Radar points={home.radar} categories={tree} locale={locale} />
          <figcaption className="mt-2 text-center text-xs text-faint">{d.radarCaption}</figcaption>
        </figure>
      </section>

      {/* ---------------------------------------------------------------- live feed + trending */}
      <section className="grid gap-6 lg:grid-cols-[1fr_1.35fr] [&>*]:min-w-0">
        <div className="panel p-5">
          <SectionHead
            title={d.newToday}
            href={href(locale, "/new")}
            linkLabel={d.seeAll}
          />
          {!home.freshIsToday && <p className="-mt-2 mb-3 text-xs text-faint">{d.newTodayEmpty}</p>}
          <ol className="relative space-y-0.5 before:absolute before:bottom-3 before:left-[calc(3.5rem+3px)] before:top-3 before:w-px before:bg-line">
            {home.fresh.slice(0, 7).map((tool, i) => (
              <li key={tool.id} className="ledger-row" style={{ animationDelay: `${i * 70}ms` }}>
                <Link href={href(locale, `/tool/${tool.slug}`)} className="group relative flex items-center gap-3 rounded-lg py-2 pr-2">
                  <span className="w-11 shrink-0 text-right font-mono text-[11px] tabular-nums text-faint">{clock(tool.listedAt, locale)}</span>
                  <span className={`relative z-10 h-2 w-2 shrink-0 rounded-full ring-4 ring-surface ${isNew(tool.listedAt) ? "bg-fresh" : "bg-faint"}`} />
                  <ToolLogo name={tool.name} src={tool.logoUrl} size={28} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium group-hover:text-accent">{tool.name}</span>
                    <span className="block truncate text-xs text-muted">{L(tool, "tagline", locale)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>

        <div className="panel p-5">
          <SectionHead title={d.hotThisWeek} href={href(locale, "/rank")} linkLabel={d.seeAll} />
          <ol className="grid gap-x-6 sm:grid-cols-2">
            {home.hot.map((tool, i) => (
              <li key={tool.id}>
                <Link href={href(locale, `/tool/${tool.slug}`)} className="group flex items-center gap-3 rounded-lg px-1 py-2.5">
                  <span className={`w-6 font-mono text-xs tabular-nums ${i < 3 ? "text-accent" : "text-faint"}`}>{String(i + 1).padStart(2, "0")}</span>
                  <ToolLogo name={tool.name} src={tool.logoUrl} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium group-hover:text-accent">{tool.name}</span>
                      {isNew(tool.listedAt) && <NewMark locale={locale} />}
                    </span>
                    <span className="mt-1.5 block">
                      <HeatBar value={tool.heatScore} max={maxHeat} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- categories */}
      <section aria-labelledby="cats-title" className="mt-16">
        <SectionHead title={d.allCategories} href={href(locale, "/categories")} linkLabel={d.browseAll} />
        <h2 id="cats-title" className="sr-only">{d.allCategories}</h2>
        <div className="grid gap-5 md:grid-cols-2 [&>*]:min-w-0">
          {tree.map((cat) => {
            const list = home.perCategory[cat.id] ?? [];
            if (!list.length) return null;
            return (
              <article key={cat.id} className="panel group/card p-5 transition-colors hover:border-line-strong">
                <header className="flex items-start justify-between gap-3">
                  <Link href={href(locale, `/category/${cat.slug}`)} className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent ring-1 ring-accent/20">
                      <CategoryIcon slug={cat.slug} className="h-[18px] w-[18px]" />
                    </span>
                    <span>
                      <h3 className="font-display text-lg font-semibold tracking-tight group-hover/card:text-ink">{L(cat, "name", locale)}</h3>
                      <span className="block text-xs text-faint">{L(cat, "description", locale)}</span>
                    </span>
                  </Link>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-faint">{cat.toolCount}</span>
                </header>
                {cat.children.length > 0 && (
                  <p className="mt-4 flex flex-wrap gap-1.5">
                    {cat.children.map((c) => (
                      <Link
                        key={c.id}
                        href={`${href(locale, `/category/${cat.slug}`)}?sub=${c.slug}`}
                        className="rounded-md px-2 py-0.5 text-xs text-muted ring-1 ring-line transition hover:text-accent hover:ring-accent/40"
                      >
                        {L(c, "name", locale)}
                      </Link>
                    ))}
                  </p>
                )}
                <div className="-mx-3 mt-3 grid sm:grid-cols-2">
                  {list.slice(0, 6).map((tool) => <ToolRow key={tool.id} tool={tool} locale={locale} />)}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
