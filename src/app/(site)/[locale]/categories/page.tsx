import type { Metadata } from "next";
import Link from "next/link";
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
          <section key={c.id} className="rounded-xl border border-line bg-surface p-4">
            <h2 className="flex items-baseline justify-between gap-2">
              <Link href={href(locale, `/category/${c.slug}`)} className="font-display text-lg font-semibold hover:underline">{L(c, "name", locale)}</Link>
              <span className="text-sm text-muted tabular-nums">{c.toolCount}</span>
            </h2>
            <p className="mt-1 text-sm text-muted">{L(c, "description", locale)}</p>
            {c.children.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {c.children.map((s) => (
                  <li key={s.id}>
                    <Link href={`${href(locale, `/category/${c.slug}`)}?sub=${s.slug}`} className="hover:underline">{L(s, "name", locale)}</Link>
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
