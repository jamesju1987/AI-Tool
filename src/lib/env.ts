/**
 * Central place for environment configuration. Everything optional has a safe default
 * so the site and pipeline run locally with no API keys (mock mode).
 */
function bool(v: string | undefined, d = false) {
  if (v === undefined || v === "") return d;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/aitoolbox",
  siteUrl: (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  siteNameZh: process.env.SITE_NAME_ZH ?? "AI 工具箱",
  siteNameEn: process.env.SITE_NAME_EN ?? "AI Toolbox",
  isProd: process.env.NODE_ENV === "production",

  // Models (OpenRouter, OpenAI-compatible)
  openrouterKey: process.env.OPENROUTER_API_KEY ?? "",
  openrouterBase: (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api").replace(/\/$/, ""),
  llmModel: process.env.LLM_MODEL ?? "deepseek/deepseek-v4.1-flash",
  jevModel: process.env.JEV_MODEL ?? "typesafe/jev-1.13",
  /** "decisions" -> /alpha/decisions, "systemone" -> /v1/systemone (same wire format). */
  jevSurface: process.env.JEV_SURFACE === "systemone" ? "systemone" : "decisions",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "",
  /** Force offline heuristics even when keys exist (tests, local dev). */
  mockAi: bool(process.env.MOCK_AI, !process.env.OPENROUTER_API_KEY),

  // Sources
  productHuntToken: process.env.PRODUCTHUNT_TOKEN ?? "",
  githubToken: process.env.GITHUB_TOKEN ?? "",

  // Safety
  safeBrowsingKey: process.env.SAFE_BROWSING_API_KEY ?? "",
  fetchUserAgent:
    process.env.FETCH_USER_AGENT ?? "AIToolboxBot/1.0 (+https://example.com/bot; respects robots.txt)",

  // Admin
  sessionHours: Number(process.env.ADMIN_SESSION_HOURS ?? 12),
  adminIpAllowlist: (process.env.ADMIN_IP_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  revalidateSecret: process.env.REVALIDATE_SECRET ?? "",
  notifyWebhook: process.env.NOTIFY_WEBHOOK_URL ?? "",
  timezone: process.env.TZ_SCHEDULE ?? "Asia/Shanghai",
};
