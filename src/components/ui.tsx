import Link from "next/link";
import { Search } from "lucide-react";
import type { ToolCard } from "@/lib/queries";
import { href, L, t, type Locale } from "@/lib/i18n";

const NEW_MS = 7 * 24 * 3600_000;

export function ToolLogo({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const box = { width: size, height: size };
  if (src) {
    return (
      <span className="grid shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white/95 ring-1 ring-white/10" style={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={size} height={size} loading="lazy" className="h-[78%] w-[78%] object-contain" />
      </span>
    );
  }
  // Monogram: a stable hue from the name, rendered as a tinted glass tile.
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[10px] font-display font-semibold ring-1 ring-inset"
      style={{
        ...box,
        fontSize: size * 0.42,
        color: `hsl(${h} 85% 78%)`,
        background: `linear-gradient(145deg, hsl(${h} 60% 30% / 0.55), hsl(${h} 60% 18% / 0.55))`,
        boxShadow: `inset 0 0 0 1px hsl(${h} 70% 60% / 0.28)`,
      }}
    >
      {[...name.trim()][0]?.toUpperCase()}
    </span>
  );
}

export function AccessDot({ access, locale }: { access: ToolCard["cnAccess"]; locale: Locale }) {
  const color = { direct: "bg-accent shadow-[0_0_6px_var(--accent)]", unstable: "bg-warn", blocked: "bg-danger", unknown: "bg-faint" }[access];
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
    <span className={`rounded-md px-1.5 py-0.5 text-[11px] leading-4 ${strong ? "bg-accent-soft text-accent" : "text-muted ring-1 ring-line ring-inset"}`}>
      {t(locale).pricing[pricing]}
    </span>
  );
}

export function NewMark({ locale }: { locale: Locale }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-fresh">
      <span className="h-1.5 w-1.5 rounded-full bg-fresh shadow-[0_0_8px_var(--fresh)]" />
      {t(locale).newBadge}
    </span>
  );
}

/** Heat as a short bar: length = relative heat, colour runs cyan → violet. */
export function HeatBar({ value, max = 1 }: { value: number; max?: number }) {
  const pct = Math.max(4, Math.min(100, (value / (max || 1)) * 100));
  return (
    <span className="block h-1 w-full overflow-hidden rounded-full bg-white/5" aria-hidden>
      <span className="heat-fill block h-full rounded-full" style={{ width: `${pct}%` }} />
    </span>
  );
}

export function isNew(listedAt: string | null) {
  return !!listedAt && Date.now() - new Date(listedAt).getTime() < NEW_MS;
}

/** Compact row used in lists and category grids. */
export function ToolRow({ tool, locale, rank }: { tool: ToolCard; locale: Locale; rank?: number }) {
  return (
    <Link
      href={href(locale, `/tool/${tool.slug}`)}
      className="group relative flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-white/[0.035]"
    >
      {rank !== undefined && (
        <span className={`w-6 pt-2 text-right font-mono text-xs tabular-nums ${rank <= 3 ? "text-accent" : "text-faint"}`}>
          {String(rank).padStart(2, "0")}
        </span>
      )}
      <ToolLogo name={tool.name} src={tool.logoUrl} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-ink group-hover:text-accent">{tool.name}</span>
          {isNew(tool.listedAt) && <NewMark locale={locale} />}
        </span>
        <span className="mt-0.5 line-clamp-1 text-sm text-muted">{L(tool, "tagline", locale)}</span>
        <span className="mt-2 flex flex-wrap items-center gap-2.5">
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
    <form
      action={href(locale, "/search")}
      method="get"
      role="search"
      className={`group relative flex w-full items-center rounded-2xl bg-surface/80 ring-1 ring-line-strong backdrop-blur transition focus-within:ring-accent/70 focus-within:shadow-[0_0_0_4px_rgb(56_225_208/0.12),0_0_40px_-8px_rgb(56_225_208/0.45)] ${large ? "h-16 pl-5 pr-2" : "h-11 pl-3 pr-1.5"}`}
    >
      <Search aria-hidden className={`shrink-0 text-muted group-focus-within:text-accent ${large ? "h-5 w-5" : "h-4 w-4"}`} />
      <label className="sr-only" htmlFor={large ? "q-hero" : "q"}>{d.searchPlaceholder}</label>
      <input
        id={large ? "q-hero" : "q"}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder={d.searchPlaceholder}
        autoComplete="off"
        className={`min-w-0 flex-1 bg-transparent px-3 text-ink outline-none placeholder:text-faint ${large ? "text-lg" : "text-sm"}`}
      />
      <button
        type="submit"
        className={`shrink-0 rounded-xl bg-accent font-medium text-[#04201c] transition hover:brightness-110 ${large ? "h-12 px-6" : "h-8 px-3 text-sm"}`}
      >
        {d.searchButton}
      </button>
    </form>
  );
}

export function PageTitle({ title, intro, kicker }: { title: string; intro?: string; kicker?: React.ReactNode }) {
  return (
    <div className="mb-8">
      {kicker && <div className="mb-3 text-sm text-muted">{kicker}</div>}
      <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] sm:text-[2.6rem] sm:leading-tight">{title}</h1>
      {intro && <p className="mt-3 max-w-2xl text-muted">{intro}</p>}
    </div>
  );
}

/** Section heading with an optional right-side link. */
export function SectionHead({ title, href: link, linkLabel, meta }: { title: string; href?: string; linkLabel?: string; meta?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      <div className="flex items-center gap-4 text-sm text-muted">
        {meta}
        {link && (
          <Link href={link} className="hover:text-accent">
            {linkLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

export function fmtDate(iso: string | null | undefined, locale: Locale) {
  return iso ? t(locale).dateFmt(new Date(iso)) : "";
}
