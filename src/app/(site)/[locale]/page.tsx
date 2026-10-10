import type { Metadata } from "next";
import Link from "next/link";
import { SearchBox, ToolLogo, ToolRow } from "@/components/ui";
import { getCategoryTree, getHomeData } from "@/lib/queries";
import { href, L, t, type Locale } from "@/lib/i18n";
import { alternates } from "@/lib/seo";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: alternates(locale, "/") };
}

function timeLabel(iso: string | null, locale: Locale) {
  if (!iso) return "";
  const d = new Date(iso);
  const hours = (Date.now() - d.getTime()) / 3600_000;
  if (hours < 24) return d.toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" });
}

export default async function Home({ params }: Props) {
  const { locale } = await params;
  const d = t(locale);
  const [home, tree] = await Promise.all([getHomeData(locale), getCategoryTree()]);

  return (
    <>
      <section className="grid gap-10 pb-12 lg:grid-cols-[1fr_340px] lg:gap-14">
        <div className="pt-4 lg:pt-10">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">{d.heroTitle}</h1>
          <p className="mt-4 max-w-xl text-muted">{d.heroHint}</p>
          <div className="mt-6 max-w-2xl">
            <SearchBox locale={locale} large />
          </div>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label={locale === "zh" ? "常用任务" : "Popular tasks"}>
            {d.quickTasks.map(([label, cat, sub]) => (
              <li key={label}>
                <Link
                  href={`${href(locale, `/category/${cat}`)}${sub ? `?sub=${sub}` : ""}`}
                  className="inline-block rounded-full bg-surface px-3 py-1 text-sm ring-1 ring-line hover:ring-ink"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* The ledger: what came in most recently, with times — this site's reason to exist. */}
        <aside aria-labelledby="ledger-title" className="rounded-xl border border-line bg-surface">
          <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
            <h2 id="ledger-title" className="flex items-center gap-2 font-display font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fresh opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-fresh" />
              </span>
              {d.newToday}
            </h2>
            <Link href={href(locale, "/new")} className="text-sm text-muted hover:text-ink">{d.seeAll}</Link>
          </div>
          {!home.freshIsToday && <p className="px-4 pt-3 text-xs text-muted">{d.newTodayEmpty}</p>}
          <ol className="px-2 py-2">
            {home.fresh.slice(0, 7).map((tool, i) => (
              <li key={tool.id} className="ledger-row" style={{ animationDelay: `${i * 60}ms` }}>
                <Link href={href(locale, `/tool/${tool.slug}`)} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-canvas">
                  <span className="w-12 shrink-0 text-xs tabular-nums text-muted">{timeLabel(tool.listedAt, locale)}</span>
                  <ToolLogo name={tool.name} src={tool.logoUrl} size={24} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{tool.name}</span>
                    <span className="block truncate text-xs text-muted">{L(tool, "tagline", locale)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section aria-labelledby="hot-title" className="border-t border-line pt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="hot-title" className="font-display text-xl font-semibold">{d.hotThisWeek}</h2>
          <Link href={href(locale, "/rank")} className="text-sm text-muted hover:text-ink">{d.seeAll}</Link>
        </div>
        <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
          {home.hot.map((tool, i) => (
            <ToolRow key={tool.id} tool={tool} locale={locale} rank={i + 1} />
          ))}
        </div>
      </section>

      <section aria-labelledby="cats-title" className="mt-12">
        <h2 id="cats-title" className="sr-only">{d.allCategories}</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {tree.map((cat) => {
            const list = home.perCategory[cat.id] ?? [];
            if (!list.length) return null;
            return (
              <article key={cat.id} className="rounded-xl border border-line bg-surface p-4">
                <header className="mb-1 flex items-baseline justify-between gap-3 px-2">
                  <h3 className="font-display text-lg font-semibold">
                    <Link href={href(locale, `/category/${cat.slug}`)} className="hover:underline">{L(cat, "name", locale)}</Link>
                  </h3>
                  <span className="text-sm text-muted tabular-nums">{cat.toolCount} {d.tools}</span>
                </header>
                {cat.children.length > 0 && (
                  <p className="mb-2 flex flex-wrap gap-x-3 gap-y-1 px-2 text-sm text-muted">
                    {cat.children.map((c) => (
                      <Link key={c.id} href={`${href(locale, `/category/${cat.slug}`)}?sub=${c.slug}`} className="hover:text-ink">
                        {L(c, "name", locale)}
                      </Link>
                    ))}
                  </p>
                )}
                <div className="grid sm:grid-cols-2">
                  {list.map((tool) => <ToolRow key={tool.id} tool={tool} locale={locale} />)}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
