import type { Metadata } from "next";
import { PageTitle, ToolRow } from "@/components/ui";
import { getTrending } from "@/lib/queries";
import { t, type Locale } from "@/lib/i18n";
import { alternates } from "@/lib/seo";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: t(locale).rankTitle, alternates: alternates(locale, "/rank") };
}

export default async function RankPage({ params }: Props) {
  const { locale } = await params;
  const d = t(locale);
  const rows = await getTrending();
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: rows.map((r, i) => ({ "@type": "ListItem", position: i + 1, name: r.name })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, "\\u003c") }} />
      <PageTitle title={d.rankTitle} intro={d.rankIntro} />
      <ol className="grid panel p-2 sm:grid-cols-2">
        {rows.map((tool, i) => (
          <li key={tool.id}><ToolRow tool={tool} locale={locale} rank={i + 1} /></li>
        ))}
      </ol>
    </>
  );
}
