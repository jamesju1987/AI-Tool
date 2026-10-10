import { env } from "@/lib/env";
import { apiFetch } from "../http";
import type { RawCandidate, SourcePlugin } from "./types";

/** Recently created repos on AI topics, ranked by stars. Uses the project homepage when set. */
export const github: SourcePlugin = async (source, ctx) => {
  const cfg = source.config as { topics?: string[]; minStars?: number; days?: number; limit?: number };
  const since = new Date(Date.now() - (cfg.days ?? 14) * 86400_000).toISOString().slice(0, 10);
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "ai-toolbox-bot" };
  if (env.githubToken) headers.authorization = `Bearer ${env.githubToken}`;
  const seen = new Set<string>();
  const out: RawCandidate[] = [];
  for (const topic of cfg.topics ?? ["llm"]) {
    const q = `topic:${topic} created:>=${since} stars:>=${cfg.minStars ?? 100}`;
    const res = await apiFetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${Math.min(cfg.limit ?? 30, 100)}`, { headers });
    if (res.status === 403 || res.status === 429) {
      ctx.log(`GitHub rate limited on topic ${topic}; set GITHUB_TOKEN for higher limits`);
      break;
    }
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    const data = await res.json();
    type Repo = { id: number; full_name: string; name: string; description: string | null; homepage: string | null; html_url: string; stargazers_count: number };
    for (const r of (data.items ?? []) as Repo[]) {
      if (seen.has(r.full_name)) continue;
      seen.add(r.full_name);
      const homepage = r.homepage && /^https?:\/\//.test(r.homepage) ? r.homepage : null;
      out.push({
        externalId: `gh:${r.id}`,
        url: homepage ?? r.html_url,
        title: r.name,
        text: `${r.description ?? ""}\nGitHub: ${r.html_url}`,
        signals: { githubStars: r.stargazers_count },
      });
    }
  }
  return out;
};
