import type { Metadata } from "next";
import { PageTitle, ToolRow } from "@/components/ui";
import { getChinaTools } from "@/lib/queries";
import { t, type Locale } from "@/lib/i18n";
import { alternates } from "@/lib/seo";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: t(locale).chinaTitle, description: t(locale).chinaIntro, alternates: alternates(locale, "/china-ai") };
}

export default async function ChinaAiPage({ params }: Props) {
  const { locale } = await params;
  const d = t(locale);
  const rows = await getChinaTools(locale);
  return (
    <>
      <PageTitle title={d.chinaTitle} intro={d.chinaIntro} />
      <div className="grid rounded-xl border border-line bg-surface p-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((tool) => (
          <div key={tool.id}>
            <ToolRow tool={tool} locale={locale} />
            {tool.globalUrl && (
              <a href={`/go/${tool.slug}?v=global`} rel="nofollow noopener" target="_blank" className="mb-2 ml-[3.75rem] inline-block text-xs text-accent hover:underline">
                {d.globalVersion}
              </a>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
