import { describe, expect, it } from "vitest";
import { blend, bradleyTerry, initialPairs, refinePairs, rng, tieAtTop, toPBest, type Comparison } from "@/pipeline/pairwise";
import { parseAnswer } from "@/pipeline/jev";

/** Simulated judge with a known order: item 0 strongest. */
function simulate(n: number, pairs: [number, number][], noise = 0.1, seed = 7): Comparison[] {
  const r = rng(seed);
  const strength = Array.from({ length: n }, (_, i) => n - i);
  return pairs.map(([i, j]) => {
    const p = strength[i] / (strength[i] + strength[j]);
    return { i, j, p: Math.min(0.99, Math.max(0.01, p + (r() - 0.5) * noise)) };
  });
}

describe("bradleyTerry", () => {
  it("recovers a known order from a sparse schedule", () => {
    const n = 12;
    const pairs = initialPairs(n, 4, 3);
    const s = bradleyTerry(n, simulate(n, pairs));
    const order = s.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
    expect(order[0]).toBe(0);
    // Spearman-ish: most items within 2 places of their true rank.
    const close = order.filter((item, rank) => Math.abs(item - rank) <= 2).length;
    expect(close).toBeGreaterThanOrEqual(10);
  });

  it("stays finite when one item wins everything", () => {
    const s = bradleyTerry(3, [{ i: 0, j: 1, p: 1 }, { i: 0, j: 2, p: 1 }, { i: 1, j: 2, p: 0.5 }]);
    expect(s.every(Number.isFinite)).toBe(true);
    expect(s[0]).toBeGreaterThan(s[1]);
  });

  it("is order-invariant (cancelling position bias is the caller's job)", () => {
    const a = bradleyTerry(2, [{ i: 0, j: 1, p: 0.7 }]);
    const b = bradleyTerry(2, [{ i: 1, j: 0, p: 0.3 }]);
    expect(a[0] / a[1]).toBeCloseTo(b[0] / b[1], 6);
  });
});

describe("schedule and blending", () => {
  it("initial pairs connect every item", () => {
    const pairs = initialPairs(10, 4);
    const seen = new Set(pairs.flat());
    expect(seen.size).toBe(10);
  });

  it("refine asks neighbours not yet asked", () => {
    const asked = new Set(["0-1"]);
    const next = refinePairs([0, 1, 2, 3], asked, 2);
    expect(next).toEqual([[1, 2], [2, 3]]);
  });

  it("blends weighted P(best) and flags ties", () => {
    const b = blend([{ weight: 2, pBest: [0.6, 0.4] }, { weight: 1, pBest: [0.3, 0.7] }]);
    expect(b[0]).toBeCloseTo(0.5, 6);
    expect(tieAtTop(b)).toBe(true);
    expect(tieAtTop(toPBest([5, 1, 1]))).toBe(false);
  });
});

describe("Jev answer parsing", () => {
  it("uses probabilities when present, else choice + confidence", () => {
    expect(parseAnswer({ probabilities: { A: 0.8, B: 0.2 } }, ["A", "B"]).A).toBeCloseTo(0.8, 3);
    expect(parseAnswer({ choice: "B", confidence: 0.9 }, ["A", "B"]).B).toBeCloseTo(0.9, 3);
    expect(parseAnswer({ probabilities: [0.25, 0.75] }, ["A", "B"]).B).toBeCloseTo(0.75, 3);
  });
});
