import { github } from "./github";
import { htmlList } from "./htmlList";
import { huggingface } from "./huggingface";
import { productHunt } from "./producthunt";
import { rss } from "./rss";
import type { SourcePlugin } from "./types";

/** Add a new source type by writing a plugin and registering it here. */
export const plugins: Record<string, SourcePlugin> = {
  producthunt: productHunt,
  github,
  huggingface,
  rss,
  html_list: htmlList,
  manual: async () => [], // filled by the admin "Add tools" form
};

export type { RawCandidate, SourcePlugin } from "./types";
