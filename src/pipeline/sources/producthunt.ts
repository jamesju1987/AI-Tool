import { env } from "@/lib/env";
import { apiFetch } from "../http";
import type { SourcePlugin } from "./types";

/**
 * Product Hunt API v2 (GraphQL). Needs a developer token: https://api.producthunt.com/v2/docs
 * `website` is a Product Hunt redirect; the processor follows it to the real domain.
 */
export const productHunt: SourcePlugin = async (source, ctx) => {
  if (!env.productHuntToken) {
    ctx.log("PRODUCTHUNT_TOKEN not set, skipping");
    return [];
  }
  const cfg = source.config as { topic?: string; limit?: number };
  const query = `query($topic: String, $first: Int) {
    posts(order: NEWEST, topic: $topic, first: $first) {
      edges { node { id name tagline description website votesCount createdAt } }
    }
  }`;
  const res = await apiFetch("https://api.producthunt.com/v2/api/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${env.productHuntToken}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query, variables: { topic: cfg.topic ?? "artificial-intelligence", first: Math.min(cfg.limit ?? 40, 50) } }),
  });
  if (!res.ok) throw new Error(`Product Hunt HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(`Product Hunt: ${data.errors[0].message}`);
  type Node = { id: string; name: string; tagline: string; description?: string; website: string; votesCount: number };
  return (data.data?.posts?.edges ?? []).map(({ node }: { node: Node }) => ({
    externalId: `ph:${node.id}`,
    url: node.website,
    title: node.name,
    text: [node.tagline, node.description].filter(Boolean).join("\n"),
    signals: { productHuntVotes: node.votesCount },
  }));
};
