import type { Metadata } from "next";
import Link from "next/link";
import { SearchBox, ToolRow } from "@/components/ui";
import { getCategoryTree, searchTools } from "@/lib/queries";
import { href, L, t, type Locale } from "@/lib/i18n";

type Props = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ q?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: t(locale).searchButton, robots: { index: false, follow: true } };
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw ?? "").trim();
  const d = t(locale);
  const results = q ? await searchTools(q, locale) : [];
  const tree = results.length ? [] : await getCategoryTree();

  return (
    <>
      <div className="max-w-2xl">
        <SearchBox locale={locale} defaultValue={q} />
      </div>
      {q && (
        <h1 className="mt-6 font-display text-2xl font-semibold" aria-live="polite">
          {d.searchResults(q, results.length)}
        </h1>
      )}
      {results.length > 0 ? (
        <div className="mt-4 grid rounded-xl border border-line bg-surface p-2 sm:grid-cols-2">
          {results.map((tool) => <ToolRow key={tool.id} tool={tool} locale={locale} />)}
        </div>
      ) : (
        q && (
          <div className="mt-4">
            <p className="text-muted">{d.searchEmpty}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {tree.map((c) => (
                <li key={c.id}>
                  <Link href={href(locale, `/category/${c.slug}`)} className="inline-block rounded-full bg-surface px-3 py-1 text-sm ring-1 ring-line hover:ring-ink">
                    {L(c, "name", locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </>
  );
}
