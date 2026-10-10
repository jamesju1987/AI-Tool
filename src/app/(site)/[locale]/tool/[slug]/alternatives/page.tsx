import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AccessDot, PriceTag, ToolLogo } from "@/components/ui";
import { getToolPage } from "@/lib/queries";
import { href, L, t, type Locale } from "@/lib/i18n";
import { alternates } from "@/lib/seo";

type Props = { params: Promise<{ locale: Locale; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const data = await getToolPage(slug, locale);
  if (!data || data.redirectTo !== undefined) return {};
  const n = data.similar.length;
  return {
    title: locale === "zh" ? `${data.tool.name} 的 ${n} 个替代品` : `${n} ${data.tool.name} alternatives`,
    alternates: alternates(locale, `/tool/${slug}/alternatives`),
  };
}

export default async function AlternativesPage({ params }: Props) {
  const { locale, slug } = await params;
  const data = await getToolPage(slug, locale);
  if (!data) notFound();
  if (data.redirectTo !== undefined) {
    if (!data.redirectTo) notFound();
    permanentRedirect(href(locale, `/tool/${data.redirectTo}/alternatives`));
  }
  const d = t(locale);
  const { tool, similar } = data;
  const rows = [tool, ...similar];

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
        <Link href={href(locale, `/tool/${tool.slug}`)} className="hover:text-ink">{tool.name}</Link>
        <span className="mx-2">/</span>
        <span>{d.alternatives}</span>
      </nav>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {locale === "zh" ? `${tool.name} 的替代品` : `${tool.name} alternatives`}
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        {locale === "zh"
          ? `和 ${tool.name} 同类的 ${similar.length} 个工具，按综合排名排序，对比定价、国内访问和中文支持。`
          : `${similar.length} tools in the same category as ${tool.name}, ranked, with pricing, China access and Chinese-language support side by side.`}
      </p>

      <div className="mt-8 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">{locale === "zh" ? "工具" : "Tool"}</th>
              <th scope="col" className="px-4 py-3 font-medium">{d.filters.pricing}</th>
              <th scope="col" className="px-4 py-3 font-medium">{d.filters.access}</th>
              <th scope="col" className="px-4 py-3 font-medium">{d.filters.cnUi}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={`border-b border-line last:border-0 ${i === 0 ? "bg-canvas/60" : ""}`}>
                <td className="px-4 py-3">
                  <Link href={href(locale, `/tool/${r.slug}`)} className="flex items-center gap-3 hover:underline">
                    <ToolLogo name={r.name} src={r.logoUrl} size={28} />
                    <span>
                      <span className="block font-medium">{r.name}</span>
                      <span className="block text-muted">{L(r, "tagline", locale)}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3"><PriceTag pricing={r.pricingType} locale={locale} /></td>
                <td className="px-4 py-3"><AccessDot access={r.cnAccess} locale={locale} /></td>
                <td className="px-4 py-3">{r.hasCnUi ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
