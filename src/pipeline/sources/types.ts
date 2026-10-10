import type { Signals, Source } from "@/db/schema";

export type RawCandidate = {
  externalId?: string;
  /** The product's own website if known; otherwise a page that links to it. */
  url: string;
  title: string;
  text?: string;
  signals?: Signals;
};

export type SourceContext = { log: (msg: string) => void };

export type SourcePlugin = (source: Source, ctx: SourceContext) => Promise<RawCandidate[]>;
