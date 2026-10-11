import type { Metadata } from "next";
import Link from "next/link";
import { CategoryIcon } from "@/components/CategoryIcon";
import { PageTitle } from "@/components/ui";
import { getCategoryTree } from "@/lib/queries";
import { href, L, t, type Locale } from "@/lib/i18n";
import { alternates } from "@/lib/seo";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: t(locale).allCategories, alternates: alternates(locale, "/categories") };
}

export default async function CategoriesPage({ params }: Props) {
  const { locale } = await params;
  const d = t(locale);
  const tree = await getCategoryTree();
  return (
    <>
      <PageTitle title={d.allCategories} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tree.map((c) => (
          <section key={c.id} className="panel p-5">
            <h2 className="flex items-center justify-between gap-2">
              <Link href={href(locale, `/category/${c.slug}`)} className="flex items-center gap-3 font-display text-lg font-semibold hover:text-accent">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent ring-1 ring-accent/20">
                  <CategoryIcon slug={c.slug} className="h-[18px] w-[18px]" />
                </span>
                {L(c, "name", locale)}
              </Link>
              <span className="font-mono text-xs text-faint tabular-nums">{c.toolCount}</span>
            </h2>
            <p className="mt-1 text-sm text-muted">{L(c, "description", locale)}</p>
            {c.children.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {c.children.map((s) => (
                  <li key={s.id}>
                    <Link href={`${href(locale, `/category/${c.slug}`)}?sub=${s.slug}`} className="text-muted hover:text-accent">{L(s, "name", locale)}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
