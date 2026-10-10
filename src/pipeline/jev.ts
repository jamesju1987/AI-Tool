import { z } from "zod";
import { env } from "@/lib/env";
import { apiFetch } from "./http";
import { chatJson } from "./llm";

/**
 * Jev (TypeSafe's System One decision model) via OpenRouter.
 *
 * Wire format (same on /api/alpha/decisions and /api/v1/systemone):
 *   request  { model, state, questions: { key: { type: "choice", instructions, criteria: { option: description } } } }
 *   response { answers: { key: { choice, confidence, probabilities: { option: p } } }, usage: { input_tokens, cost } }
 * All questions about one state go in one request (Jev reads the state once), up to 64 per call.
 *
 * Fallbacks: a generic LLM asked for a verbalised distribution, or an offline mock.
 */

export type Question = { instructions: string; criteria: Record<string, string> };
export type Answers = Record<string, Record<string, number>>;

export interface Judge {
  name: string;
  decide(state: unknown, questions: Record<string, Question>): Promise<Answers>;
}

export const jevUsage = { requests: 0, questions: 0, inputTokens: 0, costUsd: 0 };

const MAX_Q = 64;

function normalise(probs: Record<string, number>, options: string[]): Record<string, number> {
  const vals = options.map((o) => Math.max(Number(probs[o] ?? 0), 1e-4));
  const sum = vals.reduce((a, b) => a + b, 0);
  return Object.fromEntries(options.map((o, i) => [o, vals[i] / sum]));
}

export function parseAnswer(ans: { probabilities?: unknown; choice?: string; confidence?: number } | undefined, options: string[]) {
  if (!ans) throw new Error("missing answer");
  const p = ans.probabilities;
  if (p && typeof p === "object" && !Array.isArray(p)) return normalise(p as Record<string, number>, options);
  if (Array.isArray(p)) return normalise(Object.fromEntries(options.map((o, i) => [o, Number(p[i] ?? 0)])), options);
  const conf = Number(ans.confidence ?? 1);
  const rest = (1 - conf) / Math.max(1, options.length - 1);
  return Object.fromEntries(options.map((o) => [o, o === ans.choice ? conf : rest]));
}

export class JevJudge implements Judge {
  name = `jev:${env.jevModel}`;
  private path = env.jevSurface === "systemone" ? "/v1/systemone" : "/alpha/decisions";

  async decide(state: unknown, questions: Record<string, Question>): Promise<Answers> {
    const keys = Object.keys(questions);
    const out: Answers = {};
    for (let i = 0; i < keys.length; i += MAX_Q) {
      const chunk = Object.fromEntries(keys.slice(i, i + MAX_Q).map((k) => [k, { type: "choice", ...questions[k] }]));
      const data = await this.call({ model: env.jevModel, state, questions: chunk });
      for (const k of Object.keys(chunk)) out[k] = parseAnswer(data.answers?.[k], Object.keys(questions[k].criteria));
    }
    return out;
  }

  private async call(body: unknown) {
    let delay = 1000;
    let last = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await apiFetch(`${env.openrouterBase}${this.path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${env.openrouterKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      }, 120_000);
      if ([429, 500, 502, 503, 504].includes(res.status)) {
        last = `HTTP ${res.status}`;
        await new Promise((r) => setTimeout(r, delay + Math.random() * delay));
        delay = Math.min(delay * 2, 30_000);
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 404 "No allowed providers" = OpenRouter privacy settings block the TypeSafe provider.
        throw new Error(`Jev HTTP ${res.status}: ${data?.error?.message ?? JSON.stringify(data).slice(0, 200)}`);
      }
      jevUsage.requests++;
      jevUsage.questions += Object.keys((body as { questions: object }).questions).length;
      jevUsage.inputTokens += Number(data.usage?.input_tokens ?? 0);
      jevUsage.costUsd += Number(data.usage?.cost ?? 0);
      return data as { answers: Record<string, { probabilities?: unknown; choice?: string; confidence?: number }> };
    }
    throw new Error(`Jev request failed: ${last}`);
  }
}

/** Any chat model as a judge (verbalised probabilities). Less calibrated than Jev. */
export class LlmJudge implements Judge {
  name = `llm:${env.llmModel}`;
  async decide(state: unknown, questions: Record<string, Question>): Promise<Answers> {
    const out: Answers = {};
    const stateText = typeof state === "string" ? state : JSON.stringify(state, null, 1);
    for (const [k, q] of Object.entries(questions)) {
      const options = Object.keys(q.criteria);
      const schema = z.record(z.string(), z.number());
      const res = await chatJson({
        system: "You are a fast, calibrated judge. Decide using only the evidence in the data. Judge substance, not length, style or position.",
        instructions: `Question: ${q.instructions}\nOptions:\n${options.map((o) => `${o}: ${q.criteria[o]}`).join("\n")}\nReturn a JSON object mapping every option key to your probability that it is correct (sum to 1).`,
        data: stateText.slice(0, 12000),
        schema,
        maxTokens: 200,
      });
      out[k] = normalise(res, options);
    }
    return out;
  }
}

/** Deterministic offline judge; `fn` supplies a heuristic probability for the first option. */
export class MockJudge implements Judge {
  name = "mock";
  constructor(private fn?: (key: string, q: Question, state: unknown) => number) {}
  async decide(state: unknown, questions: Record<string, Question>): Promise<Answers> {
    const out: Answers = {};
    for (const [k, q] of Object.entries(questions)) {
      const options = Object.keys(q.criteria);
      const p = Math.min(0.99, Math.max(0.01, this.fn?.(k, q, state) ?? 0.5));
      out[k] = options.length === 2 ? { [options[0]]: p, [options[1]]: 1 - p } : normalise(Object.fromEntries(options.map((o) => [o, 1])), options);
    }
    return out;
  }
}

/** Jev when available, else the LLM fallback; the switch is logged once per process. */
export class FallbackJudge implements Judge {
  private primaryFailed = false;
  constructor(private primary: Judge, private fallback: Judge, private warn: (m: string) => void = console.warn) {}
  get name() {
    return this.primaryFailed ? this.fallback.name : this.primary.name;
  }
  async decide(state: unknown, questions: Record<string, Question>) {
    if (!this.primaryFailed) {
      try {
        return await this.primary.decide(state, questions);
      } catch (e) {
        this.primaryFailed = true;
        this.warn(`Jev unavailable, falling back to ${this.fallback.name}: ${(e as Error).message}`);
      }
    }
    return this.fallback.decide(state, questions);
  }
}

export function getJudge(mockFn?: ConstructorParameters<typeof MockJudge>[0], warn?: (m: string) => void): Judge {
  if (env.mockAi) return new MockJudge(mockFn);
  return new FallbackJudge(new JevJudge(), new LlmJudge(), warn);
}
