import { apiFetch } from "../http";
import type { SourcePlugin } from "./types";

/** Trending Hugging Face Spaces (demos). Off by default: many are experiments, not products. */
export const huggingface: SourcePlugin = async (source) => {
  const cfg = source.config as { sort?: string; limit?: number };
  const res = await apiFetch(`https://huggingface.co/api/spaces?sort=${encodeURIComponent(cfg.sort ?? "trendingScore")}&direction=-1&limit=${Math.min(cfg.limit ?? 30, 100)}`);
  if (!res.ok) throw new Error(`Hugging Face HTTP ${res.status}`);
  const items = (await res.json()) as { id: string; likes?: number; cardData?: { title?: string; short_description?: string } }[];
  return items.map((s) => ({
    externalId: `hf:${s.id}`,
    url: `https://huggingface.co/spaces/${s.id}`,
    title: s.cardData?.title ?? s.id.split("/")[1] ?? s.id,
    text: s.cardData?.short_description ?? "",
    signals: { hfLikes: s.likes ?? 0 },
  }));
};
