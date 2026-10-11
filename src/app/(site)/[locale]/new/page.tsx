import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle, ToolRow } from "@/components/ui";
import { getNewTools } from "@/lib/queries";
import { href, t, type Locale } from "@/lib/i18n";
import { alternates } from "@/lib/seo";

type Props = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: t(locale).newTitle, alternates: alternates(locale, "/new") };
}

export default async function NewPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const page = Math.max(0, Math.min(50, Number((await searchParams).page ?? 0) || 0));
  const d = t(locale);
  const rows = await getNewTools(page);

  // Group by listing day.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.listedAt ? d.dateFmt(new Date(r.listedAt)) : "—";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return (
    <>
      <PageTitle title={d.newTitle} intro={d.newIntro} />
      <div className="space-y-8">
        {[...groups.entries()].map(([day, list]) => (
          <section key={day} aria-label={day}>
            <h2 className="mb-2 font-display text-lg font-semibold tabular-nums">{day}</h2>
            <div className="grid panel p-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((tool) => <ToolRow key={tool.id} tool={tool} locale={locale} />)}
            </div>
          </section>
        ))}
      </div>
      <nav className="mt-8 flex justify-between text-sm">
        {page > 0 ? <Link href={`${href(locale, "/new")}?page=${page - 1}`} className="underline">{locale === "zh" ? "较新" : "Newer"}</Link> : <span />}
        {rows.length === 60 && <Link href={`${href(locale, "/new")}?page=${page + 1}`} className="underline">{locale === "zh" ? "更早" : "Older"}</Link>}
      </nav>
    </>
  );
}
