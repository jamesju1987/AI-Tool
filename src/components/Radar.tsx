import { href, L, type Locale } from "@/lib/i18n";
import type { Category } from "@/db/schema";

export type RadarPoint = { id: number; slug: string; name: string; heat: number; top: number; listedAt: string | null };

const SIZE = 640;
const C = SIZE / 2;
const R_MAX = 220;
const R_MIN = 58;
const NEW_MS = 7 * 24 * 3600_000;

function hash(n: number) {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 16;
  return (x % 10000) / 10000;
}

/** Cyan (cool) → violet (hot). */
function heatColor(t: number) {
  const a = [56, 225, 208];
  const b = [139, 124, 255];
  const m = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${m(0)} ${m(1)} ${m(2)})`;
}

const isFresh = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() < NEW_MS;

const polar = (r: number, ang: number) => [C + r * Math.cos(ang), C + r * Math.sin(ang)] as const;

/**
 * The landscape at a glance: one sector per top-level category, one dot per listed tool.
 * Hotter tools sit closer to the centre; tools added in the last 7 days pulse amber.
 */
export function Radar({ points, categories, locale, labels = 6 }: { points: RadarPoint[]; categories: Category[]; locale: Locale; labels?: number }) {
  const cats = categories.filter((c) => points.some((p) => p.top === c.id));
  const n = Math.max(cats.length, 1);
  const sector = (2 * Math.PI) / n;
  const start = -Math.PI / 2;
  // Position by heat *rank* so the field stays readable even when scores bunch together.
  const order = [...points].sort((a, b) => b.heat - a.heat || a.id - b.id);
  const rankOf = new Map(order.map((p, i) => [p.id, points.length > 1 ? 1 - i / (points.length - 1) : 1]));
  const newest = new Set(
    [...points].filter((p) => p.listedAt).sort((a, b) => (b.listedAt! > a.listedAt! ? 1 : -1)).slice(0, 4).map((p) => p.id),
  );

  const placed = points.map((p) => {
    const i = Math.max(0, cats.findIndex((c) => c.id === p.top));
    const h = rankOf.get(p.id) ?? 0;
    const r = R_MIN + Math.pow(1 - h, 0.85) * (R_MAX - R_MIN - 18) + hash(p.id + 7) * 14;
    const ang = start + i * sector + (0.14 + hash(p.id) * 0.72) * sector;
    const [x, y] = polar(r, ang);
    const fresh = isFresh(p.listedAt);
    return { ...p, x, y, h, fresh, pulse: fresh && newest.has(p.id) };
  });
  // Label the hottest tool of each of the busiest sectors, so labels never pile up.
  const labelled = new Set<number>();
  const seenSector = new Set<number>();
  for (const p of [...placed].sort((a, b) => b.h - a.h)) {
    if (labelled.size >= labels) break;
    if (seenSector.has(p.top)) continue;
    // Skip a label that would sit on top of one already placed.
    if ([...labelled].some((id) => { const q = placed.find((x) => x.id === id)!; return Math.abs(q.y - p.y) < 18 && Math.abs(q.x - p.x) < 90; })) continue;
    seenSector.add(p.top);
    labelled.add(p.id);
  }

  const inset = `${((C - R_MAX) / SIZE) * 100}%`;
  return (
    <div className="relative">
    {/* Sweep on its own GPU layer (rotating inside the SVG would repaint the whole radar each frame). */}
    <div aria-hidden className="radar-sweep pointer-events-none absolute rounded-full" style={{ inset }} />
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={locale === "zh" ? "AI 工具雷达：按分类分布，越靠近中心热度越高" : "AI tool radar: by category, hotter tools closer to the centre"} className="relative h-auto w-full [will-change:transform]">
      <defs>
        <radialGradient id="radar-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(56 225 208 / 0.35)" />
          <stop offset="100%" stopColor="rgb(56 225 208 / 0)" />
        </radialGradient>
        <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(30 45 90 / 0.55)" />
          <stop offset="100%" stopColor="rgb(12 18 32 / 0)" />
        </radialGradient>
      </defs>

      <circle cx={C} cy={C} r={R_MAX + 8} fill="url(#radar-bg)" />
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <circle key={f} cx={C} cy={C} r={R_MAX * f} fill="none" stroke="rgb(140 160 220 / 0.16)" strokeDasharray={f === 1 ? undefined : "2 5"} />
      ))}
      {cats.map((c, i) => {
        const [x, y] = polar(R_MAX, start + i * sector);
        return <line key={c.id} x1={C} y1={C} x2={x} y2={y} stroke="rgb(140 160 220 / 0.09)" />;
      })}

      <circle cx={C} cy={C} r={30} fill="url(#radar-core)" />
      <circle cx={C} cy={C} r={3} fill="var(--accent)" />

      {cats.map((c, i) => {
        const mid = start + (i + 0.5) * sector;
        const [x, y] = polar(R_MAX + 22, mid);
        const anchor = Math.abs(Math.cos(mid)) < 0.3 ? "middle" : Math.cos(mid) > 0 ? "start" : "end";
        return (
          <a key={c.id} href={href(locale, `/category/${c.slug}`)}>
            <text x={x} y={y + 4} textAnchor={anchor} fontSize="12" fill="var(--muted)" className="hover:fill-[var(--ink)]">
              {L(c, "name", locale).replace(/^AI\s?/, "")}
            </text>
          </a>
        );
      })}

      {placed.map((p) => (
        <a key={p.id} href={href(locale, `/tool/${p.slug}`)}>
          <title>{p.name}</title>
          {p.pulse && <circle cx={p.x} cy={p.y} r={3} fill="none" stroke="var(--fresh)" strokeWidth="1.2" className="radar-blip" />}
          <circle cx={p.x} cy={p.y} r={10} fill="transparent" />
          {/* Glow as a soft halo circle: far cheaper than a CSS filter per dot. */}
          <circle cx={p.x} cy={p.y} r={6 + p.h * 7} fill={p.pulse ? "var(--fresh)" : heatColor(p.h)} opacity={0.12 + p.h * 0.1} />
          <circle cx={p.x} cy={p.y} r={2.6 + p.h * 3.4} fill={p.pulse ? "var(--fresh)" : heatColor(p.h)} />
          {labelled.has(p.id) && (
            <text
              x={p.x + (p.x >= C ? 9 : -9)}
              y={p.y + 4}
              textAnchor={p.x >= C ? "start" : "end"}
              fontSize="12"
              fontWeight="500"
              fill="var(--ink)"
              stroke="var(--canvas)"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {p.name}
            </text>
          )}
        </a>
      ))}
    </svg>
    </div>
  );
}
