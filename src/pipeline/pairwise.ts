/**
 * Pairwise ranking, following pairsort's method (Bradley–Terry over calibrated pairwise
 * probabilities, both orders asked to cancel position bias, several questions blended).
 * Pure functions here; the job in jobs/rank.ts does I/O.
 */

/** Soft comparison: p = P(i beats j) after averaging both orders. */
export type Comparison = { i: number; j: number; p: number };

/** Bradley–Terry strengths by MM iterations, with a weak prior so sparse graphs stay finite. */
export function bradleyTerry(n: number, comps: Comparison[], iters = 200, prior = 0.5): number[] {
  if (n === 0) return [];
  let s = new Array(n).fill(1);
  const wins = new Array(n).fill(0);
  const pairs = new Map<string, { i: number; j: number; n: number }>();
  for (const c of comps) {
    wins[c.i] += c.p;
    wins[c.j] += 1 - c.p;
    const key = c.i < c.j ? `${c.i}-${c.j}` : `${c.j}-${c.i}`;
    const e = pairs.get(key) ?? { i: Math.min(c.i, c.j), j: Math.max(c.i, c.j), n: 0 };
    e.n += 1;
    pairs.set(key, e);
  }
  for (let it = 0; it < iters; it++) {
    const denom = new Array(n).fill(0);
    for (const { i, j, n: nij } of pairs.values()) {
      const d = nij / (s[i] + s[j]);
      denom[i] += d;
      denom[j] += d;
    }
    // prior: each item played `2*prior` games against a virtual item of strength 1, winning half.
    const next = s.map((si, i) => (wins[i] + prior) / (denom[i] + (2 * prior) / (si + 1)));
    const g = Math.exp(next.reduce((a, b) => a + Math.log(b), 0) / n); // geometric-mean normalise
    const normed = next.map((x) => x / g);
    const delta = normed.reduce((m, x, k) => Math.max(m, Math.abs(x - s[k])), 0);
    s = normed;
    if (delta < 1e-9) break;
  }
  return s;
}

/** Strengths → probability of being the best (sums to 1). */
export function toPBest(strengths: number[]): number[] {
  const sum = strengths.reduce((a, b) => a + b, 0) || 1;
  return strengths.map((x) => x / sum);
}

/** Blend per-question P(best) vectors by weight. */
export function blend(perQuestion: { weight: number; pBest: number[] }[]): number[] {
  const n = perQuestion[0]?.pBest.length ?? 0;
  const total = perQuestion.reduce((a, q) => a + q.weight, 0) || 1;
  return Array.from({ length: n }, (_, i) => perQuestion.reduce((a, q) => a + q.weight * q.pBest[i], 0) / total);
}

/** Deterministic PRNG so schedules are reproducible in tests. */
export function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/**
 * Pair schedule. Round 1 connects the graph (a ring plus random partners); later rounds
 * ask about neighbours in the current order, where the ranking is least certain.
 */
export function initialPairs(n: number, perItem: number, seed = 1): [number, number][] {
  const rand = rng(seed);
  const set = new Set<string>();
  const out: [number, number][] = [];
  const add = (a: number, b: number) => {
    if (a === b) return;
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (set.has(k)) return;
    set.add(k);
    out.push([a, b]);
  };
  for (let i = 0; i < n; i++) add(i, (i + 1) % n);
  const extra = Math.max(0, Math.min(perItem, n - 1) - 2);
  for (let i = 0; i < n; i++) for (let k = 0; k < extra; k++) add(i, Math.floor(rand() * n));
  return out;
}

export function refinePairs(order: number[], asked: Set<string>, budget: number): [number, number][] {
  const out: [number, number][] = [];
  for (const gap of [1, 2, 3]) {
    for (let r = 0; r + gap < order.length && out.length < budget; r++) {
      const a = order[r], b = order[r + gap];
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (asked.has(k)) continue;
      asked.add(k);
      out.push([a, b]);
    }
  }
  return out;
}

/** Top two too close to call? (relative gap in P(best) under `margin`). */
export function tieAtTop(pBest: number[], margin = 0.1) {
  const sorted = [...pBest].sort((a, b) => b - a);
  return sorted.length >= 2 && sorted[0] > 0 && (sorted[0] - sorted[1]) / sorted[0] < margin;
}
