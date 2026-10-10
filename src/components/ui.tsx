import Link from "next/link";
import type { ToolCard } from "@/lib/queries";
import { href, L, t, type Locale } from "@/lib/i18n";

const NEW_MS = 7 * 24 * 3600_000;

export function ToolLogo({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-lg border border-line bg-surface object-contain" style={{ width: size, height: size }} />;
  }
  // Monogram fallback: stable hue from the name so the grid doesn't look uniform.
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-lg font-display font-semibold text-white"
      style={{ width: size, height: size, background: `hsl(${h} 45% 42%)`, fontSize: size * 0.42 }}
    >
      {[...name.trim()][0]?.toUpperCase()}
    </span>
  );
}

export function AccessDot({ access, locale }: { access: ToolCard["cnAccess"]; locale: Locale }) {
  const color = { direct: "bg-accent", unstable: "bg-warn", blocked: "bg-danger", unknown: "bg-line" }[access];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={t(locale).cnAccess[access]}>
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {t(locale).cnAccessShort[access]}
    </span>
  );
}

export function PriceTag({ pricing, locale }: { pricing: ToolCard["pricingType"]; locale: Locale }) {
  const strong = pricing === "free";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${strong ? "bg-accent-soft text-accent" : "text-muted ring-1 ring-line ring-inset"}`}>
      {t(locale).pricing[pricing]}
    </span>
  );
}

function isNew(listedAt: string | null) {
  return !!listedAt && Date.now() - new Date(listedAt).getTime() < NEW_MS;
}

/** Compact row used in lists and category grids. */
export function ToolRow({ tool, locale, rank }: { tool: ToolCard; locale: Locale; rank?: number }) {
  const d = t(locale);
  return (
    <Link
      href={href(locale, `/tool/${tool.slug}`)}
      className="group flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-canvas"
    >
      {rank !== undefined && <span className="w-5 pt-1.5 text-right font-display text-sm tabular-nums text-muted">{rank}</span>}
      <ToolLogo name={tool.name} src={tool.logoUrl} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium group-hover:underline">{tool.name}</span>
          {isNew(tool.listedAt) && (
            <span className="inline-flex items-center gap-1 text-xs text-fresh">
              <span className="h-1.5 w-1.5 rounded-full bg-fresh" />
              {d.newBadge}
            </span>
          )}
        </span>
        <span className="mt-0.5 line-clamp-1 text-sm text-muted">{L(tool, "tagline", locale)}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          <PriceTag pricing={tool.pricingType} locale={locale} />
          <AccessDot access={tool.cnAccess} locale={locale} />
        </span>
      </span>
    </Link>
  );
}

export function SearchBox({ locale, defaultValue, large }: { locale: Locale; defaultValue?: string; large?: boolean }) {
  const d = t(locale);
  return (
    <form action={href(locale, "/search")} method="get" role="search" className="flex w-full gap-2">
      <label className="sr-only" htmlFor={large ? "q-hero" : "q"}>{d.searchPlaceholder}</label>
      <input
        id={large ? "q-hero" : "q"}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder={d.searchPlaceholder}
        autoComplete="off"
        className={`min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-ink placeholder:text-muted ${large ? "h-14 text-lg" : "h-10"}`}
      />
      <button
        type="submit"
        className={`shrink-0 rounded-lg bg-ink px-4 font-medium text-canvas hover:opacity-90 ${large ? "h-14 px-6 text-lg" : "h-10"}`}
      >
        {d.searchButton}
      </button>
    </form>
  );
}

export function PageTitle({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {intro && <p className="mt-2 max-w-2xl text-muted">{intro}</p>}
    </div>
  );
}

export function fmtDate(iso: string | null | undefined, locale: Locale) {
  return iso ? t(locale).dateFmt(new Date(iso)) : "";
}
